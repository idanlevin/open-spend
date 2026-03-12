import Dexie, { type EntityTable } from 'dexie'
import type {
  AppSetting,
  AuditLog,
  Category,
  CategoryAlias,
  ImportBatch,
  ImportedFile,
  MerchantMapping,
  Rule,
  SavedView,
  Statement,
  Tag,
  TransactionNormalized,
  TransactionOverride,
  TransactionRaw,
  TransactionTag,
} from '@/types/domain'

export class OpenSpendDb extends Dexie {
  imports!: EntityTable<ImportBatch, 'importBatchId'>
  files!: EntityTable<ImportedFile, 'fileId'>
  statements!: EntityTable<Statement, 'statementId'>
  transactionsRaw!: EntityTable<TransactionRaw, 'rawId'>
  transactionsNormalized!: EntityTable<TransactionNormalized, 'transactionId'>
  transactionOverrides!: EntityTable<TransactionOverride, 'transactionId'>
  categories!: EntityTable<Category, 'categoryId'>
  categoryAliases!: EntityTable<CategoryAlias, 'aliasId'>
  tags!: EntityTable<Tag, 'tagId'>
  transactionTags!: EntityTable<TransactionTag, 'id'>
  rules!: EntityTable<Rule, 'ruleId'>
  merchantMappings!: EntityTable<MerchantMapping, 'mappingId'>
  savedViews!: EntityTable<SavedView, 'viewId'>
  appSettings!: EntityTable<AppSetting, 'key'>
  auditLog!: EntityTable<AuditLog, 'id'>

  constructor() {
    super('open_spend_db')
    this.version(1).stores({
      imports: 'importBatchId, importedAt',
      files: 'fileId, fileHash, importBatchId, parseStatus, importedAt',
      statements:
        'statementId, sourceFileId, statementStartDate, statementEndDate, preparedFor, importedAt',
      transactionsRaw: 'rawId, statementId, sourceFileId, sourceRowFingerprint, importBatchId',
      transactionsNormalized:
        'transactionId, statementId, transactionDate, merchantNormalized, categoryIdResolved, sourceRowFingerprint, duplicateGroupKey, importBatchId',
      transactionOverrides: 'transactionId, updatedAt',
      categories: 'categoryId, name, sortOrder, isHidden',
      categoryAliases: 'aliasId, rawCategory, categoryId',
      tags: 'tagId, name, isArchived',
      transactionTags: 'id, transactionId, tagId',
      rules: 'ruleId, enabled, priority',
      merchantMappings: 'mappingId, merchantRaw, merchantNormalized',
      savedViews: 'viewId, page, name, createdAt',
      appSettings: 'key',
      auditLog: 'id, eventType, createdAt',
    })
  }
}

export const db = new OpenSpendDb()

export async function deleteLegacyDatabases(): Promise<void> {
  // User requested old Ledger Lens DB removal after rename.
  await Dexie.delete('ledger_lens_db')
}
