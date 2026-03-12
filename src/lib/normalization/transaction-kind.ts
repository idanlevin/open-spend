import type { TransactionKind } from '@/types/domain'

interface TransactionKindInput {
  amount: number
  descriptionRaw: string
  statementDescriptor?: string
  amexCategoryRaw?: string
}

const PAYMENT_PATTERNS = [
  /\bautopay\b/i,
  /\bpayment thank you\b/i,
  /\bonline payment\b/i,
  /\bpayment received\b/i,
  /\bautomatic payment\b/i,
  /\belectronic payment\b/i,
  /\bach payment\b/i,
  /\bcard payment\b/i,
]

const REFUND_PATTERNS = [/\brefund\b/i, /\breturn\b/i, /\bcredit\b/i, /\breversal\b/i]

export function classifyTransactionKind(input: TransactionKindInput): TransactionKind {
  if (input.amount >= 0) return 'charge'

  const haystack = `${input.descriptionRaw} ${input.statementDescriptor ?? ''} ${input.amexCategoryRaw ?? ''}`

  if (PAYMENT_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return 'payment'
  }

  if (REFUND_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return 'refund'
  }

  return 'refund'
}
