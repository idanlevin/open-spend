import { beforeEach, describe, expect, it } from 'vitest'
import { createSampleAmexWorkbookBuffer } from '@/fixtures/amex-sample'
import { importStatementFiles } from '@/lib/import/pipeline'
import { db } from '@/lib/storage/db'
import { initializeWorkspace } from '@/lib/storage/workspace-service'

async function resetDb() {
  await Promise.all(db.tables.map((table) => table.clear()))
  await initializeWorkspace()
}

describe('import deduplication', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('skips duplicate file import by hash', async () => {
    const buffer = createSampleAmexWorkbookBuffer()
    const file = new File([buffer], 'amex-statement.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    const first = await importStatementFiles([file], 'test-folder')
    const second = await importStatementFiles([file], 'test-folder')

    expect(first.importBatch.transactionsAdded).toBeGreaterThan(0)
    expect(second.importBatch.duplicatesSkipped).toBeGreaterThan(0)
  })
})
