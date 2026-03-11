import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TransactionsPage } from '@/features/transactions/transactions-page'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { useViewStore } from '@/stores/view-store'

describe('ui flows', () => {
  beforeEach(() => {
    useViewStore.setState({
      filters: {
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
      },
    })

    useWorkspaceStore.setState({
      statements: [],
      categories: [
        {
          categoryId: 'cat_food_dining',
          name: 'Food & Dining',
          parentCategoryId: null,
          colorToken: '#111',
          iconToken: 'folder',
          isSystem: true,
          isHidden: false,
          sortOrder: 0,
        },
        {
          categoryId: 'cat_uncategorized',
          name: 'Uncategorized',
          parentCategoryId: null,
          colorToken: '#222',
          iconToken: 'folder',
          isSystem: true,
          isHidden: false,
          sortOrder: 1,
        },
      ],
      tags: [],
      rules: [],
      transactions: [
        {
          transactionId: 't1',
          statementId: 's1',
          transactionDate: '2025-01-01',
          postDate: null,
          descriptionRaw: 'STARBUCKS 001',
          descriptionNormalized: 'starbucks 001',
          cardMember: 'Ada',
          accountLastDigits: '1009',
          amount: 9.2,
          merchantRaw: 'STARBUCKS 001',
          merchantNormalized: 'Starbucks',
          merchantFinal: 'Starbucks',
          extendedDetails: '',
          statementDescriptor: '',
          address: '',
          city: '',
          state: '',
          zip: '',
          country: 'US',
          reference: 'r1',
          amexCategoryRaw: 'Dining',
          categoryIdResolved: 'cat_food_dining',
          categoryFinalId: 'cat_food_dining',
          categoryFinalName: 'Food & Dining',
          isCredit: false,
          isRefund: false,
          isPendingLike: false,
          duplicateGroupKey: 'd1',
          sourceRowFingerprint: 'f1',
          importBatchId: 'i1',
          hasManualOverride: false,
          hasRuleOverride: false,
          notes: '',
          tags: [],
          isExcludedFromAnalytics: false,
          isBusiness: false,
          isReimbursable: false,
        },
      ],
      updateCategoryOverride: async () => {},
      updateTransactionFlags: async () => {},
      updateTags: async () => {},
      createTag: async () => {},
      remapRawCategory: async () => {},
      renameCategory: async () => {},
      renameMerchant: async () => {},
      saveRule: async () => {},
      importFiles: async () => {},
      initialize: async () => {},
      refresh: async () => {},
      clearWorkspace: async () => {},
      initialized: true,
      loading: false,
      error: undefined,
      latestImport: undefined,
    })
  })

  it('filters transactions by search query', async () => {
    render(<TransactionsPage />)
    expect(screen.getByText('STARBUCKS 001')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Search merchant, note, reference...'), 'nonexistent')

    expect(screen.queryByText('STARBUCKS 001')).not.toBeInTheDocument()
  })

  it('opens details drawer when a row is clicked', async () => {
    const user = userEvent.setup()
    render(<TransactionsPage />)
    await user.click(screen.getByText('STARBUCKS 001'))
    expect(screen.getByText('Save overrides')).toBeInTheDocument()
  })

  it('resets filters from toolbar control', async () => {
    const user = userEvent.setup()
    render(<TransactionsPage />)
    const search = screen.getByPlaceholderText('Search merchant, note, reference...')
    await user.type(search, 'abc')
    expect((search as HTMLInputElement).value).toBe('abc')
    await user.click(screen.getByText('Reset filters'))
    expect((search as HTMLInputElement).value).toBe('')
  })
})
