import { db } from '@/lib/storage/db'
import { parseAmexWorkbook } from '@/lib/parsing/amex-parser'
import { normalizeTransaction } from '@/lib/normalization/transaction'
import { applyRuleActions, transactionMatchesRule } from '@/lib/rules/engine'
import { PARSE_VERSION, nowIso, randomId, sha256Hex } from '@/lib/utils'
import type {
  ImportBatch,
  ImportedFile,
  Statement,
  TransactionOverride,
  TransactionRaw,
  TransactionTag,
} from '@/types/domain'

export interface ImportIssue {
  fileName: string
  level: 'warning' | 'error'
  message: string
}

export interface ImportSummary {
  importBatch: ImportBatch
  issues: ImportIssue[]
  newMerchants: string[]
  uncategorizedCount: number
}

async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  return sha256Hex(buffer)
}

function isSpreadsheet(file: File): boolean {
  return file.name.toLowerCase().endsWith('.xlsx')
}

export async function importStatementFiles(
  files: File[],
  folderLabel: string,
): Promise<ImportSummary> {
  const importBatchId = randomId('import')
  const importedAt = nowIso()
  const issues: ImportIssue[] = []
  const newMerchants = new Set<string>()

  const aliases = await db.categoryAliases.toArray()
  const rules = (await db.rules.toArray()).filter((rule) => rule.enabled).sort((a, b) => a.priority - b.priority)
  const merchantMappings = await db.merchantMappings.toArray()
  const allTags = await db.tags.toArray()
  const merchantMap = new Map<string, string>()
  merchantMappings.forEach((mapping) => {
    merchantMap.set(mapping.merchantRaw.toLowerCase(), mapping.merchantNormalized)
    merchantMap.set(mapping.merchantNormalized.toLowerCase(), mapping.merchantNormalized)
  })

  const tagIdByName = new Map(allTags.map((tag) => [tag.name.toLowerCase(), tag.tagId]))
  const existingMerchants = new Set((await db.transactionsNormalized.toArray()).map((tx) => tx.merchantNormalized))

  let statementsCount = 0
  let transactionsAdded = 0
  let duplicatesSkipped = 0
  let warningsCount = 0
  let uncategorizedCount = 0

  const spreadsheetFiles = files.filter(isSpreadsheet)

  for (const file of spreadsheetFiles) {
      const fileHash = await hashFile(file)
      const existingByHash = await db.files.where('fileHash').equals(fileHash).first()
      const fileId = `file_${fileHash.slice(0, 24)}`

      if (existingByHash) {
        duplicatesSkipped += 1
        await db.files.put({
          fileId,
          importBatchId,
          fileName: file.name,
          filePathHint: file.webkitRelativePath || file.name,
          fileHash,
          sizeBytes: file.size,
          lastModified: file.lastModified,
          importedAt,
          parseStatus: 'skipped_duplicate',
          parseWarnings: ['File hash already exists in workspace.'],
        })
        continue
      }

      let parseWarnings: string[] = []
      try {
        const parsed = parseAmexWorkbook(await file.arrayBuffer())
        parseWarnings = parsed.warnings
        warningsCount += parseWarnings.length

        const statementSignature = await sha256Hex(
          [
            fileHash,
            parsed.metadata.statementStartDate,
            parsed.metadata.statementEndDate,
            parsed.metadata.accountNumberMasked,
          ].join('|'),
        )
        const statementId = `stmt_${statementSignature.slice(0, 24)}`

        const statement: Statement = {
          statementId,
          sourceFileId: fileId,
          cardProductName: parsed.metadata.cardProductName,
          preparedFor: parsed.metadata.preparedFor,
          accountNumberMasked: parsed.metadata.accountNumberMasked,
          statementStartDate: parsed.metadata.statementStartDate,
          statementEndDate: parsed.metadata.statementEndDate,
          currency: parsed.metadata.currency || 'USD',
          importedAt,
          fileHash,
          parseVersion: PARSE_VERSION,
        }

        const existingStatement = await db.statements.get(statementId)
        if (!existingStatement) {
          await db.statements.put(statement)
          statementsCount += 1
        } else {
          issues.push({
            fileName: file.name,
            level: 'warning',
            message: 'Statement with matching fingerprint already existed.',
          })
        }

        for (const row of parsed.rows) {
          const normalized = await normalizeTransaction({
            statementId,
            importBatchId,
            statementStartDate: statement.statementStartDate,
            statementEndDate: statement.statementEndDate,
            categoryAliases: aliases,
            row,
          })
          const merchantOverride =
            merchantMap.get(normalized.merchantRaw.toLowerCase()) ??
            merchantMap.get(normalized.merchantNormalized.toLowerCase())
          if (merchantOverride) {
            normalized.merchantNormalized = merchantOverride
          }

          if (normalized.categoryIdResolved === 'cat_uncategorized') {
            uncategorizedCount += 1
          }

          const existingTransaction = await db.transactionsNormalized.get(normalized.transactionId)
          if (existingTransaction) {
            duplicatesSkipped += 1
            continue
          }

          const raw: TransactionRaw = {
            rawId: randomId('raw'),
            statementId,
            sourceFileId: fileId,
            rowIndex: row.rowIndex,
            rawData: {
              ...row,
            },
            sourceRowFingerprint: normalized.sourceRowFingerprint,
            importBatchId,
          }

          const overridesFromRules: TransactionOverride = {
            transactionId: normalized.transactionId,
            updatedAt: importedAt,
          }
          const transactionTags: TransactionTag[] = []
          const appliedRuleIds: string[] = []

          let ruled = normalized
          for (const rule of rules) {
            if (!transactionMatchesRule(ruled, rule)) continue
            appliedRuleIds.push(rule.ruleId)
            const result = applyRuleActions(ruled, rule.actions)
            ruled = result.transaction
            if (result.isBusiness !== undefined) overridesFromRules.isBusiness = result.isBusiness
            if (result.isReimbursable !== undefined) {
              overridesFromRules.isReimbursable = result.isReimbursable
            }
            if (result.isExcludedFromAnalytics !== undefined) {
              overridesFromRules.isExcludedFromAnalytics = result.isExcludedFromAnalytics
            }
            result.tagsToAdd.forEach((tagToken) => {
              const tagId = tagIdByName.get(tagToken.toLowerCase()) ?? tagToken
              transactionTags.push({
                id: randomId('tt'),
                transactionId: ruled.transactionId,
                tagId,
              })
            })
          }
          ruled.appliedRuleIds = appliedRuleIds

          await db.transactionsRaw.put(raw)
          await db.transactionsNormalized.put(ruled)
          if (appliedRuleIds.length > 0 || Object.keys(overridesFromRules).length > 2) {
            await db.transactionOverrides.put(overridesFromRules)
          }
          if (transactionTags.length) {
            await db.transactionTags.bulkPut(transactionTags)
          }

          if (!existingMerchants.has(ruled.merchantNormalized)) {
            existingMerchants.add(ruled.merchantNormalized)
            newMerchants.add(ruled.merchantNormalized)
          }

          transactionsAdded += 1
        }

        const fileRecord: ImportedFile = {
          fileId,
          importBatchId,
          fileName: file.name,
          filePathHint: file.webkitRelativePath || file.name,
          fileHash,
          sizeBytes: file.size,
          lastModified: file.lastModified,
          importedAt,
          parseStatus: 'parsed',
          parseWarnings,
        }
        await db.files.put(fileRecord)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown parse error'
        warningsCount += 1
        issues.push({
          fileName: file.name,
          level: 'error',
          message,
        })
        await db.files.put({
          fileId,
          importBatchId,
          fileName: file.name,
          filePathHint: file.webkitRelativePath || file.name,
          fileHash,
          sizeBytes: file.size,
          lastModified: file.lastModified,
          importedAt,
          parseStatus: 'error',
          parseWarnings: [],
          parseError: message,
        })
      }
  }

  const importBatch: ImportBatch = {
    importBatchId,
    importedAt,
    folderLabel,
    fileCount: spreadsheetFiles.length,
    statementsCount,
    transactionsAdded,
    duplicatesSkipped,
    warningsCount,
  }
  await db.imports.put(importBatch)

  return {
    importBatch: {
      importBatchId,
      importedAt,
      folderLabel,
      fileCount: spreadsheetFiles.length,
      statementsCount,
      transactionsAdded,
      duplicatesSkipped,
      warningsCount,
    },
    issues,
    newMerchants: [...newMerchants].sort(),
    uncategorizedCount,
  }
}
