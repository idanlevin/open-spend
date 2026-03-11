import type { Rule, RuleAction, RuleCondition, TransactionNormalized } from '@/types/domain'
import { normalizeText } from '@/lib/utils'

function conditionMatches(tx: TransactionNormalized, condition: RuleCondition): boolean {
  const merchant = normalizeText(tx.merchantNormalized)
  const description = normalizeText(tx.descriptionRaw)
  const amount = tx.amount
  const cardMember = normalizeText(tx.cardMember)
  const rawCategory = normalizeText(tx.amexCategoryRaw)
  const city = normalizeText(tx.city)
  const state = normalizeText(tx.state)
  const country = normalizeText(tx.country)

  const valueToLower = (value: string | number | [number, number] | string[]): string => {
    if (Array.isArray(value)) return value.join(',').toLowerCase()
    return String(value).toLowerCase()
  }

  const conditionText = valueToLower(condition.value)

  switch (condition.field) {
    case 'merchant':
      return condition.operator === 'contains'
        ? merchant.includes(conditionText)
        : merchant === conditionText
    case 'description':
      return condition.operator === 'contains'
        ? description.includes(conditionText)
        : description === conditionText
    case 'amount':
      if (condition.operator === 'gt') return amount > Number(condition.value)
      if (condition.operator === 'lt') return amount < Number(condition.value)
      if (condition.operator === 'between' && Array.isArray(condition.value)) {
        const min = Number(condition.value[0])
        const max = Number(condition.value[1])
        return amount >= min && amount <= max
      }
      return amount === Number(condition.value)
    case 'cardMember':
      return condition.operator === 'contains'
        ? cardMember.includes(conditionText)
        : cardMember === conditionText
    case 'amexCategoryRaw':
      return condition.operator === 'contains'
        ? rawCategory.includes(conditionText)
        : rawCategory === conditionText
    case 'city':
      return condition.operator === 'contains' ? city.includes(conditionText) : city === conditionText
    case 'state':
      return condition.operator === 'contains'
        ? state.includes(conditionText)
        : state === conditionText
    case 'country':
      return condition.operator === 'contains'
        ? country.includes(conditionText)
        : country === conditionText
    case 'hasTag':
      return false
    default:
      return false
  }
}

export function transactionMatchesRule(tx: TransactionNormalized, rule: Rule): boolean {
  if (!rule.enabled) return false
  return rule.conditions.every((condition) => conditionMatches(tx, condition))
}

export function applyRuleActions(
  tx: TransactionNormalized,
  actions: RuleAction[],
): {
  transaction: TransactionNormalized
  isBusiness?: boolean
  isReimbursable?: boolean
  isExcludedFromAnalytics?: boolean
  tagsToAdd: string[]
} {
  const next = { ...tx }
  const tagsToAdd: string[] = []
  let isBusiness: boolean | undefined
  let isReimbursable: boolean | undefined
  let isExcludedFromAnalytics: boolean | undefined

  actions.forEach((action) => {
    switch (action.type) {
      case 'setCategory':
        next.categoryIdResolved = String(action.value)
        next.hasRuleOverride = true
        break
      case 'renameMerchant':
        next.merchantNormalized = String(action.value)
        next.hasRuleOverride = true
        break
      case 'markBusiness':
        isBusiness = Boolean(action.value)
        break
      case 'markReimbursable':
        isReimbursable = Boolean(action.value)
        break
      case 'excludeFromAnalytics':
        isExcludedFromAnalytics = Boolean(action.value)
        break
      case 'addTags':
        if (Array.isArray(action.value)) tagsToAdd.push(...action.value.map(String))
        break
      case 'flagForReview':
      default:
        break
    }
  })

  return {
    transaction: next,
    isBusiness,
    isReimbursable,
    isExcludedFromAnalytics,
    tagsToAdd,
  }
}
