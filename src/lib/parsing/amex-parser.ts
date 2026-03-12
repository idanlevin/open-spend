import * as XLSX from 'xlsx'
import type { ParseResult, ParsedStatementMetadata, ParsedTransactionRow } from '@/lib/parsing/types'
import { parseAmount, titleCase, toIsoDate } from '@/lib/utils'

type SheetMatrix = Array<Array<string | number | null>>

interface ColumnMap {
  transactionDate: number
  postDate?: number
  descriptionRaw: number
  cardMember?: number
  accountLastDigits?: number
  amount?: number
  debit?: number
  credit?: number
  merchantRaw?: number
  extendedDetails?: number
  statementDescriptor?: number
  address?: number
  city?: number
  state?: number
  zip?: number
  country?: number
  reference?: number
  amexCategoryRaw?: number
}

const HEADER_ALIASES: Record<keyof ColumnMap, string[]> = {
  transactionDate: ['date', 'transaction date'],
  postDate: ['post date', 'posted date'],
  descriptionRaw: ['description', 'details', 'transaction description'],
  cardMember: ['card member', 'member'],
  accountLastDigits: ['account #', 'account', 'account ending', 'card ending'],
  amount: ['amount', 'charge amount', 'transaction amount'],
  debit: ['debit', 'charges'],
  credit: ['credit', 'refund', 'credits'],
  merchantRaw: ['merchant', 'merchant name'],
  extendedDetails: ['extended details', 'additional details'],
  statementDescriptor: ['statement descriptor', 'descriptor'],
  address: ['address'],
  city: ['city'],
  state: ['state'],
  zip: ['zip', 'postal'],
  country: ['country'],
  reference: ['reference', 'ref'],
  amexCategoryRaw: ['category', 'amex category'],
}

const DEFAULT_METADATA: ParsedStatementMetadata = {
  cardProductName: 'AMEX',
  preparedFor: 'Unknown',
  accountNumberMasked: '****',
  statementStartDate: '',
  statementEndDate: '',
  currency: 'USD',
}

function toCellText(value: string | number | null | undefined): string {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w ]/g, '').trim()
}

function parseDateLoose(input: string): string {
  const maybe = input.trim()
  if (!maybe) return ''
  const direct = new Date(maybe)
  if (!Number.isNaN(direct.getTime())) return toIsoDate(direct)

  const slash = maybe.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3]
    return toIsoDate(`${year}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`)
  }
  return ''
}

function matchAlias(header: string, aliases: string[]): boolean {
  return aliases.some((alias) => header === alias || header.includes(alias))
}

function detectHeaderRow(rows: SheetMatrix): number {
  const limit = Math.min(rows.length, 50)
  for (let idx = 0; idx < limit; idx += 1) {
    const normalizedCells = rows[idx].map((cell) => normalizeHeader(toCellText(cell)))
    const hasDate = normalizedCells.some((cell) => matchAlias(cell, HEADER_ALIASES.transactionDate))
    const hasDescription = normalizedCells.some((cell) =>
      matchAlias(cell, HEADER_ALIASES.descriptionRaw),
    )
    const hasAmount =
      normalizedCells.some((cell) => matchAlias(cell, HEADER_ALIASES.amount)) ||
      normalizedCells.some((cell) => matchAlias(cell, HEADER_ALIASES.debit)) ||
      normalizedCells.some((cell) => matchAlias(cell, HEADER_ALIASES.credit))

    if (hasDate && hasDescription && hasAmount) {
      return idx
    }
  }
  return -1
}

function detectColumnMap(headers: string[]): ColumnMap {
  const map: Partial<ColumnMap> = {}
  const normalized = headers.map((header) => normalizeHeader(header))

  normalized.forEach((header, idx) => {
    ;(Object.keys(HEADER_ALIASES) as Array<keyof ColumnMap>).forEach((key) => {
      if (map[key] !== undefined) return
      if (matchAlias(header, HEADER_ALIASES[key])) {
        map[key] = idx
      }
    })
  })

  if (map.transactionDate === undefined || map.descriptionRaw === undefined) {
    throw new Error('Unable to detect required transaction columns.')
  }
  return map as ColumnMap
}

