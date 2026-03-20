import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MerchantsPage } from '@/features/merchants/merchants-page'
import { useTimeRangeStore } from '@/stores/time-range-store'
import { useWorkspaceStore } from '@/stores/workspace-store'

describe('merchants deep links', () => {
  beforeEach(() => {
    useTimeRangeStore.getState().reset()
    useWorkspaceStore.setState({
      statements: [],
      categories: [
        {
          categoryId: 'cat_uncategorized',
          name: 'Uncategorized',
          parentCategoryId: null,
          colorToken: '#111',
          iconToken: 'folder',
          isSystem: true,
          isHidden: false,
          sortOrder: 0,
        },
        {
          categoryId: 'cat_entertainment',
          name: 'Entertainment',
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
          transactionId: 'txn_screenil',
          statementId: 'stmt_1',
          transactionDate: '2026-01-10',
          postDate: null,
          descriptionRaw: 'SCREENIL.COM',
          descriptionNormalized: 'screenil com',
          cardMember: 'IDAN LEVIN',
          accountLastDigits: '1009',
          amount: 120,
          merchantRaw: 'SCREENIL.COM',
          merchantNormalized: 'Screenil',
          merchantFinal: 'Screenil',
          extendedDetails: '',
          statementDescriptor: '',
          address: '',
          city: '',
          state: '',
          zip: '',
          country: 'US',
          reference: 'ref_1',
          amexCategoryRaw: 'Entertainment',
          categoryIdResolved: 'cat_entertainment',
          categoryFinalId: 'cat_entertainment',
          categoryFinalName: 'Entertainment',
          transactionKind: 'charge',
          isCredit: false,
          isRefund: false,
          isPayment: false,
          isPendingLike: false,
          duplicateGroupKey: 'd1',
          sourceRowFingerprint: 'f1',
          importBatchId: 'import_1',
          hasManualOverride: false,
          hasRuleOverride: false,
          notes: '',
          tags: [],
          isExcludedFromAnalytics: false,
          isBusiness: false,
          isReimbursable: false,
        },
        {
          transactionId: 'txn_other',
          statementId: 'stmt_1',
          transactionDate: '2026-01-11',
          postDate: null,
          descriptionRaw: 'OTHER.COM',
          descriptionNormalized: 'other com',
          cardMember: 'IDAN LEVIN',
          accountLastDigits: '1009',
          amount: 500,
          merchantRaw: 'OTHER.COM',
          merchantNormalized: 'Other',
          merchantFinal: 'Other',
          extendedDetails: '',
          statementDescriptor: '',
          address: '',
          city: '',
          state: '',
          zip: '',
          country: 'US',
          reference: 'ref_2',
          amexCategoryRaw: 'Uncategorized',
          categoryIdResolved: 'cat_uncategorized',
          categoryFinalId: 'cat_uncategorized',
          categoryFinalName: 'Uncategorized',
          transactionKind: 'charge',
          isCredit: false,
          isRefund: false,
          isPayment: false,
          isPendingLike: false,
          duplicateGroupKey: 'd2',
          sourceRowFingerprint: 'f2',
          importBatchId: 'import_1',
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
      rerunRules: async () => ({ processed: 0, matched: 0 }),
      importFiles: async () => {},
      initialize: async () => {},
      refresh: async () => {},
      clearWorkspace: async () => {},
      updateRecurringDecision: async () => {},
      updateRecurringCategoryOverride: async () => {},
      initialized: true,
      loading: false,
      error: undefined,
      latestImport: undefined,
    })
  })

  it('selects merchant from query param without filtering the table', () => {
    render(
      <MemoryRouter initialEntries={['/merchants?merchant=Screenil']}>
        <Routes>
          <Route path="/merchants" element={<MerchantsPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const searchInput = screen.getByPlaceholderText('Search merchant, alias, category...') as HTMLInputElement
    expect(searchInput.value).toBe('')
    expect(screen.getByDisplayValue('Screenil')).toBeInTheDocument()
    expect(screen.getAllByText('Screenil').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Other').length).toBeGreaterThan(0)
  })
})
