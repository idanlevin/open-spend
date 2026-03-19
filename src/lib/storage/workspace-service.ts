import { db, deleteLegacyDatabases } from '@/lib/storage/db'
import { STARTER_TAGS, SYSTEM_CATEGORIES } from '@/lib/storage/seeds'
import { classifyTransactionKind } from '@/lib/normalization/transaction-kind'
import { normalizeMerchantName } from '@/lib/normalization/merchant'
import { randomId } from '@/lib/utils'
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
  await db.rules.put(rule)
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
