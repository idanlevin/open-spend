import type { CategoryAlias } from '@/types/domain'
import { normalizeText } from '@/lib/utils'

const RAW_DEFAULT_MAP: Record<string, string> = {
  groceries: 'cat_food_dining',
  dining: 'cat_food_dining',
  restaurants: 'cat_food_dining',
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
  credit: 'cat_transfers_credits',
  transfer: 'cat_transfers_credits',
}

export function resolveCategoryId(raw: string, aliases: CategoryAlias[]): string {
  const normalizedRaw = normalizeText(raw)
  if (!normalizedRaw) return 'cat_uncategorized'

  const aliasHit = aliases.find((entry) => normalizeText(entry.rawCategory) === normalizedRaw)
  if (aliasHit) return aliasHit.categoryId

  const dictionaryHit = Object.entries(RAW_DEFAULT_MAP).find(([key]) => normalizedRaw.includes(key))
  if (dictionaryHit) return dictionaryHit[1]

  return 'cat_uncategorized'
}
