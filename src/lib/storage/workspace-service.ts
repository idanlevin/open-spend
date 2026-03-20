import { db, deleteLegacyDatabases } from '@/lib/storage/db'
import { STARTER_TAGS, SYSTEM_CATEGORIES } from '@/lib/storage/seeds'
import { classifyTransactionKind } from '@/lib/normalization/transaction-kind'
import { normalizeMerchantName } from '@/lib/normalization/merchant'
import { normalizeTransaction } from '@/lib/normalization/transaction'
import { applyRuleActions, resolveRuleActions, transactionMatchesRule } from '@/lib/rules/engine'
import { randomId } from '@/lib/utils'
import type { ParsedTransactionRow } from '@/lib/parsing/types'
import type {
  Category,
  CategoryAlias,
  EnrichedTransaction,
  RecurringCategoryOverrideMap,
  RecurringDecision,
  RecurringDecisionMap,
  Rule,
  Statement,
  Tag,
  TransactionNormalized,
  TransactionOverride,
  TransactionTag,
} from '@/types/domain'

export interface WorkspaceSnapshot {
  statements: Statement[]
  transactions: EnrichedTransaction[]
  categories: Category[]
  tags: Tag[]
  rules: Rule[]
  recurringDecisions: RecurringDecisionMap
  recurringCategoryOverrides: RecurringCategoryOverrideMap
}

const RECURRING_DECISIONS_KEY = 'recurring.decisions.v1'
const RECURRING_CATEGORY_OVERRIDES_KEY = 'recurring.category-overrides.v1'
export const REVERTABLE_TRANSACTION_EDIT_FIELDS = [
  'merchantOverride',
  'categoryOverrideId',
  'notes',
] as const
export type RevertableTransactionEditField = (typeof REVERTABLE_TRANSACTION_EDIT_FIELDS)[number]

export function normalizeRecurringDecisionKey(merchant: string): string {
  return merchant.trim().toLowerCase()
}

function normalizeRecurringDecisionMap(raw: unknown): RecurringDecisionMap {
  if (!raw || typeof raw !== 'object') return {}
  const entries = Object.entries(raw as Record<string, unknown>).flatMap(([key, value]) => {
    if (!value || typeof value !== 'object') return []
    const candidate = value as Partial<{ decision: RecurringDecision; updatedAt: string }>
    if (candidate.decision !== 'confirmed' && candidate.decision !== 'ignored') return []
    const normalizedKey = normalizeRecurringDecisionKey(key)
    if (!normalizedKey) return []
    return [
      [
        normalizedKey,
        {
          decision: candidate.decision,
          updatedAt:
            typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
        },
      ] satisfies [string, RecurringDecisionMap[string]],
    ]
  })
  return Object.fromEntries(entries)
}

export async function loadRecurringDecisions(): Promise<RecurringDecisionMap> {
  const row = await db.appSettings.get(RECURRING_DECISIONS_KEY)
  if (!row) return {}
  try {
    return normalizeRecurringDecisionMap(JSON.parse(row.value))
  } catch {
    return {}
  }
}

export async function setRecurringMerchantDecision(
  merchant: string,
  decision: RecurringDecision | null,
): Promise<void> {
  const key = normalizeRecurringDecisionKey(merchant)
  if (!key) return
  const current = await loadRecurringDecisions()
  if (decision == null) {
    delete current[key]
  } else {
    current[key] = {
      decision,
      updatedAt: new Date().toISOString(),
    }
  }
  if (Object.keys(current).length === 0) {
    await db.appSettings.delete(RECURRING_DECISIONS_KEY)
    return
  }
  await db.appSettings.put({
    key: RECURRING_DECISIONS_KEY,
    value: JSON.stringify(current),
  })
}

function normalizeRecurringCategoryOverrideMap(raw: unknown): RecurringCategoryOverrideMap {
  if (!raw || typeof raw !== 'object') return {}
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).flatMap(([key, value]) => {
      const normalizedKey = normalizeRecurringDecisionKey(key)
      if (!normalizedKey) return []
      if (typeof value !== 'string' || value.trim().length === 0) return []
      return [[normalizedKey, value]]
    }),
  )
}

export async function loadRecurringCategoryOverrides(): Promise<RecurringCategoryOverrideMap> {
  const row = await db.appSettings.get(RECURRING_CATEGORY_OVERRIDES_KEY)
  if (!row) return {}
  try {
    return normalizeRecurringCategoryOverrideMap(JSON.parse(row.value))
  } catch {
    return {}
  }
}

