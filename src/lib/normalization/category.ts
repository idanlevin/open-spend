import type { CategoryAlias } from '@/types/domain'
import { normalizeText } from '@/lib/utils'

const RAW_DEFAULT_MAP: Record<string, string> = {
  groceries: 'cat_food_dining',
  dining: 'cat_food_dining',
  restaurants: 'cat_food_dining',
  restaurant: 'cat_food_dining',
  travel: 'cat_travel',
  airfare: 'cat_travel',
  gas: 'cat_transportation',
  transportation: 'cat_transportation',
  shopping: 'cat_shopping',
  entertainment: 'cat_entertainment',
  utilities: 'cat_utilities',
  health: 'cat_health',
  business: 'cat_business',
  financial: 'cat_financial',
  education: 'cat_education',
  gifts: 'cat_gifts',
  charity: 'cat_gifts',
  charities: 'cat_gifts',
  credit: 'cat_transfers_credits',
  transfer: 'cat_transfers_credits',
  payment: 'cat_transfers_credits',
  payments: 'cat_transfers_credits',
}

const AMEX_EXACT_CATEGORY_MAP: Record<string, string> = {
  'business services advertising services': 'cat_business',
  'business services contracting services': 'cat_business',
  'business services health care services': 'cat_health',
  'business services insurance services': 'cat_financial',
  'business services internet services': 'cat_business',
  'business services mailing and shipping': 'cat_business',
  'business services office supplies': 'cat_business',
  'business services other services': 'cat_business',
  'business services printing and publishing': 'cat_business',
  'business services professional services': 'cat_business',
  'communications cable and internet comm': 'cat_utilities',
  'entertainment associations': 'cat_entertainment',
  'entertainment general attractions': 'cat_entertainment',
  'entertainment general events': 'cat_entertainment',
  'entertainment theatrical events': 'cat_entertainment',
  'fees and adjustments fees and adjustments': 'cat_financial',
  'merchandise and supplies arts and jewelry': 'cat_shopping',
  'merchandise and supplies clothing stores': 'cat_shopping',
  'merchandise and supplies computer supplies': 'cat_shopping',
  'merchandise and supplies department stores': 'cat_shopping',
  'merchandise and supplies florists and garden': 'cat_shopping',
  'merchandise and supplies furnishing': 'cat_shopping',
  'merchandise and supplies general retail': 'cat_shopping',
  'merchandise and supplies groceries': 'cat_food_dining',
  'merchandise and supplies hardware supplies': 'cat_shopping',
  'merchandise and supplies internet purchase': 'cat_shopping',
  'merchandise and supplies mail order': 'cat_shopping',
  'merchandise and supplies pharmacies': 'cat_health',
  'merchandise and supplies sporting goods stores': 'cat_shopping',
  'merchandise and supplies wholesale stores': 'cat_shopping',
  'other education': 'cat_education',
  'other government services': 'cat_financial',
  'other miscellaneous': 'cat_transfers_credits',
  'other charities': 'cat_gifts',
  'other utilities': 'cat_utilities',
  'restaurant bar and cafe': 'cat_food_dining',
  'restaurant restaurant': 'cat_food_dining',
  'transportation fuel': 'cat_transportation',
  'transportation other transportation': 'cat_transportation',
  'transportation parking charges': 'cat_transportation',
  'transportation rail services': 'cat_transportation',
  'transportation taxis and coach': 'cat_transportation',
  'transportation tolls and fees': 'cat_transportation',
  'transportation vehicle leasing and purchase': 'cat_transportation',
  'travel airline': 'cat_travel',
  'travel lodging': 'cat_travel',
  'travel travel agencies': 'cat_travel',
  'travel vehicle rental': 'cat_travel',
}

const AMEX_PREFIX_CATEGORY_MAP: Record<string, string> = {
  'business services': 'cat_business',
  communications: 'cat_utilities',
  entertainment: 'cat_entertainment',
  'fees and adjustments': 'cat_financial',
  'merchandise and supplies': 'cat_shopping',
  restaurant: 'cat_food_dining',
  transportation: 'cat_transportation',
  travel: 'cat_travel',
}

function normalizeCategoryLabel(value: string): string {
  return normalizeText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function resolveCategoryId(raw: string, aliases: CategoryAlias[]): string {
  const normalizedRaw = normalizeCategoryLabel(raw)
  if (!normalizedRaw) return 'cat_uncategorized'

  const aliasHit = aliases.find(
    (entry) => normalizeCategoryLabel(entry.rawCategory) === normalizedRaw,
  )
  if (aliasHit) return aliasHit.categoryId

  const exactHit = AMEX_EXACT_CATEGORY_MAP[normalizedRaw]
  if (exactHit) return exactHit

  const prefixHit = Object.entries(AMEX_PREFIX_CATEGORY_MAP).find(([key]) =>
    normalizedRaw.startsWith(key),
  )
  if (prefixHit) return prefixHit[1]

  const dictionaryHit = Object.entries(RAW_DEFAULT_MAP).find(([key]) => normalizedRaw.includes(key))
  if (dictionaryHit) return dictionaryHit[1]

  return 'cat_uncategorized'
}
