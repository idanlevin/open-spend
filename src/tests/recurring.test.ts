import { describe, expect, it } from 'vitest'
import { recurringCandidates } from '@/lib/analytics/metrics'
import type { EnrichedTransaction } from '@/types/domain'

function buildTransaction(overrides: Partial<EnrichedTransaction>): EnrichedTransaction {
  return {
    transactionId: overrides.transactionId ?? 'txn_default',
    statementId: overrides.statementId ?? 'stmt_default',
    transactionDate: overrides.transactionDate ?? '2026-01-01',
    postDate: overrides.postDate ?? null,
    descriptionRaw: overrides.descriptionRaw ?? '',
    descriptionNormalized: overrides.descriptionNormalized ?? '',
    cardMember: overrides.cardMember ?? 'Primary',
    accountLastDigits: overrides.accountLastDigits ?? '0000',
    amount: overrides.amount ?? 0,
    merchantRaw: overrides.merchantRaw ?? '',
    merchantNormalized: overrides.merchantNormalized ?? '',
    extendedDetails: overrides.extendedDetails ?? '',
    statementDescriptor: overrides.statementDescriptor ?? '',
    address: overrides.address ?? '',
    city: overrides.city ?? '',
    state: overrides.state ?? '',
    zip: overrides.zip ?? '',
    country: overrides.country ?? 'US',
    reference: overrides.reference ?? '',
    amexCategoryRaw: overrides.amexCategoryRaw ?? '',
    categoryIdResolved: overrides.categoryIdResolved ?? 'cat_business',
    transactionKind: overrides.transactionKind ?? 'charge',
    isCredit: overrides.isCredit ?? false,
    isRefund: overrides.isRefund ?? false,
    isPayment: overrides.isPayment ?? false,
    isPendingLike: overrides.isPendingLike ?? false,
    duplicateGroupKey: overrides.duplicateGroupKey ?? '',
    sourceRowFingerprint: overrides.sourceRowFingerprint ?? '',
    importBatchId: overrides.importBatchId ?? 'import_default',
    hasManualOverride: overrides.hasManualOverride ?? false,
    hasRuleOverride: overrides.hasRuleOverride ?? false,
    merchantFirstSeenAt: overrides.merchantFirstSeenAt,
    appliedRuleIds: overrides.appliedRuleIds,
    merchantFinal: overrides.merchantFinal ?? 'Unknown Merchant',
    categoryFinalId: overrides.categoryFinalId ?? 'cat_business',
    categoryFinalName: overrides.categoryFinalName ?? 'Business',
    notes: overrides.notes ?? '',
    tags: overrides.tags ?? [],
    isExcludedFromAnalytics: overrides.isExcludedFromAnalytics ?? false,
    isReimbursable: overrides.isReimbursable ?? false,
    isBusiness: overrides.isBusiness ?? true,
    splitDefinition: overrides.splitDefinition,
  }
}

