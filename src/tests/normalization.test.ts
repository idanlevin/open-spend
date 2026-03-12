import { describe, expect, it } from 'vitest'
import { normalizeMerchantName } from '@/lib/normalization/merchant'
import { normalizeTransaction } from '@/lib/normalization/transaction'
import { resolveCategoryId } from '@/lib/normalization/category'

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
    expect(tx.categoryIdResolved).toBe('cat_transfers_credits')
  })

  it('maps all provided AMEX categories to system categories', () => {
    const cases: Array<[string, string]> = [
      ['Business Services-Advertising Services', 'cat_business'],
      ['Business Services-Contracting Services', 'cat_business'],
      ['Business Services-Health Care Services', 'cat_health'],
      ['Business Services-Insurance Services', 'cat_financial'],
      ['Business Services-Internet Services', 'cat_business'],
      ['Business Services-Mailing & Shipping', 'cat_business'],
      ['Business Services-Office Supplies', 'cat_business'],
      ['Business Services-Other Services', 'cat_business'],
      ['Business Services-Printing & Publishing', 'cat_business'],
      ['Business Services-Professional Services', 'cat_business'],
      ['Communications-Cable & Internet Comm', 'cat_utilities'],
      ['Entertainment-Associations', 'cat_entertainment'],
      ['Entertainment-General Attractions', 'cat_entertainment'],
      ['Entertainment-General Events', 'cat_entertainment'],
      ['Entertainment-Theatrical Events', 'cat_entertainment'],
      ['Fees & Adjustments-Fees & Adjustments', 'cat_financial'],
      ['Merchandise & Supplies-Arts & Jewelry', 'cat_shopping'],
      ['Merchandise & Supplies-Clothing Stores', 'cat_shopping'],
      ['Merchandise & Supplies-Computer Supplies', 'cat_shopping'],
      ['Merchandise & Supplies-Department Stores', 'cat_shopping'],
      ['Merchandise & Supplies-Florists & Garden', 'cat_shopping'],
      ['Merchandise & Supplies-Furnishing', 'cat_shopping'],
      ['Merchandise & Supplies-General Retail', 'cat_shopping'],
      ['Merchandise & Supplies-Groceries', 'cat_food_dining'],
      ['Merchandise & Supplies-Hardware Supplies', 'cat_shopping'],
      ['Merchandise & Supplies-Internet Purchase', 'cat_shopping'],
      ['Merchandise & Supplies-Mail Order', 'cat_shopping'],
      ['Merchandise & Supplies-Pharmacies', 'cat_health'],
      ['Merchandise & Supplies-Sporting Goods Stores', 'cat_shopping'],
      ['Merchandise & Supplies-Wholesale Stores', 'cat_shopping'],
      ['Other-Education', 'cat_education'],
      ['Other-Government Services', 'cat_financial'],
      ['Other-Miscellaneous', 'cat_transfers_credits'],
      ['Other-Charities', 'cat_gifts'],
      ['Other-Utilities', 'cat_utilities'],
      ['Restaurant-Bar & Café', 'cat_food_dining'],
      ['Restaurant-Restaurant', 'cat_food_dining'],
      ['Transportation-Fuel', 'cat_transportation'],
      ['Transportation-Other Transportation', 'cat_transportation'],
      ['Transportation-Parking Charges', 'cat_transportation'],
      ['Transportation-Rail Services', 'cat_transportation'],
      ['Transportation-Taxis & Coach', 'cat_transportation'],
      ['Transportation-Tolls & Fees', 'cat_transportation'],
      ['Transportation-Vehicle Leasing & Purchase', 'cat_transportation'],
      ['Travel-Airline', 'cat_travel'],
      ['Travel-Lodging', 'cat_travel'],
      ['Travel-Travel Agencies', 'cat_travel'],
      ['Travel-Vehicle Rental', 'cat_travel'],
      ['Payments', 'cat_transfers_credits'],
    ]

    for (const [rawCategory, expectedCategoryId] of cases) {
      expect(resolveCategoryId(rawCategory, [])).toBe(expectedCategoryId)
    }
  })
})
