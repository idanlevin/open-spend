import { normalizeText, titleCase } from '@/lib/utils'

const COMMON_SUFFIXES = /\b(inc|llc|co|corp|corporation|ltd|the)\b/g

export function normalizeMerchantName(raw: string): string {
  const lower = normalizeText(raw)
  if (/\b(amazon|amzn|marketplace)\b/.test(lower)) return 'Amazon'
  if (/\b(uber|help uber)\b/.test(lower)) return 'Uber'
  if (/\bcostco\b/.test(lower)) return 'Costco'
  if (/\bnetflix\b/.test(lower)) return 'Netflix'

  const normalized = normalizeText(raw)
    .replace(/[^\w\s]/g, ' ')
    .replace(COMMON_SUFFIXES, '')
    .replace(/\b(amzn\.com\/bill|amzn mktp|marketplace)\b/g, 'amazon')
    .replace(/\s+/g, ' ')
    .trim()

  return titleCase(normalized || raw || 'Unknown Merchant')
}

export function merchantParentHint(merchant: string): string {
  const lower = normalizeText(merchant)
  if (lower.includes('amazon')) return 'Amazon'
  if (lower.includes('uber')) return 'Uber'
  if (lower.includes('costco')) return 'Costco'
  if (lower.includes('starbucks')) return 'Starbucks'
  return normalizeMerchantName(merchant)
}