export async function setRecurringMerchantCategoryOverride(
  merchant: string,
  categoryId: string | null,
): Promise<void> {
  const key = normalizeRecurringDecisionKey(merchant)
  if (!key) return
  const current = await loadRecurringCategoryOverrides()
  if (!categoryId) {
    delete current[key]
  } else {
    current[key] = categoryId
  }
  if (Object.keys(current).length === 0) {
    await db.appSettings.delete(RECURRING_CATEGORY_OVERRIDES_KEY)
    return
  }
  await db.appSettings.put({
    key: RECURRING_CATEGORY_OVERRIDES_KEY,
    value: JSON.stringify(current),
  })
}

export async function initializeWorkspace(): Promise<void> {
  await deleteLegacyDatabases()

  const categoryCount = await db.categories.count()
  if (categoryCount === 0) {
    await db.categories.bulkPut(SYSTEM_CATEGORIES)
  }

  const tagCount = await db.tags.count()
  if (tagCount === 0) {
    await db.tags.bulkPut(STARTER_TAGS)
  }
}

function applyOverrides(
  tx: TransactionNormalized,
  override: TransactionOverride | undefined,
  categoriesById: Map<string, Category>,
  tagsById: Map<string, Tag>,
  links: TransactionTag[],
): EnrichedTransaction {
  const inferredKind = classifyTransactionKind({
    amount: tx.amount,
    descriptionRaw: tx.descriptionRaw,
    statementDescriptor: tx.statementDescriptor,
    amexCategoryRaw: tx.amexCategoryRaw,
  })
  const transactionKind = tx.transactionKind ?? inferredKind
  const merchantFinal = override?.merchantOverride || tx.merchantNormalized
  const categoryIdResolvedEffective =
    tx.categoryIdResolved === 'cat_uncategorized' && transactionKind === 'payment'
      ? 'cat_transfers_credits'
      : tx.categoryIdResolved
  const categoryFinalId = override?.categoryOverrideId || categoryIdResolvedEffective
  const categoryFinalName = categoriesById.get(categoryFinalId)?.name ?? 'Uncategorized'
  const resolvedTags = links
    .map((link) => tagsById.get(link.tagId))
    .filter((tag): tag is Tag => Boolean(tag))

  return {
    ...tx,
    transactionKind,
    isRefund: transactionKind === 'refund',
    isPayment: transactionKind === 'payment',
    merchantFinal,
    categoryFinalId,
    categoryFinalName,
    notes: override?.notes ?? '',
    tags: resolvedTags,
    isExcludedFromAnalytics: override?.isExcludedFromAnalytics ?? false,
    isBusiness: override?.isBusiness ?? false,
    isReimbursable: override?.isReimbursable ?? false,
    splitDefinition: override?.splitDefinition,
    manualOverride: override,
  }
}

export async function loadWorkspaceSnapshot(): Promise<WorkspaceSnapshot> {
  const [
    transactions,
    overrides,
    categories,
    tags,
    links,
    statements,
    rules,
    recurringDecisions,
    recurringCategoryOverrides,
  ] =
    await Promise.all([
    db.transactionsNormalized.toArray(),
    db.transactionOverrides.toArray(),
    db.categories.orderBy('sortOrder').toArray(),
    db.tags.toArray(),
    db.transactionTags.toArray(),
    db.statements.orderBy('statementEndDate').reverse().toArray(),
    db.rules.orderBy('priority').toArray(),
      loadRecurringDecisions(),
      loadRecurringCategoryOverrides(),
    ])

  const overrideById = new Map(overrides.map((override) => [override.transactionId, override]))
  const categoryById = new Map(categories.map((category) => [category.categoryId, category]))
  const tagById = new Map(tags.map((tag) => [tag.tagId, tag]))
  const linksByTxn = new Map<string, TransactionTag[]>()
  links.forEach((link) => {
    const list = linksByTxn.get(link.transactionId) ?? []
    list.push(link)
    linksByTxn.set(link.transactionId, list)
  })

  const enriched = transactions.map((transaction) =>
    applyOverrides(
      transaction,
      overrideById.get(transaction.transactionId),
      categoryById,
      tagById,
      linksByTxn.get(transaction.transactionId) ?? [],
    ),
  )

  return {
    statements,
    transactions: enriched,
    categories,
    tags,
    rules,
    recurringDecisions,
    recurringCategoryOverrides,
  }
}

