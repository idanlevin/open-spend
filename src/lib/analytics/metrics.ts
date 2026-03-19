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

export type RecurringCadence = 'monthly' | 'annual'
export type RecurringStatus = 'active' | 'new' | 'possibly_cancelled'
export type RecurringPriceTrend = 'up' | 'down' | 'flat'

export interface RecurringCandidate {
  merchant: string
  merchantGroupKey: string
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
  gapTolerance: number
  dayOfMonthTolerance: number
  minOccurrences: number
}> = [
  { cadence: 'monthly', days: 30, gapTolerance: 4, dayOfMonthTolerance: 3, minOccurrences: 2 },
  { cadence: 'annual', days: 365, gapTolerance: 8, dayOfMonthTolerance: 3, minOccurrences: 2 },
]
const MAX_RECURRING_AMOUNT_VARIANCE_RATIO = 0.4

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[middle - 1] + sorted[middle]) / 2
  return sorted[middle]
}

interface RecurringSeriesTransaction {
  transactionId: string
  transactionDate: string
  amount: number
  category: string
  cardHolder: string
  merchantDisplay: string
}

function detectCadence(
  dates: string[],
): { cadence: RecurringCadence; days: number; consistency: number } | null {
  if (dates.length < 2) return null
  const parsedDates = dates.map((date) => parseISO(date))
  const gapsInDays = parsedDates
    .slice(1)
    .map((date, index) => Math.abs(differenceInCalendarDays(date, parsedDates[index])))
    .filter((value) => value > 0)
  if (gapsInDays.length === 0) return null
  const daysOfMonth = parsedDates.map((date) => date.getDate())
  const sortedDays = [...daysOfMonth].sort((left, right) => left - right)
  const anchorDay = sortedDays[Math.floor(sortedDays.length / 2)]
  const scored = CADENCE_RULES.map((rule) => {
    const gapMatches = gapsInDays.filter((gap) => Math.abs(gap - rule.days) <= rule.gapTolerance).length
    const dayMatches = daysOfMonth.filter((day) => Math.abs(day - anchorDay) <= rule.dayOfMonthTolerance).length
    const gapConsistency = gapMatches / gapsInDays.length
    const dayConsistency = dayMatches / daysOfMonth.length
    const consistency = gapConsistency * 0.7 + dayConsistency * 0.3
    return {
      cadence: rule.cadence,
      days: rule.days,
      consistency,
      gapConsistency,
      dayConsistency,
      minOccurrences: rule.minOccurrences,
    }
  })
    .filter((candidate) => candidate.gapConsistency >= 0.8 && candidate.dayConsistency >= 0.6)
    .sort((left, right) => right.consistency - left.consistency)
  if (scored.length === 0) return null
  return scored[0]
}

