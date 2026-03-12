import { describe, expect, it } from 'vitest'
import { normalizeMerchantName } from '@/lib/normalization/merchant'
import { normalizeTransaction } from '@/lib/normalization/transaction'

describe('normalization', () => {
  it('normalizes merchant naming variants', () => {
    expect(normalizeMerchantName('AMAZON MARKETPLACE NA')).toBe('Amazon')
    expect(normalizeMerchantName('uber trip help.uber.com')).toBe('Uber')
  })

  it('produces stable transaction identity and category', async () => {
    const tx = await normalizeTransaction({
      statementId: 's1',
      importBatchId: 'i1',
      statementStartDate: '2025-01-01',
      statementEndDate: '2025-01-31',
      categoryAliases: [],
      row: {
        rowIndex: 1,
        transactionDate: '2025-01-02',
        postDate: '2025-01-03',
        descriptionRaw: 'AMAZON MARKETPLACE NA',
        cardMember: 'Ada',
        accountLastDigits: '1009',
        amount: 120,
        merchantRaw: 'AMAZON MARKETPLACE NA',
        extendedDetails: '',
        statementDescriptor: '',
        address: '',
        city: '',
        state: '',
        zip: '',
        country: 'US',
        reference: 'ref1',
        amexCategoryRaw: 'Shopping',
      },
    })

    expect(tx.transactionId.startsWith('txn_')).toBe(true)
    expect(tx.categoryIdResolved).toBe('cat_shopping')
    expect(tx.merchantNormalized).toBe('Amazon')
  })

  it('classifies balance payments separately from refunds', async () => {
    const tx = await normalizeTransaction({
      statementId: 's1',
      importBatchId: 'i1',
      statementStartDate: '2025-01-01',
      statementEndDate: '2025-01-31',
      categoryAliases: [],
      row: {
        rowIndex: 2,
        transactionDate: '2025-01-20',
        postDate: '2025-01-21',
        descriptionRaw: 'Autopay Payment Thank You',
        cardMember: 'Ada',
        accountLastDigits: '1009',
        amount: -4500,
        merchantRaw: 'Autopay Payment Thank You',
        extendedDetails: '',
        statementDescriptor: 'AUTOPAY PAYMENT - THANK YOU',
        address: '',
        city: '',
        state: '',
        zip: '',
        country: 'US',
        reference: 'ref2',
        amexCategoryRaw: '',
      },
    })

    expect(tx.transactionKind).toBe('payment')
    expect(tx.isPayment).toBe(true)
    expect(tx.isRefund).toBe(false)
  })
})
