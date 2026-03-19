import {
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  isValid,
  parse,
  startOfMonth,
  startOfQuarter,
  startOfYear,
} from 'date-fns'
import type { EnrichedTransaction, Statement } from '@/types/domain'
import type { TimeRangeMode, TimeRangeState } from '@/stores/time-range-store'

export interface ResolvedTimeRange {
  mode: TimeRangeMode
  startDate?: string
  endDate?: string
  statementIds?: Set<string>
  label: string
}

function toIsoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function toStatementLabel(statement: Statement): string {
  return `${statement.statementStartDate} - ${statement.statementEndDate}`
}

export function sortStatementsNewestFirst(statements: Statement[]): Statement[] {
  return [...statements].sort((left, right) => right.statementEndDate.localeCompare(left.statementEndDate))
}

export function resolveTimeRange(
  scope: Pick<
    TimeRangeState,
    | 'mode'
    | 'statementId'
    | 'customStartDate'
    | 'customEndDate'
    | 'month'
    | 'year'
    | 'quarter'
    | 'lastNStatements'
  >,
  statements: Statement[],
  now = new Date(),
): ResolvedTimeRange {
  if (scope.mode === 'all') {
    return { mode: 'all', label: 'All time' }
  }

  if (scope.mode === 'statement') {
    const selected = statements.find((statement) => statement.statementId === scope.statementId)
    if (!selected) return { mode: 'statement', label: 'Specific statement' }
    return {
      mode: 'statement',
      statementIds: new Set([selected.statementId]),
      startDate: selected.statementStartDate,
      endDate: selected.statementEndDate,
      label: toStatementLabel(selected),
    }
  }

  if (scope.mode === 'lastStatements') {
    const sorted = sortStatementsNewestFirst(statements)
    const take = Math.max(1, Math.min(36, Number(scope.lastNStatements || 1)))
    const selected = sorted.slice(0, take)
    if (selected.length === 0) {
      return { mode: 'lastStatements', label: `Last ${take} statement${take > 1 ? 's' : ''}` }
    }
    const startDate = [...selected]
      .sort((left, right) => left.statementStartDate.localeCompare(right.statementStartDate))[0]
      .statementStartDate
    const endDate = selected[0].statementEndDate
    return {
      mode: 'lastStatements',
      statementIds: new Set(selected.map((statement) => statement.statementId)),
      startDate,
      endDate,
      label: `Last ${selected.length} statement${selected.length > 1 ? 's' : ''}`,
    }
  }

  if (scope.mode === 'custom') {
    const startDate = scope.customStartDate || undefined
    const endDate = scope.customEndDate || undefined
    if (startDate && endDate && startDate > endDate) {
      return {
        mode: 'custom',
        startDate: endDate,
        endDate: startDate,
        label: `${endDate} - ${startDate}`,
      }
    }
    return {
      mode: 'custom',
      startDate,
      endDate,
      label: startDate || endDate ? `${startDate ?? '...'} - ${endDate ?? '...'}` : 'Custom range',
    }
  }

  if (scope.mode === 'month') {
    const parsed = parse(scope.month, 'yyyy-MM', now)
    if (!isValid(parsed)) return { mode: 'month', label: 'Month preset' }
    const startDate = toIsoDate(startOfMonth(parsed))
    const endDate = toIsoDate(endOfMonth(parsed))
    return { mode: 'month', startDate, endDate, label: format(parsed, 'MMMM yyyy') }
  }

  if (scope.mode === 'quarter') {
    const safeQuarter = Math.min(4, Math.max(1, scope.quarter))
    const parsed = new Date(scope.year, (safeQuarter - 1) * 3, 1)
    const startDate = toIsoDate(startOfQuarter(parsed))
    const endDate = toIsoDate(endOfQuarter(parsed))
    return { mode: 'quarter', startDate, endDate, label: `Q${safeQuarter} ${scope.year}` }
  }

  if (scope.mode === 'year') {
    const parsed = new Date(scope.year, 0, 1)
    const startDate = toIsoDate(startOfYear(parsed))
    const endDate = toIsoDate(endOfYear(parsed))
    return { mode: 'year', startDate, endDate, label: String(scope.year) }
  }

  const ytdStart = toIsoDate(startOfYear(new Date(scope.year, 0, 1)))
  const today = toIsoDate(now)
  return {
    mode: 'ytd',
    startDate: ytdStart,
    endDate: today,
    label: `YTD ${scope.year}`,
  }
}

export function filterTransactionsByTimeRange(
  transactions: EnrichedTransaction[],
  scope: ResolvedTimeRange,
): EnrichedTransaction[] {
  return transactions.filter((tx) => {
    if (scope.statementIds && !scope.statementIds.has(tx.statementId)) return false
    if (scope.startDate && tx.transactionDate < scope.startDate) return false
    if (scope.endDate && tx.transactionDate > scope.endDate) return false
    return true
  })
}

export function filterStatementsByTimeRange(statements: Statement[], scope: ResolvedTimeRange): Statement[] {
  return statements.filter((statement) => {
    if (scope.statementIds && !scope.statementIds.has(statement.statementId)) return false
    if (scope.startDate && statement.statementEndDate < scope.startDate) return false
    if (scope.endDate && statement.statementStartDate > scope.endDate) return false
    return true
  })
}