export async function upsertTransactionOverride(
  transactionId: string,
  patch: Partial<TransactionOverride>,
): Promise<void> {
  const existing = await db.transactionOverrides.get(transactionId)
  await db.transactionOverrides.put({
    transactionId,
    updatedAt: new Date().toISOString(),
    ...existing,
    ...patch,
  })
  await db.transactionsNormalized.update(transactionId, {
    hasManualOverride: true,
  })
}

export async function revertTransactionEdits(
  transactionId: string,
  fields: RevertableTransactionEditField[] = [...REVERTABLE_TRANSACTION_EDIT_FIELDS],
): Promise<void> {
  const existing = await db.transactionOverrides.get(transactionId)
  if (!existing) {
    await db.transactionsNormalized.update(transactionId, { hasManualOverride: false })
    return
  }

  const next: TransactionOverride = {
    ...existing,
    updatedAt: new Date().toISOString(),
  }
  fields.forEach((field) => {
    delete (next as Partial<TransactionOverride>)[field]
  })

  const hasAnyOverride =
    next.merchantOverride !== undefined ||
    next.categoryOverrideId !== undefined ||
    (typeof next.notes === 'string' && next.notes.trim().length > 0) ||
    next.splitDefinition !== undefined ||
    next.isExcludedFromAnalytics !== undefined ||
    next.isReimbursable !== undefined ||
    next.isBusiness !== undefined

  if (hasAnyOverride) {
    await db.transactionOverrides.put(next)
  } else {
    await db.transactionOverrides.delete(transactionId)
  }

  const hasManualEditsLeft =
    next.merchantOverride !== undefined ||
    next.categoryOverrideId !== undefined ||
    (typeof next.notes === 'string' && next.notes.trim().length > 0) ||
    next.splitDefinition !== undefined
  await db.transactionsNormalized.update(transactionId, { hasManualOverride: hasManualEditsLeft })
}

export async function setTransactionTags(transactionId: string, tagIds: string[]): Promise<void> {
  await db.transaction('rw', db.transactionTags, async () => {
    await db.transactionTags.where('transactionId').equals(transactionId).delete()
    if (tagIds.length > 0) {
      await db.transactionTags.bulkPut(
        tagIds.map((tagId) => ({
          id: randomId('tt'),
          transactionId,
          tagId,
        })),
      )
    }
  })
}

export async function renameMerchantEverywhere(rawMerchant: string, normalizedName: string): Promise<void> {
  const normalized = normalizeMerchantName(normalizedName)
  const transactions = await db.transactionsNormalized
    .where('merchantNormalized')
    .equals(rawMerchant)
    .toArray()
  await Promise.all(
    transactions.map((tx) =>
      upsertTransactionOverride(tx.transactionId, {
        merchantOverride: normalized,
      }),
    ),
  )
  const aliases = new Set(transactions.map((tx) => tx.merchantRaw))
  aliases.add(rawMerchant)
  await Promise.all(
    [...aliases].map((alias) =>
      db.merchantMappings.put({
        mappingId: randomId('map'),
        merchantRaw: alias,
        merchantNormalized: normalized,
        createdAt: new Date().toISOString(),
      }),
    ),
  )
}

export async function upsertCategoryAlias(rawCategory: string, categoryId: string): Promise<void> {
  const existing = await db.categoryAliases.where('rawCategory').equals(rawCategory).first()
  const alias: CategoryAlias = {
    aliasId: existing?.aliasId ?? randomId('alias'),
    rawCategory,
    categoryId,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  }
  await db.categoryAliases.put(alias)

  const transactions = await db.transactionsNormalized.toArray()
  const matching = transactions.filter(
    (tx) => tx.amexCategoryRaw.trim().toLowerCase() === rawCategory.trim().toLowerCase(),
  )
  await Promise.all(
    matching.map((tx) =>
      db.transactionsNormalized.update(tx.transactionId, {
        categoryIdResolved: categoryId,
      }),
    ),
  )
}

export async function upsertCategoryName(categoryId: string, name: string): Promise<void> {
  await db.categories.update(categoryId, { name })
}

export async function upsertRule(rule: Rule): Promise<void> {
  let nextRule = rule
  if (rule.actions.some((action) => action.type === 'setCategory')) {
    const categories = await db.categories.toArray()
    const categoryIds = new Set(categories.map((category) => category.categoryId))
    const categoryIdByName = new Map(
      categories.map((category) => [category.name.trim().toLowerCase(), category.categoryId]),
    )
    nextRule = {
      ...rule,
      actions: resolveRuleActions(rule.actions, categoryIds, categoryIdByName),
    }
  }
  await db.rules.put(nextRule)
}