function toMonthlyEquivalent(amount: number, cadence: RecurringCadence): number {
  const multiplierByCadence: Record<RecurringCadence, number> = {
    monthly: 1,
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

function amountVarianceRatio(amounts: number[]): number {
  if (amounts.length <= 1) return 0
  const medianAmount = median(amounts)
  if (medianAmount <= 0) return 1
  const maxDeviation = Math.max(...amounts.map((amount) => Math.abs(amount - medianAmount)))
  return maxDeviation / medianAmount
}

function recurringMerchantGroupKey(merchant: string): string {
  const normalized = merchant.trim()
  const lower = normalized.toLowerCase()
  if (!lower) return 'Unknown Merchant'
  if (lower.includes('google') && (lower.includes('workspace') || lower.includes('gsuite'))) {
    return 'Google Workspace'
  }
  return normalized
}

function buildRecurringSeriesCandidates(
  transactions: RecurringSeriesTransaction[],
): RecurringSeriesTransaction[][] {
  if (transactions.length < 2) return [transactions]
  const amounts = transactions.map((tx) => tx.amount)
  const medianAmount = median(amounts)
  const bucketSize = medianAmount >= 100 ? 5 : medianAmount >= 20 ? 2 : 1
  const amountBuckets = new Map<number, RecurringSeriesTransaction[]>()
  transactions.forEach((tx) => {
    const bucket = Math.round(tx.amount / bucketSize) * bucketSize
    const list = amountBuckets.get(bucket) ?? []
    list.push(tx)
    amountBuckets.set(bucket, list)
  })
  const seriesCandidates: RecurringSeriesTransaction[][] = [transactions]
  ;[...amountBuckets.entries()]
    .filter(([, bucketTransactions]) => bucketTransactions.length >= 2)
    .sort((left, right) => right[1].length - left[1].length)
    .forEach(([, bucketTransactions]) => {
      const center = median(bucketTransactions.map((tx) => tx.amount))
      const tolerance = Math.max(2, center * 0.12)
      const focusedSeries = transactions.filter((tx) => Math.abs(tx.amount - center) <= tolerance)
      if (focusedSeries.length < 2) return
      seriesCandidates.push(focusedSeries)
    })

  const uniqueSeries = new Map<string, RecurringSeriesTransaction[]>()
  seriesCandidates.forEach((series) => {
    const key = series
      .map((transaction) => transaction.transactionId)
      .sort((left, right) => left.localeCompare(right))
      .join('|')
    if (!key) return
    uniqueSeries.set(key, series)
  })
  return [...uniqueSeries.values()].sort((left, right) => right.length - left.length)
}

export function recurringCandidates(transactions: EnrichedTransaction[]): RecurringCandidate[] {
  const byMerchant = new Map<
    string,
    {
      transactions: Array<{
        transactionId: string
        transactionDate: string
        amount: number
        category: string
        cardHolder: string
        merchantDisplay: string
      }>
    }
  >()
  transactions
    .filter((tx) => tx.amount > 0 && !tx.isExcludedFromAnalytics && !tx.isPayment && !tx.isRefund)
    .forEach((tx) => {
      const key = recurringMerchantGroupKey(tx.merchantFinal)
      const entry = byMerchant.get(key) ?? {
        transactions: [],
      }
      entry.transactions.push({
        transactionId: tx.transactionId,
        transactionDate: tx.transactionDate,
        amount: tx.amount,
        category: tx.categoryFinalName || 'Uncategorized',
        cardHolder: tx.cardMember || 'Unknown',
        merchantDisplay: tx.merchantFinal || 'Unknown',
      })
      byMerchant.set(key, entry)
    })

  return [...byMerchant.entries()]
    .filter(([, entry]) => entry.transactions.length >= 2)
    .map(([merchantGroupKey, entry]) => {
      const sortedTransactions = [...entry.transactions].sort((left, right) =>
        left.transactionDate.localeCompare(right.transactionDate),
      )

      const buildCandidateFromSeries = (seriesTransactions: RecurringSeriesTransaction[]) => {
        const amounts = seriesTransactions.map((tx) => tx.amount)
        const dates = seriesTransactions.map((tx) => tx.transactionDate)
        const varianceRatio = amountVarianceRatio(amounts)
        if (varianceRatio > MAX_RECURRING_AMOUNT_VARIANCE_RATIO) return null
        const cadenceDetected = detectCadence(dates)
        if (!cadenceDetected) return null
        const cadenceRule = CADENCE_RULES.find((rule) => rule.cadence === cadenceDetected.cadence)
        if (!cadenceRule || seriesTransactions.length < cadenceRule.minOccurrences) return null
        const avg = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length
        const medianAmount = median(amounts)
        const variance = amounts.reduce((sum, amount) => sum + Math.pow(amount - avg, 2), 0) / amounts.length
        const stdDev = Math.sqrt(variance)
        const amountConfidence = clampConfidence(1 - Math.min(1, stdDev / Math.max(avg, 1)))
        const cadenceConfidence = cadenceDetected.consistency
        const occurrenceConfidence = clampConfidence((seriesTransactions.length - 2) / 6)
        const confidence = clampConfidence(
          cadenceConfidence * 0.6 + amountConfidence * 0.3 + occurrenceConfidence * 0.1,
        )
        const monthlyEquivalent = toMonthlyEquivalent(medianAmount, cadenceDetected.cadence)
        const lastTransaction = seriesTransactions[seriesTransactions.length - 1]
        const firstTransaction = seriesTransactions[0]
        return {
          cadenceDetected,
          averageAmount: avg,
          medianAmount,
          monthlyEquivalent,
          confidence,
          lastAmount: lastTransaction.amount,
          lastChargeDate: lastTransaction.transactionDate,
          firstChargeDate: firstTransaction.transactionDate,
          seriesTransactions,
        }
      }

      const validSeriesCandidates = buildRecurringSeriesCandidates(sortedTransactions)
        .map((series) => buildCandidateFromSeries(series))
        .filter(
          (
            candidate,
          ): candidate is {
            cadenceDetected: { cadence: RecurringCadence; days: number; consistency: number }
            averageAmount: number
            medianAmount: number
            monthlyEquivalent: number
            confidence: number
            lastAmount: number
            lastChargeDate: string
            firstChargeDate: string
            seriesTransactions: RecurringSeriesTransaction[]
          } => Boolean(candidate),
        )
        .sort(
          (left, right) =>
            right.monthlyEquivalent - left.monthlyEquivalent ||
            right.confidence - left.confidence ||
            right.seriesTransactions.length - left.seriesTransactions.length,
        )
      const primaryCandidate = validSeriesCandidates[0]
      if (!primaryCandidate) return null

      const selectedSeriesCandidates = [primaryCandidate]
      const usedTransactionIds = new Set(
        primaryCandidate.seriesTransactions.map((transaction) => transaction.transactionId),
      )
      validSeriesCandidates.slice(1).forEach((candidate) => {
        if (candidate.cadenceDetected.cadence !== primaryCandidate.cadenceDetected.cadence) return
        if (candidate.confidence < 0.45) return
        if (candidate.monthlyEquivalent < Math.max(20, primaryCandidate.monthlyEquivalent * 0.2)) return
        if (candidate.seriesTransactions.some((transaction) => usedTransactionIds.has(transaction.transactionId))) {
          return
        }
        selectedSeriesCandidates.push(candidate)
        candidate.seriesTransactions.forEach((transaction) => {
          usedTransactionIds.add(transaction.transactionId)
        })
      })

      const mergedSeriesTransactions = selectedSeriesCandidates
        .flatMap((candidate) => candidate.seriesTransactions)
        .sort((left, right) => left.transactionDate.localeCompare(right.transactionDate))
      const lastChargeDate = selectedSeriesCandidates
        .map((candidate) => candidate.lastChargeDate)
        .sort((left, right) => left.localeCompare(right))
        .at(-1)
      const firstChargeDate = selectedSeriesCandidates
        .map((candidate) => candidate.firstChargeDate)
        .sort((left, right) => left.localeCompare(right))[0]
      if (!lastChargeDate || !firstChargeDate) return null
      const spanDays = Math.max(
        0,
        differenceInCalendarDays(parseISO(lastChargeDate), parseISO(firstChargeDate)),
      )
      const daysSinceLast = Math.max(
        0,
        differenceInCalendarDays(new Date(), parseISO(lastChargeDate)),
      )
      const status: RecurringStatus =
        mergedSeriesTransactions.length <= 3 ||
        spanDays < primaryCandidate.cadenceDetected.days * 2
          ? 'new'
          : daysSinceLast > primaryCandidate.cadenceDetected.days * 1.75
            ? 'possibly_cancelled'
            : 'active'
      const categoryCounts = new Map<string, number>()
      const cardHolderCounts = new Map<string, number>()
      mergedSeriesTransactions.forEach((transaction) => {
        categoryCounts.set(
          transaction.category,
          (categoryCounts.get(transaction.category) ?? 0) + 1,
        )
        cardHolderCounts.set(
          transaction.cardHolder,
          (cardHolderCounts.get(transaction.cardHolder) ?? 0) + 1,
        )
      })
      const category =
        [...categoryCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
        'Uncategorized'
      const cardHolder =
        [...cardHolderCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ??
        'Unknown'
      const averageAmount = selectedSeriesCandidates.reduce(
        (sum, candidate) => sum + candidate.averageAmount,
        0,
      )
      const medianAmount = selectedSeriesCandidates.reduce(
        (sum, candidate) => sum + candidate.medianAmount,
        0,
      )
      const lastAmount = selectedSeriesCandidates.reduce((sum, candidate) => sum + candidate.lastAmount, 0)
      const monthlyEquivalent = selectedSeriesCandidates.reduce(
        (sum, candidate) => sum + candidate.monthlyEquivalent,
        0,
      )
      const confidenceWeight = selectedSeriesCandidates.reduce(
        (sum, candidate) => sum + candidate.monthlyEquivalent,
        0,
      )
      const confidence =
        confidenceWeight > 0
          ? clampConfidence(
              selectedSeriesCandidates.reduce(
                (sum, candidate) => sum + candidate.confidence * candidate.monthlyEquivalent,
                0,
              ) / confidenceWeight,
            )
          : primaryCandidate.confidence
      const nextExpectedDate = format(
        addDays(parseISO(lastChargeDate), primaryCandidate.cadenceDetected.days),
        'yyyy-MM-dd',
      )
      const merchant = mergedSeriesTransactions[mergedSeriesTransactions.length - 1]?.merchantDisplay ?? 'Unknown'
      return {
        merchant,
        merchantGroupKey,
        category,
        cardHolder,
        occurrences: mergedSeriesTransactions.length,
        averageAmount,
        medianAmount,
        lastAmount,
        monthlyEquivalent,
        cadence: primaryCandidate.cadenceDetected.cadence,
        cadenceDays: primaryCandidate.cadenceDetected.days,
        lastChargeDate,
        nextExpectedDate,
        status,
        priceTrend: toPriceTrend(lastAmount, medianAmount),
        matchedTransactionIds: mergedSeriesTransactions.map((tx) => tx.transactionId),
        confidence,
      }
    })
    .filter((candidate): candidate is RecurringCandidate => Boolean(candidate))
    .sort((left, right) => right.monthlyEquivalent - left.monthlyEquivalent || right.confidence - left.confidence)
}
