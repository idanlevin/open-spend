import { beforeEach, describe, expect, it } from 'vitest'
import { createSampleAmexWorkbookBuffer } from '@/fixtures/amex-sample'
import { importStatementFiles } from '@/lib/import/pipeline'
import { db } from '@/lib/storage/db'
import {
  initializeWorkspace,
  loadWorkspaceSnapshot,
  setTransactionTags,
  upsertTransactionOverride,
} from '@/lib/storage/workspace-service'

async function resetDb() {
  await Promise.all(db.tables.map((table) => table.clear()))
  await initializeWorkspace()
}

describe('local persistence', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('persists transaction override and tags', async () => {
    const file = new File([createSampleAmexWorkbookBuffer()], 'statement.xlsx')
    await importStatementFiles([file], 'folder')

    const tx = (await db.transactionsNormalized.toArray())[0]
    const tag = (await db.tags.toArray())[0]
    await upsertTransactionOverride(tx.transactionId, {
      notes: 'Reviewed for taxes',
      isBusiness: true,
    })
    await setTransactionTags(tx.transactionId, [tag.tagId])

    const snapshot = await loadWorkspaceSnapshot()
    const enriched = snapshot.transactions.find((row) => row.transactionId === tx.transactionId)

    expect(enriched?.notes).toBe('Reviewed for taxes')
    expect(enriched?.isBusiness).toBe(true)
    expect(enriched?.tags[0]?.tagId).toBe(tag.tagId)
  })

  it('maps legacy uncategorized payments to Transfers/Credits in snapshot', async () => {
    await db.transactionsNormalized.put({
      transactionId: 'txn_payment_legacy',
      statementId: 'stmt_legacy',
      transactionDate: '2025-01-20',
      postDate: '2025-01-21',
      descriptionRaw: 'AUTOPAY PAYMENT - THANK YOU',
      descriptionNormalized: 'autopay payment thank you',
      cardMember: 'Ada',
      accountLastDigits: '1009',
      amount: -1200,
      merchantRaw: 'Autopay Payment Thank You',
      merchantNormalized: 'Autopay Payment Thank You',
      extendedDetails: '',
      statementDescriptor: 'AUTOPAY PAYMENT - THANK YOU',
      address: '',
      city: '',
      state: '',
      zip: '',
      country: 'US',
      reference: 'legacy-1',
      amexCategoryRaw: '',
      categoryIdResolved: 'cat_uncategorized',
      transactionKind: 'payment',
      isCredit: true,
      isRefund: false,
      isPayment: true,
      isPendingLike: false,
      duplicateGroupKey: 'legacy',
      sourceRowFingerprint: 'legacy-fingerprint',
      importBatchId: 'import_legacy',
      hasManualOverride: false,
      hasRuleOverride: false,
    })

    const snapshot = await loadWorkspaceSnapshot()
    const payment = snapshot.transactions.find((row) => row.transactionId === 'txn_payment_legacy')

    expect(payment?.categoryFinalId).toBe('cat_transfers_credits')
    expect(payment?.categoryFinalName).toBe('Transfers/Credits')
  })
})