function readString(rawData: Record<string, string | number | null>, key: string): string {
  const value = rawData[key]
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

function readNumber(rawData: Record<string, string | number | null>, key: string): number {
  const value = rawData[key]
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function parseRawTransactionRow(rawData: Record<string, string | number | null>): ParsedTransactionRow {
  const postDateRaw = readString(rawData, 'postDate')
  return {
    rowIndex: readNumber(rawData, 'rowIndex'),
    transactionDate: readString(rawData, 'transactionDate'),
    postDate: postDateRaw || undefined,
    descriptionRaw: readString(rawData, 'descriptionRaw'),
    cardMember: readString(rawData, 'cardMember'),
    accountLastDigits: readString(rawData, 'accountLastDigits'),
    amount: readNumber(rawData, 'amount'),
    merchantRaw: readString(rawData, 'merchantRaw'),
    extendedDetails: readString(rawData, 'extendedDetails'),
    statementDescriptor: readString(rawData, 'statementDescriptor'),
    address: readString(rawData, 'address'),
    city: readString(rawData, 'city'),
    state: readString(rawData, 'state'),
    zip: readString(rawData, 'zip'),
    country: readString(rawData, 'country'),
    reference: readString(rawData, 'reference'),
    amexCategoryRaw: readString(rawData, 'amexCategoryRaw'),
  }
}

export interface RerunRulesSummary {
  processed: number
  matched: number
}

export async function rerunRulesOnExistingTransactions(): Promise<RerunRulesSummary> {
  const [rules, categories, aliases, merchantMappings, tags, transactions, raws, statements, overrides, links] =
    await Promise.all([
      db.rules.toArray(),
      db.categories.toArray(),
      db.categoryAliases.toArray(),
      db.merchantMappings.toArray(),
      db.tags.toArray(),
      db.transactionsNormalized.toArray(),
      db.transactionsRaw.toArray(),
      db.statements.toArray(),
      db.transactionOverrides.toArray(),
      db.transactionTags.toArray(),
    ])

  const enabledRules = rules.filter((rule) => rule.enabled).sort((a, b) => a.priority - b.priority)
  const categoryIds = new Set(categories.map((category) => category.categoryId))
  const categoryIdByName = new Map(
    categories.map((category) => [category.name.trim().toLowerCase(), category.categoryId]),
  )
  const merchantMap = new Map<string, string>()
  merchantMappings.forEach((mapping) => {
    merchantMap.set(mapping.merchantRaw.toLowerCase(), mapping.merchantNormalized)
    merchantMap.set(mapping.merchantNormalized.toLowerCase(), mapping.merchantNormalized)
  })
  const tagIdByName = new Map(tags.map((tag) => [tag.name.toLowerCase(), tag.tagId]))
  const rawByFingerprint = new Map(raws.map((raw) => [raw.sourceRowFingerprint, raw]))
  const statementById = new Map(statements.map((statement) => [statement.statementId, statement]))
  const overrideById = new Map(overrides.map((override) => [override.transactionId, override]))
  const tagIdsByTransactionId = new Map<string, Set<string>>()
  links.forEach((link) => {
    const existing = tagIdsByTransactionId.get(link.transactionId) ?? new Set<string>()
    existing.add(link.tagId)
    tagIdsByTransactionId.set(link.transactionId, existing)
  })

  const updatedAt = new Date().toISOString()
  let matched = 0

  for (const existing of transactions) {
      let baseline = {
        ...existing,
        hasRuleOverride: false,
        appliedRuleIds: [] as string[],
      }

      const raw = rawByFingerprint.get(existing.sourceRowFingerprint)
      const statement = raw ? statementById.get(raw.statementId) : undefined
      if (raw && statement) {
        const rebuilt = await normalizeTransaction({
          statementId: statement.statementId,
          importBatchId: raw.importBatchId,
          statementStartDate: statement.statementStartDate,
          statementEndDate: statement.statementEndDate,
          categoryAliases: aliases,
          row: parseRawTransactionRow(raw.rawData),
        })
        const merchantOverride =
          merchantMap.get(rebuilt.merchantRaw.toLowerCase()) ??
          merchantMap.get(rebuilt.merchantNormalized.toLowerCase())
        if (merchantOverride) {
          rebuilt.merchantNormalized = merchantOverride
        }
        baseline = {
          ...rebuilt,
          transactionId: existing.transactionId,
          sourceRowFingerprint: existing.sourceRowFingerprint,
          hasManualOverride: existing.hasManualOverride,
          merchantFirstSeenAt: existing.merchantFirstSeenAt ?? rebuilt.merchantFirstSeenAt,
          hasRuleOverride: false,
          appliedRuleIds: [],
        }
      }

      let ruled = baseline
      const appliedRuleIds: string[] = []
      const ruleFlags: Pick<
        TransactionOverride,
        'isBusiness' | 'isReimbursable' | 'isExcludedFromAnalytics'
      > = {}
      const tagsToAdd = new Set<string>()

      enabledRules.forEach((rule) => {
        if (!transactionMatchesRule(ruled, rule)) return
        appliedRuleIds.push(rule.ruleId)
        const resolvedActions = resolveRuleActions(rule.actions, categoryIds, categoryIdByName)
        const result = applyRuleActions(ruled, resolvedActions)
        ruled = result.transaction
        if (result.isBusiness !== undefined) ruleFlags.isBusiness = result.isBusiness
        if (result.isReimbursable !== undefined) ruleFlags.isReimbursable = result.isReimbursable
        if (result.isExcludedFromAnalytics !== undefined) {
          ruleFlags.isExcludedFromAnalytics = result.isExcludedFromAnalytics
        }
        result.tagsToAdd.forEach((tagToken) => {
          tagsToAdd.add(tagIdByName.get(tagToken.toLowerCase()) ?? tagToken)
        })
      })

      if (appliedRuleIds.length > 0) {
        matched += 1
      }

      ruled.appliedRuleIds = appliedRuleIds
      ruled.hasRuleOverride = appliedRuleIds.length > 0
      ruled.hasManualOverride = existing.hasManualOverride
      await db.transactionsNormalized.put(ruled)

      const existingOverride = overrideById.get(existing.transactionId)
      const shouldPreserveManualFlags = existing.hasManualOverride
      const nextOverride: TransactionOverride = {
        transactionId: existing.transactionId,
        updatedAt,
        merchantOverride: existingOverride?.merchantOverride,
        categoryOverrideId: existingOverride?.categoryOverrideId,
        notes: existingOverride?.notes,
        splitDefinition: existingOverride?.splitDefinition,
        isBusiness: shouldPreserveManualFlags ? existingOverride?.isBusiness : ruleFlags.isBusiness,
        isReimbursable: shouldPreserveManualFlags
          ? existingOverride?.isReimbursable
          : ruleFlags.isReimbursable,
        isExcludedFromAnalytics: shouldPreserveManualFlags
          ? existingOverride?.isExcludedFromAnalytics
          : ruleFlags.isExcludedFromAnalytics,
      }
      const hasManualContent =
        nextOverride.merchantOverride !== undefined ||
        nextOverride.categoryOverrideId !== undefined ||
        nextOverride.notes !== undefined ||
        nextOverride.splitDefinition !== undefined
      const hasFlags =
        nextOverride.isBusiness !== undefined ||
        nextOverride.isReimbursable !== undefined ||
        nextOverride.isExcludedFromAnalytics !== undefined
      if (appliedRuleIds.length > 0 || hasManualContent || hasFlags) {
        await db.transactionOverrides.put(nextOverride)
      } else if (existingOverride) {
        await db.transactionOverrides.delete(existing.transactionId)
      }

      const existingTagIds = tagIdsByTransactionId.get(existing.transactionId) ?? new Set<string>()
      const newLinks = [...tagsToAdd]
        .filter((tagId) => !existingTagIds.has(tagId))
        .map((tagId) => ({
          id: randomId('tt'),
          transactionId: existing.transactionId,
          tagId,
        }))
      if (newLinks.length > 0) {
        await db.transactionTags.bulkPut(newLinks)
        newLinks.forEach((link) => existingTagIds.add(link.tagId))
        tagIdsByTransactionId.set(existing.transactionId, existingTagIds)
      }
    }

  return {
    processed: transactions.length,
    matched,
  }
}

export async function createTag(name: string, colorToken: string): Promise<void> {
  await db.tags.put({
    tagId: randomId('tag'),
    name,
    colorToken,
    description: '',
    isArchived: false,
  })
}

export async function clearWorkspaceData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
  })
  await initializeWorkspace()
}
