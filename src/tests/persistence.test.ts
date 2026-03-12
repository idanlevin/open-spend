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
})
