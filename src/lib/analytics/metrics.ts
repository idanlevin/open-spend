import { format, parseISO } from 'date-fns'
import type { EnrichedTransaction } from '@/types/domain'

export interface DashboardMetrics {
  totalSpend: number
  refundsTotal: number
  paymentsTotal: number
  netSpend: number
  transactionCount: number
  paymentCount: number
  avgTransaction: number
  topCategory: string
  topMerchant: string
  uncategorizedCount: number
}

export function buildDashboardMetrics(transactions: EnrichedTransaction[]): DashboardMetrics {
  const included = transactions.filter((tx) => !tx.isExcludedFromAnalytics)
  const spendScope = included.filter((tx) => !tx.isPayment)
  const totalSpend = spendScope.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0)
  const refundsTotal = spendScope.filter((tx) => tx.isRefund).reduce((sum, tx) => sum + tx.amount, 0)
  const paymentsTotal = included.filter((tx) => tx.isPayment).reduce((sum, tx) => sum + tx.amount, 0)
  const netSpend = totalSpend + refundsTotal
  const transactionCount = spendScope.length
  const paymentCount = included.filter((tx) => tx.isPayment).length
  const avgTransaction = transactionCount ? netSpend / transactionCount : 0
  const uncategorizedCount = spendScope.filter((tx) => tx.categoryFinalName === 'Uncategorized').length

  const byCategory = new Map<string, number>()
  const byMerchant = new Map<string, number>()
  spendScope.forEach((tx) => {
    if (tx.categoryFinalName !== 'Uncategorized') {
      byCategory.set(tx.categoryFinalName, (byCategory.get(tx.categoryFinalName) ?? 0) + tx.amount)
    }
    byMerchant.set(tx.merchantFinal, (byMerchant.get(tx.merchantFinal) ?? 0) + tx.amount)
  })

  const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-'
  const topMerchant = [...byMerchant.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-'

  return {
    totalSpend,
    refundsTotal,
    paymentsTotal,
    netSpend,
    transactionCount,
    paymentCount,
    avgTransaction,
    topCategory,
    topMerchant,
    uncategorizedCount,
  }
}

export function spendOverTime(
  transactions: EnrichedTransaction[],
  options?: { includeRefunds?: boolean },
): Array<{ period: string; amount: number }> {
  const includeRefunds = options?.includeRefunds ?? true
  const byMonth = new Map<string, number>()
  transactions
    .filter(
      (tx) =>
        !tx.isExcludedFromAnalytics &&
        !tx.isPayment &&
        (includeRefunds || (!tx.isRefund && tx.amount >= 0)),
    )
    .forEach((tx) => {
      const period = format(parseISO(tx.transactionDate), 'yyyy-MM')
      byMonth.set(period, (byMonth.get(period) ?? 0) + tx.amount)
    })
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, amount]) => ({ period, amount }))
}

export function topByDimension(
  transactions: EnrichedTransaction[],
  key: 'categoryFinalName' | 'merchantFinal' | 'cardMember',
  take = 8,
): Array<{ label: string; amount: number; count: number }> {
  const byDimension = new Map<string, { amount: number; count: number }>()
  transactions
    .filter((tx) => !tx.isExcludedFromAnalytics && !tx.isPayment)
    .forEach((tx) => {
      const dim = tx[key] || 'Unknown'
      const entry = byDimension.get(dim) ?? { amount: 0, count: 0 }
      entry.amount += tx.amount
      entry.count += 1
      byDimension.set(dim, entry)
    })

  return [...byDimension.entries()]
    .map(([label, value]) => ({
      label,
      ...value,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, take)
}

export function recurringCandidates(transactions: EnrichedTransaction[]): Array<{
  merchant: string
  occurrences: number
  averageAmount: number
  confidence: number
}> {
  const byMerchant = new Map<string, number[]>()
  transactions
    .filter((tx) => tx.amount > 0 && !tx.isExcludedFromAnalytics)
    .forEach((tx) => {
      const list = byMerchant.get(tx.merchantFinal) ?? []
      list.push(tx.amount)
      byMerchant.set(tx.merchantFinal, list)
    })

  return [...byMerchant.entries()]
    .filter(([, amounts]) => amounts.length >= 3)
    .map(([merchant, amounts]) => {
      const avg = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length
      const variance =
        amounts.reduce((sum, amount) => sum + Math.pow(amount - avg, 2), 0) / amounts.length
      const confidence = Math.max(0, 1 - Math.min(1, variance / Math.max(avg, 1)))
      return {
        merchant,
        occurrences: amounts.length,
        averageAmount: avg,
        confidence,
      }
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 20)
}
