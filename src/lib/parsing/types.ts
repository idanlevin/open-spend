export interface ParsedStatementMetadata {
  cardProductName: string
  preparedFor: string
  accountNumberMasked: string
  statementStartDate: string
  statementEndDate: string
  currency: string
}

export interface ParsedTransactionRow {
  rowIndex: number
  transactionDate: string
  postDate?: string
  descriptionRaw: string
  cardMember: string
  accountLastDigits: string
  amount: number
  merchantRaw: string
  extendedDetails: string
  statementDescriptor: string
  address: string
  city: string
  state: string
  zip: string
  country: string
  reference: string
  amexCategoryRaw: string
}

export interface ParseResult {
  metadata: ParsedStatementMetadata
  rows: ParsedTransactionRow[]
  warnings: string[]
}
