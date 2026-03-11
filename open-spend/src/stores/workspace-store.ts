import { create } from 'zustand'
import { importStatementFiles, type ImportSummary } from '@/lib/import/pipeline'
import {
  clearWorkspaceData,
  createTag,
  initializeWorkspace,
  loadWorkspaceSnapshot,
  renameMerchantEverywhere,
  setTransactionTags,
  upsertCategoryAlias,
  upsertCategoryName,
  upsertRule,
  upsertTransactionOverride,
} from '@/lib/storage/workspace-service'
import type { Category, EnrichedTransaction, Rule, Statement, Tag } from '@/types/domain'

interface WorkspaceState {
  initialized: boolean
  loading: boolean
  error?: string
  statements: Statement[]
  transactions: EnrichedTransaction[]
  categories: Category[]
  tags: Tag[]
  rules: Rule[]
  latestImport?: ImportSummary
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  importFiles: (files: File[], folderLabel: string) => Promise<void>
  updateCategoryOverride: (transactionId: string, categoryId: string) => Promise<void>
  updateTransactionFlags: (
    transactionId: string,
    patch: {
      isExcludedFromAnalytics?: boolean
      isBusiness?: boolean
      isReimbursable?: boolean
      notes?: string
      merchantOverride?: string
    },
  ) => Promise<void>
  updateTags: (transactionId: string, tagIds: string[]) => Promise<void>
  createTag: (name: string, colorToken: string) => Promise<void>
  remapRawCategory: (rawCategory: string, categoryId: string) => Promise<void>
  renameCategory: (categoryId: string, name: string) => Promise<void>
  renameMerchant: (merchantRaw: string, merchantNormalized: string) => Promise<void>
  saveRule: (rule: Rule) => Promise<void>
  clearWorkspace: () => Promise<void>
}

async function reloadData(set: (partial: Partial<WorkspaceState>) => void): Promise<void> {
  const snapshot = await loadWorkspaceSnapshot()
  set({
    statements: snapshot.statements,
    transactions: snapshot.transactions,
    categories: snapshot.categories,
    tags: snapshot.tags,
    rules: snapshot.rules,
  })
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  initialized: false,
  loading: false,
  statements: [],
  transactions: [],
  categories: [],
  tags: [],
  rules: [],
  initialize: async () => {
    set({ loading: true, error: undefined })
    try {
      await initializeWorkspace()
      await reloadData(set)
      set({ initialized: true, loading: false })
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Init failed' })
    }
  },
  refresh: async () => {
    set({ loading: true, error: undefined })
    try {
      await reloadData(set)
      set({ loading: false })
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Refresh failed' })
    }
  },
  importFiles: async (files, folderLabel) => {
    set({ loading: true, error: undefined })
    try {
      const summary = await importStatementFiles(files, folderLabel)
      await reloadData(set)
      set({ latestImport: summary, loading: false })
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Import failed' })
    }
  },
  updateCategoryOverride: async (transactionId, categoryId) => {
    await upsertTransactionOverride(transactionId, { categoryOverrideId: categoryId })
    await reloadData(set)
  },
  updateTransactionFlags: async (transactionId, patch) => {
    await upsertTransactionOverride(transactionId, patch)
    await reloadData(set)
  },
  updateTags: async (transactionId, tagIds) => {
    await setTransactionTags(transactionId, tagIds)
    await reloadData(set)
  },
  createTag: async (name, colorToken) => {
    await createTag(name, colorToken)
    await reloadData(set)
  },
  remapRawCategory: async (rawCategory, categoryId) => {
    await upsertCategoryAlias(rawCategory, categoryId)
    await reloadData(set)
  },
  renameCategory: async (categoryId, name) => {
    await upsertCategoryName(categoryId, name)
    await reloadData(set)
  },
  renameMerchant: async (merchantRaw, merchantNormalized) => {
    await renameMerchantEverywhere(merchantRaw, merchantNormalized)
    await reloadData(set)
  },
  saveRule: async (rule) => {
    await upsertRule(rule)
    await reloadData(set)
  },
  clearWorkspace: async () => {
    await clearWorkspaceData()
    await reloadData(set)
    set({ latestImport: undefined })
  },
}))
