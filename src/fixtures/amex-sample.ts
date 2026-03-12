import * as XLSX from 'xlsx'

export function createSampleAmexWorkbookBuffer(): ArrayBuffer {
  const rows: Array<Array<string | number>> = [
    ['AMEX Platinum Statement'],
    ['Prepared For: Ada Lovelace'],
    ['Account ending 1009'],
    ['Statement Period: 01/01/2025 - 01/31/2025'],
    [],
    [
      'Date',
      'Post Date',
      'Description',
      'Card Member',
      'Amount',
      'Category',
      'City',
      'State',
      'Country',
      'Reference',
    ],
    ['01/02/2025', '01/03/2025', 'AMAZON MARKETPLACE NA', 'Ada', 89.23, 'Shopping', 'Austin', 'TX', 'US', 'A1'],
    ['01/04/2025', '01/05/2025', 'WHOLE FOODS 101', 'Ada', 45.87, 'Groceries', 'Austin', 'TX', 'US', 'A2'],
    ['01/05/2025', '01/06/2025', 'UBER TRIP HELP.UBER.COM', 'Charles', 24.56, 'Transportation', 'Austin', 'TX', 'US', 'A3'],
    ['01/08/2025', '01/09/2025', 'NETFLIX.COM', 'Ada', 19.99, 'Entertainment', 'Austin', 'TX', 'US', 'A4'],
    ['01/10/2025', '01/10/2025', 'AMAZON REFUND', 'Ada', -15.0, 'Credit', 'Austin', 'TX', 'US', 'A5'],
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions')
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
