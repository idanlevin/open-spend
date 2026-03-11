import { describe, expect, it } from 'vitest'
import { parseAmexWorkbook } from '@/lib/parsing/amex-parser'
import { createSampleAmexWorkbookBuffer } from '@/fixtures/amex-sample'

describe('amex parser', () => {
  it('extracts metadata and rows from sample workbook', () => {
    const result = parseAmexWorkbook(createSampleAmexWorkbookBuffer())

    expect(result.rows.length).toBeGreaterThanOrEqual(5)
    expect(result.metadata.preparedFor).toContain('Ada')
    expect(result.metadata.statementStartDate).toBe('2025-01-01')
    expect(result.metadata.statementEndDate).toBe('2025-01-31')
  })
})
