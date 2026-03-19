import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
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

export type RecurringCadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual'
export type RecurringStatus = 'active' | 'new' | 'possibly_cancelled'
export type RecurringPriceTrend = 'up' | 'down' | 'flat'

export interface RecurringCandidate {
  merchant: string
  category: string
  cardHolder: string
  occurrences: number
  averageAmount: number
  medianAmount: number
  lastAmount: number
  monthlyEquivalent: number
  cadence: RecurringCadence
  cadenceDays: number
  lastChargeDate: string
  nextExpectedDate: string
  status: RecurringStatus
  priceTrend: RecurringPriceTrend
  matchedTransactionIds: string[]
  confidence: number
}

const CADENCE_RULES: Array<{
  cadence: RecurringCadence
  days: number
  tolerance: number
  minOccurrences: number
}> = [
  { cadence: 'weekly', days: 7, tolerance: 2, minOccurrences: 6 },
  { cadence: 'biweekly', days: 14, tolerance: 3, minOccurrences: 5 },
  { cadence: 'monthly', days: 30, tolerance: 7, minOccurrences: 3 },
  { cadence: 'quarterly', days: 91, tolerance: 16, minOccurrences: 3 },
  { cadence: 'annual', days: 365, tolerance: 35, minOccurrences: 3 },
]

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[middle - 1] + sorted[middle]) / 2
  return sorted[middle]
}

function detectCadence(gapsInDays: number[]): { cadence: RecurringCadence; days: number; consistency: number } | null {
  if (gapsInDays.length === 0) return null
  const scored = CADENCE_RULES.map((rule) => {
    const matches = gapsInDays.filter((gap) => Math.abs(gap - rule.days) <= rule.tolerance).length
    const consistency = matches / gapsInDays.length
    return {
      cadence: rule.cadence,
      days: rule.days,
      consistency,
      minOccurrences: rule.minOccurrences,
    }
  })
    .filter((candidate) => candidate.consistency >= 0.55)
    .sort((left, right) => right.consistency - left.consistency)
  if (scored.length === 0) return null
  return scored[0]
}

function toMonthlyEquivalent(amount: number, cadence: RecurringCadence): number {
  const multiplierByCadence: Record<RecurringCadence, number> = {
    weekly: 52 / 12,
    biweekly: 26 / 12,
    monthly: 1,
    quarterly: 1 / 3,
    annual: 1 / 12,
  }
  return amount * multiplierByCadence[cadence]
}

function toPriceTrend(lastAmount: number, baselineAmount: number): RecurringPriceTrend {
  if (baselineAmount === 0) return 'flat'
  const delta = (lastAmount - baselineAmount) / baselineAmount
  if (delta >= 0.08) return 'up'
  if (delta <= -0.08) return 'down'
  return 'flat'
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function recurringCandidates(transactions: EnrichedTransaction[]): RecurringCandidate[] {
  const byMerchant = new Map<
    string,
    {
      transactions: Array<{
        transactionId: string
        transactionDate: string
        amount: number
      }>
      categoryCounts: Map<string, number>
      cardHolderCounts: Map<string, number>
    }
  >()
  transactions
    .filter((tx) => tx.amount > 0 && !tx.isExcludedFromAnalytics && !tx.isPayment && !tx.isRefund)
    .forEach((tx) => {
      const entry = byMerchant.get(tx.merchantFinal) ?? {
        transactions: [],
        categoryCounts: new Map<string, number>(),
        cardHolderCounts: new Map<string, number>(),
      }
      entry.transactions.push({
        transactionId: tx.transactionId,
        transactionDate: tx.transactionDate,
        amount: tx.amount,
      })
      const category = tx.categoryFinalName || 'Uncategorized'
      const cardHolder = tx.cardMember || 'Unknown'
      entry.categoryCounts.set(category, (entry.categoryCounts.get(category) ?? 0) + 1)
      entry.cardHolderCounts.set(cardHolder, (entry.cardHolderCounts.get(cardHolder) ?? 0) + 1)
      byMerchant.set(tx.merchantFinal, entry)
    })

  return [...byMerchant.entries()]
    .filter(([, entry]) => entry.transactions.length >= 3)
    .map(([merchant, entry]) => {
      const sortedTransactions = [...entry.transactions].sort((left, right) =>
        left.transactionDate.localeCompare(right.transactionDate),
      )
      const amounts = sortedTransactions.map((tx) => tx.amount)
      const dates = sortedTransactions.map((tx) => tx.transactionDate)
      const gaps = dates
        .slice(1)
        .map((date, index) =>
          Math.abs(differenceInCalendarDays(parseISO(date), parseISO(dates[index]))),
        )
        .filter((value) => value > 0)
      const cadenceDetected = detectCadence(gaps)
      if (!cadenceDetected) return null
      const cadenceRule = CADENCE_RULES.find((rule) => rule.cadence === cadenceDetected.cadence)
      if (!cadenceRule || sortedTransactions.length < cadenceRule.minOccurrences) return null
      const avg = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length
      const medianAmount = median(amounts)
      const variance = amounts.reduce((sum, amount) => sum + Math.pow(amount - avg, 2), 0) / amounts.length
      const stdDev = Math.sqrt(variance)
      const amountConfidence = clampConfidence(1 - Math.min(1, stdDev / Math.max(avg, 1)))
      const cadenceConfidence = cadenceDetected.consistency
      const occurrenceConfidence = clampConfidence((sortedTransactions.length - 2) / 6)
      const confidence = clampConfidence(
        cadenceConfidence * 0.6 + amountConfidence * 0.3 + occurrenceConfidence * 0.1,
      )
      const lastTransaction = sortedTransactions[sortedTransactions.length - 1]
      const firstTransaction = sortedTransactions[0]
      const spanDays = Math.max(
        0,
        differenceInCalendarDays(
          parseISO(lastTransaction.transactionDate),
          parseISO(firstTransaction.transactionDate),
        ),
      )
      const daysSinceLast = Math.max(
        0,
        differenceInCalendarDays(new Date(), parseISO(lastTransaction.transactionDate)),
      )
      const status: RecurringStatus =
        sortedTransactions.length <= 3 || spanDays < cadenceDetected.days * 2
          ? 'new'
          : daysSinceLast > cadenceDetected.days * 1.75
            ? 'possibly_cancelled'
            : 'active'
      const category =
        [...entry.categoryCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'Uncategorized'
      const cardHolder =
        [...entry.cardHolderCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'Unknown'
      const lastAmount = lastTransaction.amount
      const monthlyEquivalent = toMonthlyEquivalent(medianAmount, cadenceDetected.cadence)
      const nextExpectedDate = format(
        addDays(parseISO(lastTransaction.transactionDate), cadenceDetected.days),
        'yyyy-MM-dd',
      )
      return {
        merchant,
        category,
        cardHolder,
        occurrences: sortedTransactions.length,
        averageAmount: avg,
        medianAmount,
        lastAmount,
        monthlyEquivalent,
        cadence: cadenceDetected.cadence,
        cadenceDays: cadenceDetected.days,
        lastChargeDate: lastTransaction.transactionDate,
        nextExpectedDate,
        status,
        priceTrend: toPriceTrend(lastAmount, medianAmount),
        matchedTransactionIds: sortedTransactions.map((tx) => tx.transactionId),
        confidence,
      }
    })
    .filter((candidate): candidate is RecurringCandidate => Boolean(candidate))
    .sort((left, right) => right.monthlyEquivalent - left.monthlyEquivalent || right.confidence - left.confidence)
}
