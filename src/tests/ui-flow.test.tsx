import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { TransactionsPage } from '@/features/transactions/transactions-page'
import { useTimeRangeStore } from '@/stores/time-range-store'
import { useWorkspaceStore } from '@/stores/workspace-store'
import { useViewStore } from '@/stores/view-store'

describe('ui flows', () => {
  const renderTransactionsPage = () =>
    render(
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>,
    )

  beforeEach(() => {
    useTimeRangeStore.getState().reset()
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
        paymentsOnly: false,
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
          transactionKind: 'charge',
          isCredit: false,
          isRefund: false,
          isPayment: false,
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
      revertTransactionEdits: async () => {},
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
    renderTransactionsPage()
    expect(screen.getByText('STARBUCKS 001')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Search all columns...'), 'nonexistent{enter}')

    expect(screen.queryByText('STARBUCKS 001')).not.toBeInTheDocument()
  })

  it('opens details drawer when a row is clicked', async () => {
    const user = userEvent.setup()
    renderTransactionsPage()
    await user.click(screen.getByText('STARBUCKS 001'))
    expect(screen.getAllByText('Raw Category').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Dining').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Starbucks' })).toBeInTheDocument()
    expect(screen.getByText('Save overrides')).toBeInTheDocument()
  })

  it('shows bulk actions only after selecting rows', async () => {
    const user = userEvent.setup()
    renderTransactionsPage()
    expect(screen.queryByText('Bulk actions (1)')).not.toBeInTheDocument()
    await user.click(screen.getByLabelText('Select row'))
    expect(screen.getByText('Bulk actions (1)')).toBeInTheDocument()
  })

  it('applies merchant edits as global rename', async () => {
    const updateTransactionFlags = vi.fn(async () => {})
    const renameMerchant = vi.fn(async () => {})
    const updateCategoryOverride = vi.fn(async () => {})
    const updateTags = vi.fn(async () => {})

    useWorkspaceStore.setState({
      updateTransactionFlags,
      renameMerchant,
      updateCategoryOverride,
      updateTags,
    })

    const user = userEvent.setup()
    renderTransactionsPage()
    await user.click(screen.getByText('STARBUCKS 001'))
    const merchantInput = screen.getByDisplayValue('Starbucks')
    await user.clear(merchantInput)
    await user.type(merchantInput, 'Screenil')
    await user.click(screen.getByText('Save overrides'))

    await waitFor(() => {
      expect(renameMerchant).toHaveBeenCalledWith('Starbucks', 'Screenil')
    })
    expect(updateTransactionFlags).not.toHaveBeenCalled()
  })

  it('shows manual edit summary and allows reverting', async () => {
    const revertTransactionEdits = vi.fn(async () => {})
    const [baseTransaction] = useWorkspaceStore.getState().transactions
    useWorkspaceStore.setState({
      transactions: [
        {
          ...baseTransaction,
          hasManualOverride: true,
          categoryFinalId: 'cat_uncategorized',
          categoryFinalName: 'Uncategorized',
          notes: 'Reviewed',
          manualOverride: {
            transactionId: 't1',
            categoryOverrideId: 'cat_uncategorized',
            notes: 'Reviewed',
            updatedAt: new Date().toISOString(),
          },
        },
      ],
      revertTransactionEdits,
    })

    const user = userEvent.setup()
    renderTransactionsPage()
    await user.click(screen.getByText('STARBUCKS 001'))
    expect(screen.getByText('Manual edits')).toBeInTheDocument()
    await user.click(screen.getByText('Revert all manual edits'))
    await waitFor(() => {
      expect(revertTransactionEdits).toHaveBeenCalled()
    })
  })

  it('supports bulk revert manual edits', async () => {
    const revertTransactionEdits = vi.fn(async () => {})
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    try {
      const [baseTransaction] = useWorkspaceStore.getState().transactions
      useWorkspaceStore.setState({
        transactions: [
          {
            ...baseTransaction,
            hasManualOverride: true,
            notes: 'Manual note',
            manualOverride: {
              transactionId: 't1',
              notes: 'Manual note',
              updatedAt: new Date().toISOString(),
            },
          },
        ],
        revertTransactionEdits,
      })

      const user = userEvent.setup()
      renderTransactionsPage()
      await user.click(screen.getByLabelText('Select row'))
      await user.click(screen.getByText('Bulk actions (1)'))
      await user.click(screen.getByText('Revert manual edits on selected'))

      await waitFor(() => {
        expect(revertTransactionEdits).toHaveBeenCalledWith('t1')
      })
      expect(confirmSpy).toHaveBeenCalled()
    } finally {
      confirmSpy.mockRestore()
    }
  })
})
