import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  filterStatementsByTimeRange,
  filterTransactionsByTimeRange,
  resolveTimeRange,
  type ResolvedTimeRange,
} from '@/lib/analytics/time-range'
import { useTimeRangeStore } from '@/stores/time-range-store'
import type { EnrichedTransaction, Statement } from '@/types/domain'

function useTimeRangeSnapshot() {
  return useTimeRangeStore(
    useShallow((state) => ({
      mode: state.mode,
      statementId: state.statementId,
      customStartDate: state.customStartDate,
      customEndDate: state.customEndDate,
      month: state.month,
      year: state.year,
      quarter: state.quarter,
      lastNStatements: state.lastNStatements,
    })),
  )
}

export function useResolvedTimeRange(statements: Statement[]): ResolvedTimeRange {
  const scope = useTimeRangeSnapshot()
  return useMemo(() => resolveTimeRange(scope, statements), [scope, statements])
}

export function useScopedTransactions(
  transactions: EnrichedTransaction[],
  statements: Statement[],
): EnrichedTransaction[] {
  const resolvedScope = useResolvedTimeRange(statements)
  return useMemo(
    () => filterTransactionsByTimeRange(transactions, resolvedScope),
    [resolvedScope, transactions],
  )
}

export function useScopedStatements(statements: Statement[]): Statement[] {
  const resolvedScope = useResolvedTimeRange(statements)
  return useMemo(() => filterStatementsByTimeRange(statements, resolvedScope), [resolvedScope, statements])
}
