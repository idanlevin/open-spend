import { create } from 'zustand'

export type GroupByOption = 'none' | 'category' | 'merchant' | 'cardMember' | 'statement' | 'month'

export interface TransactionFilters {
  query: string
  startDate: string
  endDate: string
  categoryIds: string[]
  merchants: string[]
  cardholders: string[]
  minAmount?: number
  maxAmount?: number
  uncategorizedOnly: boolean
  excludedOnly: boolean
  refundsOnly: boolean
  businessOnly: boolean
  reimbursableOnly: boolean
  groupBy: GroupByOption
}

interface ViewStore {
  filters: TransactionFilters
  setFilters: (patch: Partial<TransactionFilters>) => void
  resetFilters: () => void
}

const defaultFilters: TransactionFilters = {
  query: '',
  startDate: '',
  endDate: '',
  categoryIds: [],
  merchants: [],
  cardholders: [],
  uncategorizedOnly: false,
  excludedOnly: false,
  refundsOnly: false,
  businessOnly: false,
  reimbursableOnly: false,
  groupBy: 'none',
}

export const useViewStore = create<ViewStore>((set) => ({
  filters: defaultFilters,
  setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
  resetFilters: () => set({ filters: defaultFilters }),
}))
