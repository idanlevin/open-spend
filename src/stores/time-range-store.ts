import { format } from 'date-fns'
import { create } from 'zustand'

export type TimeRangeMode =
  | 'all'
  | 'statement'
  | 'custom'
  | 'month'
  | 'quarter'
  | 'year'
  | 'ytd'
  | 'lastStatements'

export interface TimeRangeState {
  mode: TimeRangeMode
  statementId: string
  customStartDate: string
  customEndDate: string
  month: string
  year: number
  quarter: 1 | 2 | 3 | 4
  lastNStatements: number
  setMode: (mode: TimeRangeMode) => void
  patch: (
    next: Partial<
      Omit<TimeRangeState, 'setMode' | 'patch' | 'reset'>
    >,
  ) => void
  reset: () => void
}

const now = new Date()

const defaultState: Omit<TimeRangeState, 'setMode' | 'patch' | 'reset'> = {
  mode: 'all',
  statementId: '',
  customStartDate: '',
  customEndDate: '',
  month: format(now, 'yyyy-MM'),
  year: Number(format(now, 'yyyy')),
  quarter: (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4,
  lastNStatements: 3,
}

export const useTimeRangeStore = create<TimeRangeState>((set) => ({
  ...defaultState,
  setMode: (mode) => set({ mode }),
  patch: (next) => set((state) => ({ ...state, ...next })),
  reset: () => set(defaultState),
}))
