import * as XLSX from 'xlsx'
import { db } from '@/lib/storage/db'
import type { EnrichedTransaction } from '@/types/domain'

function downloadBlob(fileName: string, blob: Blob): void {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
}

export function exportTransactionsCsv(rows: EnrichedTransaction[], fileName = 'transactions.csv'): void {
  const headers = [
    'Date',
    'Statement',
    'Merchant',
    'Description',
    'Cardholder',
    'Amount',
    'Category',
    'Tags',
    'City',
    'State',
    'Country',
    'Reference',
    'Notes',
    'Excluded',
    'Reimbursable',
    'Business',
  ]
  const csvRows = rows.map((tx) =>
    [
      tx.transactionDate,
      tx.statementId,
      tx.merchantFinal,
      tx.descriptionRaw,
      tx.cardMember,
      tx.amount.toFixed(2),
      tx.categoryFinalName,
      tx.tags.map((tag) => tag.name).join('|'),
      tx.city,
      tx.state,
      tx.country,
      tx.reference,
      tx.notes,
      tx.isExcludedFromAnalytics ? 'yes' : 'no',
      tx.isReimbursable ? 'yes' : 'no',
      tx.isBusiness ? 'yes' : 'no',
    ]
      .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
      .join(','),
  )
  const csv = [headers.join(','), ...csvRows].join('\n')
  downloadBlob(fileName, new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
}

export function exportTransactionsXlsx(
  rows: EnrichedTransaction[],
  fileName = 'transactions-cleaned.xlsx',
): void {
  const data = rows.map((tx) => ({
    Date: tx.transactionDate,
    Statement: tx.statementId,
    Merchant: tx.merchantFinal,
    Description: tx.descriptionRaw,
    Cardholder: tx.cardMember,
    Amount: tx.amount,
    Category: tx.categoryFinalName,
    Tags: tx.tags.map((tag) => tag.name).join(', '),
    City: tx.city,
    State: tx.state,
    Country: tx.country,
    Reference: tx.reference,
    Notes: tx.notes,
    Excluded: tx.isExcludedFromAnalytics,
    Reimbursable: tx.isReimbursable,
    Business: tx.isBusiness,
  }))
  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions')
  const binary = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  downloadBlob(fileName, new Blob([binary], { type: 'application/octet-stream' }))
}

export async function exportWorkspaceBackup(fileName = 'open-spend-workspace.json'): Promise<void> {
  const payload: Record<string, unknown> = {}
  for (const table of db.tables) {
    payload[table.name] = await table.toArray()
  }
  downloadBlob(fileName, new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
}