function extractMetadata(rows: SheetMatrix): ParsedStatementMetadata {
  const metadata: ParsedStatementMetadata = { ...DEFAULT_METADATA }
  const haystack = rows
    .slice(0, 30)
    .flat()
    .map((cell) => toCellText(cell))
    .filter(Boolean)

  for (const text of haystack) {
    const normalized = text.toLowerCase()

    if (normalized.includes('prepared for')) {
      metadata.preparedFor = titleCase(text.replace(/prepared for[:\s]*/i, '')) || metadata.preparedFor
    }
    if (normalized.includes('account') && normalized.match(/\*{2,}|\d{4}$/)) {
      const account = text.match(/(\*{2,}\d{2,4}|\d{4})/)
      if (account) metadata.accountNumberMasked = account[1]
    }
    if (normalized.includes('currency')) {
      const currency = text.match(/\b[A-Z]{3}\b/)
      if (currency) metadata.currency = currency[0]
    }
    if (normalized.includes('platinum') || normalized.includes('gold') || normalized.includes('blue')) {
      metadata.cardProductName = text
    }
    if (normalized.includes('statement period') || normalized.includes('from') && normalized.includes('to')) {
      const dates = text.match(/([A-Za-z]{3,9}\s+\d{1,2},\s+\d{2,4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/g)
      if (dates && dates.length >= 2) {
        metadata.statementStartDate = parseDateLoose(dates[0])
        metadata.statementEndDate = parseDateLoose(dates[1])
      }
    }
  }

  return metadata
}

function parseAmountFromRow(row: string[], map: ColumnMap): number {
  if (map.amount !== undefined) {
    return parseAmount(row[map.amount])
  }

  const debit = map.debit !== undefined ? Math.abs(parseAmount(row[map.debit])) : 0
  const credit = map.credit !== undefined ? Math.abs(parseAmount(row[map.credit])) : 0
  return debit - credit
}

function rowToTransaction(row: string[], map: ColumnMap, rowIndex: number): ParsedTransactionRow | null {
  const transactionDate = parseDateLoose(toCellText(row[map.transactionDate]))
  const descriptionRaw = toCellText(row[map.descriptionRaw])
  const amount = parseAmountFromRow(row, map)

  if (!transactionDate || !descriptionRaw || amount === 0) {
    return null
  }

  return {
    rowIndex,
    transactionDate,
    postDate: map.postDate !== undefined ? parseDateLoose(toCellText(row[map.postDate])) : '',
    descriptionRaw,
    cardMember: map.cardMember !== undefined ? toCellText(row[map.cardMember]) : '',
    accountLastDigits: map.accountLastDigits !== undefined ? toCellText(row[map.accountLastDigits]) : '',
    amount,
    merchantRaw:
      map.merchantRaw !== undefined ? toCellText(row[map.merchantRaw]) : descriptionRaw.split('  ')[0] ?? '',
    extendedDetails: map.extendedDetails !== undefined ? toCellText(row[map.extendedDetails]) : '',
    statementDescriptor:
      map.statementDescriptor !== undefined ? toCellText(row[map.statementDescriptor]) : '',
    address: map.address !== undefined ? toCellText(row[map.address]) : '',
    city: map.city !== undefined ? toCellText(row[map.city]) : '',
    state: map.state !== undefined ? toCellText(row[map.state]) : '',
    zip: map.zip !== undefined ? toCellText(row[map.zip]) : '',
    country: map.country !== undefined ? toCellText(row[map.country]) : '',
    reference: map.reference !== undefined ? toCellText(row[map.reference]) : '',
    amexCategoryRaw: map.amexCategoryRaw !== undefined ? toCellText(row[map.amexCategoryRaw]) : '',
  }
}

function matrixFromWorkbook(workbook: XLSX.WorkBook): SheetMatrix {
  const candidate = workbook.SheetNames.find((sheetName) => {
    const lower = sheetName.toLowerCase()
    return lower.includes('transaction') || lower.includes('activity') || lower.includes('statement')
  })
  const sheet = workbook.Sheets[candidate ?? workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as SheetMatrix
}

export function parseAmexWorkbook(content: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(content, { type: 'array' })
  const rows = matrixFromWorkbook(workbook)
  const warnings: string[] = []

  const metadata = extractMetadata(rows)
  const headerRowIdx = detectHeaderRow(rows)
  if (headerRowIdx < 0) {
    throw new Error('Could not locate transaction header row.')
  }

  const headers = rows[headerRowIdx].map((cell) => toCellText(cell))
  const columnMap = detectColumnMap(headers)
  const parsedRows: ParsedTransactionRow[] = []

  for (let idx = headerRowIdx + 1; idx < rows.length; idx += 1) {
    const rawRow = rows[idx].map((cell) => toCellText(cell))
    if (rawRow.every((cell) => !cell)) continue
    const parsed = rowToTransaction(rawRow, columnMap, idx)
    if (parsed) {
      parsedRows.push(parsed)
    } else if (rawRow.some(Boolean)) {
      warnings.push(`Skipped row ${idx + 1}: missing required values.`)
    }
  }

  if (!metadata.statementStartDate || !metadata.statementEndDate) {
    const dates = parsedRows.map((row) => row.transactionDate).sort()
    metadata.statementStartDate = metadata.statementStartDate || dates[0] || ''
    metadata.statementEndDate = metadata.statementEndDate || dates[dates.length - 1] || ''
    warnings.push('Statement period inferred from transaction dates.')
  }

  return {
    metadata,
    rows: parsedRows,
    warnings,
  }
}
