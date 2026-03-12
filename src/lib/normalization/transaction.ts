import { normalizeMerchantName } from '@/lib/normalization/merchant'
import { normalizeText, nowIso, sha256Hex } from '@/lib/utils'
import type { CategoryAlias, TransactionNormalized } from '@/types/domain'
import type { ParsedTransactionRow } from '@/lib/parsing/types'
import { resolveCategoryId } from '@/lib/normalization/category'

export interface NormalizeInput {
  statementId: string
  importBatchId: string
  statementStartDate: string
  statementEndDate: string
  categoryAliases: CategoryAlias[]
  row: ParsedTransactionRow
}

export async function buildTransactionFingerprint(input: NormalizeInput): Promise<string> {
  const canonical = [
    input.statementStartDate,
    input.statementEndDate,
    input.row.transactionDate,
    input.row.amount.toFixed(2),
    normalizeText(input.row.descriptionRaw),
    normalizeText(input.row.cardMember),
    normalizeText(input.row.reference),
  ].join('|')
  return sha256Hex(canonical)
}

export async function normalizeTransaction(input: NormalizeInput): Promise<TransactionNormalized> {
  const merchantNormalized = normalizeMerchantName(input.row.merchantRaw || input.row.descriptionRaw)
  const categoryIdResolved = resolveCategoryId(input.row.amexCategoryRaw, input.categoryAliases)
  const sourceRowFingerprint = await buildTransactionFingerprint(input)

  return {
    transactionId: `txn_${sourceRowFingerprint}`,
    statementId: input.statementId,
    transactionDate: input.row.transactionDate,
    postDate: input.row.postDate ?? null,
    descriptionRaw: input.row.descriptionRaw,
    descriptionNormalized: normalizeText(input.row.descriptionRaw),
    cardMember: input.row.cardMember || 'Primary',
    accountLastDigits: input.row.accountLastDigits || '',
    amount: input.row.amount,
    merchantRaw: input.row.merchantRaw || input.row.descriptionRaw,
    merchantNormalized,
    extendedDetails: input.row.extendedDetails,
    statementDescriptor: input.row.statementDescriptor,
    address: input.row.address,
    city: input.row.city,
    state: input.row.state,
    zip: input.row.zip,
    country: input.row.country,
    reference: input.row.reference,
    amexCategoryRaw: input.row.amexCategoryRaw,
    categoryIdResolved,
    isCredit: input.row.amount < 0,
    isRefund: input.row.amount < 0 || /refund|credit|return/i.test(input.row.descriptionRaw),
    isPendingLike: /pending/i.test(input.row.descriptionRaw),
    duplicateGroupKey: sourceRowFingerprint.slice(0, 16),
    sourceRowFingerprint,
    importBatchId: input.importBatchId,
    hasManualOverride: false,
    hasRuleOverride: false,
    merchantFirstSeenAt: nowIso(),
  }
}
