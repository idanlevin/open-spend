import type { EnrichedTransaction } from '@/types/domain'
import type { TransactionFilters } from '@/stores/view-store'

export function applyTransactionFilters(
  rows: EnrichedTransaction[],
  filters: TransactionFilters,
): EnrichedTransaction[] {
  return rows.filter((tx) => {
    if (filters.query) {
      const query = filters.query.toLowerCase()
      const haystack = [
        tx.merchantFinal,
        tx.descriptionRaw,
        tx.reference,
        tx.notes,
        tx.categoryFinalName,
        tx.tags.map((tag) => tag.name).join(' '),
      ]
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(query)) return false
    }

    if (filters.startDate && tx.transactionDate < filters.startDate) return false
    if (filters.endDate && tx.transactionDate > filters.endDate) return false
    if (filters.categoryIds.length > 0 && !filters.categoryIds.includes(tx.categoryFinalId)) return false
    if (filters.merchants.length > 0 && !filters.merchants.includes(tx.merchantFinal)) return false
    if (filters.cardholders.length > 0 && !filters.cardholders.includes(tx.cardMember)) return false
    if (filters.minAmount !== undefined && tx.amount < filters.minAmount) return false
    if (filters.maxAmount !== undefined && tx.amount > filters.maxAmount) return false
    if (filters.uncategorizedOnly && tx.categoryFinalName !== 'Uncategorized') return false
    if (filters.excludedOnly && !tx.isExcludedFromAnalytics) return false
    if (filters.refundsOnly && !tx.isRefund) return false
    if (filters.paymentsOnly && !tx.isPayment) return false
    if (filters.businessOnly && !tx.isBusiness) return false
    if (filters.reimbursableOnly && !tx.isReimbursable) return false
    return true
  })
}
