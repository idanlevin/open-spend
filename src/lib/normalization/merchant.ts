import { normalizeText, titleCase } from '@/lib/utils'

const COMMON_SUFFIXES = /\b(inc|llc|co|corp|corporation|ltd|the)\b/g
const NOISE_TOKENS = new Set([
  'www',
  'com',
  'net',
  'org',
  'io',
  'ai',
  'app',
  'dev',
  'ca',
  'us',
  'uk',
  'na',
])
const TOKEN_REWRITES: Record<string, string> = {
  amzn: 'amazon',
  mktp: 'marketplace',
  gsuite: 'workspace',
}

const CANONICAL_RULES: Array<{ canonical: string; patterns: RegExp[] }> = [
  {
    canonical: 'Amazon',
    patterns: [/\bamazon\b/, /\bamzn\b/, /\bmarketplace\b/],
  },
  {
    canonical: 'Uber',
    patterns: [/\buber\b/, /\bhelp uber\b/],
  },
  {
    canonical: 'Costco',
    patterns: [/\bcostco\b/],
  },
  {
    canonical: 'Netflix',
    patterns: [/\bnetflix\b/],
  },
]

function canonicalRuleMatch(lower: string): string | null {
  for (const rule of CANONICAL_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(lower))) {
      return rule.canonical
    }
  }
  return null
}

function tokenizeMerchant(raw: string): string[] {
  const cleaned = normalizeText(raw)
    .replace(/[^a-z0-9@._/\-\s]/g, ' ')
    .replace(/[@._/\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return []
  return cleaned
    .split(' ')
    .map((token) => TOKEN_REWRITES[token] ?? token)
    .filter((token) => token.length > 1 && !NOISE_TOKENS.has(token))
}

function isDescriptorToken(token: string): boolean {
  if (token.length < 3) return false
  if (/^\d+$/.test(token)) return false
  if (/^[a-z]*\d+[a-z\d]*$/.test(token)) return false
  return true
}

function inferMerchantFromTokens(tokens: string[]): string | null {
  if (tokens.length === 0) return null
  const frequencies = new Map<string, number>()
  tokens.forEach((token) => {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1)
  })
  let root = tokens[0]
  let maxCount = frequencies.get(root) ?? 1
  frequencies.forEach((count, token) => {
    if (count > maxCount) {
      root = token
      maxCount = count
    }
  })

  if (maxCount >= 2) {
    const rootIndex = tokens.indexOf(root)
    const descriptor = tokens
      .slice(rootIndex + 1)
      .find((token) => token !== root && isDescriptorToken(token))
    if (descriptor) {
      return titleCase(`${root} ${descriptor}`)
    }
  }

  return titleCase(root)
}

export function normalizeMerchantName(raw: string): string {
  const lower = normalizeText(raw)
  const canonical = canonicalRuleMatch(lower)
  if (canonical) return canonical

  const inferred = inferMerchantFromTokens(tokenizeMerchant(raw))
  if (inferred) return inferred

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
