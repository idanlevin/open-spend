import { db, deleteLegacyDatabases } from '@/lib/storage/db'
import { STARTER_TAGS, SYSTEM_CATEGORIES } from '@/lib/storage/seeds'
import { normalizeMerchantName } from '@/lib/normalization/merchant'
import { randomId } from '@/lib/utils'
import type {
  Category,
  CategoryAlias,
  EnrichedTransaction,
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
  const merchantFinal = override?.merchantOverride || tx.merchantNormalized
  const categoryFinalId = override?.categoryOverrideId || tx.categoryIdResolved
  const categoryFinalName = categoriesById.get(categoryFinalId)?.name ?? 'Uncategorized'
  const resolvedTags = links
    .map((link) => tagsById.get(link.tagId))
    .filter((tag): tag is Tag => Boolean(tag))

  return {
    ...tx,
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
  const [transactions, overrides, categories, tags, links, statements, rules] = await Promise.all([
    db.transactionsNormalized.toArray(),
    db.transactionOverrides.toArray(),
    db.categories.orderBy('sortOrder').toArray(),
    db.tags.toArray(),
    db.transactionTags.toArray(),
    db.statements.orderBy('statementEndDate').reverse().toArray(),
    db.rules.orderBy('priority').toArray(),
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