describe('recurringCandidates', () => {
  it('rejects candidates with large amount variance even when dates match cadence', () => {
    const transactions: EnrichedTransaction[] = [
      buildTransaction({
        transactionId: 'txn_var_1',
        statementId: 'stmt_var_1',
        transactionDate: '2026-01-05',
        amount: 30,
        merchantFinal: 'Variable Billing Example',
      }),
      buildTransaction({
        transactionId: 'txn_var_2',
        statementId: 'stmt_var_2',
        transactionDate: '2026-02-04',
        amount: 145,
        merchantFinal: 'Variable Billing Example',
      }),
    ]

    const candidates = recurringCandidates(transactions)
    const variableCandidate = candidates.find((candidate) => candidate.merchantGroupKey === 'Variable Billing Example')

    expect(variableCandidate).toBeUndefined()
  })

  it('does not treat weekly patterns as recurring', () => {
    const transactions: EnrichedTransaction[] = [
      buildTransaction({
        transactionId: 'txn_weekly_1',
        statementId: 'stmt_weekly_1',
        transactionDate: '2026-01-01',
        amount: 19.99,
        merchantFinal: 'Some Weekly Service',
      }),
      buildTransaction({
        transactionId: 'txn_weekly_2',
        statementId: 'stmt_weekly_2',
        transactionDate: '2026-01-08',
        amount: 19.99,
        merchantFinal: 'Some Weekly Service',
      }),
      buildTransaction({
        transactionId: 'txn_weekly_3',
        statementId: 'stmt_weekly_3',
        transactionDate: '2026-01-15',
        amount: 19.99,
        merchantFinal: 'Some Weekly Service',
      }),
    ]

    const candidates = recurringCandidates(transactions)
    expect(candidates).toHaveLength(0)
  })

  it('detects monthly recurring candidates with exactly two occurrences', () => {
    const transactions: EnrichedTransaction[] = [
      buildTransaction({
        transactionId: 'txn_monthly_1',
        statementId: 'stmt_2026_01',
        transactionDate: '2026-01-01',
        amount: 8.4,
        merchantFinal: 'Google Workspace_hicc Google Com',
        descriptionRaw: 'GOOGLE *WORKSPACE_HICC@GOOGLE.COM',
      }),
      buildTransaction({
        transactionId: 'txn_monthly_2',
        statementId: 'stmt_2026_02',
        transactionDate: '2026-02-01',
        amount: 8.4,
        merchantFinal: 'Google Gsuite_hicc Google Com',
        descriptionRaw: 'GOOGLE *GSUITE_HICC@GOOGLE.COM',
      }),
    ]

    const candidates = recurringCandidates(transactions)
    const workspaceCandidate = candidates.find((candidate) => candidate.merchantGroupKey === 'Google Workspace')

    expect(workspaceCandidate).toBeDefined()
    expect(workspaceCandidate?.occurrences).toBe(2)
    expect(workspaceCandidate?.cadence).toBe('monthly')
  })

  it('detects annual recurring candidates with slight day drift', () => {
    const transactions: EnrichedTransaction[] = [
      buildTransaction({
        transactionId: 'txn_annual_1',
        statementId: 'stmt_annual_1',
        transactionDate: '2025-03-10',
        amount: 120,
        merchantFinal: 'Example Annual Plan',
      }),
      buildTransaction({
        transactionId: 'txn_annual_2',
        statementId: 'stmt_annual_2',
        transactionDate: '2026-03-12',
        amount: 120,
        merchantFinal: 'Example Annual Plan',
      }),
    ]

    const candidates = recurringCandidates(transactions)
    const annualCandidate = candidates.find((candidate) => candidate.merchantGroupKey === 'Example Annual Plan')

    expect(annualCandidate).toBeDefined()
    expect(annualCandidate?.occurrences).toBe(2)
    expect(annualCandidate?.cadence).toBe('annual')
  })

  it('detects recurring Google Workspace charges despite GSuite/Workspace alias drift', () => {
    const transactions: EnrichedTransaction[] = [
      buildTransaction({
        transactionId: 'txn_1',
        statementId: 'stmt_2025_09',
        transactionDate: '2025-09-01',
        amount: 8.4,
        merchantFinal: 'Google Gsuite_hievecc Google Com',
        descriptionRaw: 'GOOGLE *GSUITE_HIEVECC@GOOGLE.COM',
      }),
      buildTransaction({
        transactionId: 'txn_2',
        statementId: 'stmt_2025_10',
        transactionDate: '2025-10-01',
        amount: 8.4,
        merchantFinal: 'Google Gsuite Hieve Cc Google Com',
        descriptionRaw: 'GOOGLE*GSUITE HIEVE.CC GOOGLE.COM',
      }),
      buildTransaction({
        transactionId: 'txn_3',
        statementId: 'stmt_2025_11',
        transactionDate: '2025-11-01',
        amount: 8.4,
        merchantFinal: 'Google Workspace_hicc Google Com',
        descriptionRaw: 'GOOGLE *WORKSPACE_HICC@GOOGLE.COM',
      }),
      buildTransaction({
        transactionId: 'txn_4',
        statementId: 'stmt_2025_12',
        transactionDate: '2025-12-01',
        amount: 8.4,
        merchantFinal: 'Google Workspace Hiecc Google Com',
        descriptionRaw: 'GOOGLE*WORKSPACE HIECC GOOGLE.COM',
      }),
      buildTransaction({
        transactionId: 'txn_5',
        statementId: 'stmt_2026_01',
        transactionDate: '2026-01-01',
        amount: 8.4,
        merchantFinal: 'Google Workspace_hicc Google Com',
        descriptionRaw: 'GOOGLE *WORKSPACE_HICC@GOOGLE.COM',
      }),
      buildTransaction({
        transactionId: 'txn_6',
        statementId: 'stmt_2026_02',
        transactionDate: '2026-02-01',
        amount: 8.4,
        merchantFinal: 'Google Workspace_hicc Google Com',
        descriptionRaw: 'GOOGLE *WORKSPACE_HICC@GOOGLE.COM',
      }),
    ]

    const candidates = recurringCandidates(transactions)
    const workspaceCandidate = candidates.find((candidate) => candidate.merchantGroupKey === 'Google Workspace')

    expect(workspaceCandidate).toBeDefined()
    expect(workspaceCandidate?.occurrences).toBe(6)
    expect(workspaceCandidate?.matchedTransactionIds).toHaveLength(6)
    expect(workspaceCandidate?.cadence).toBe('monthly')
  })
})
