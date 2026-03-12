export type UUID = string

export type DateScopeMode = 'statement' | 'custom' | 'month' | 'quarter' | 'year' | 'ytd'
export type TransactionKind = 'charge' | 'refund' | 'payment'

export interface ImportBatch {
  importBatchId: UUID
  importedAt: string
  folderLabel: string
  fileCount: number
  statementsCount: number
  transactionsAdded: number
  duplicatesSkipped: number
  warningsCount: number
}

export interface ImportedFile {
  fileId: UUID
  importBatchId: UUID
  fileName: string
  filePathHint: string
  fileHash: string
  sizeBytes: number
  lastModified: number
  importedAt: string
  parseStatus: 'parsed' | 'skipped_duplicate' | 'error'
  parseWarnings: string[]
  parseError?: string
}

export interface Statement {
  statementId: UUID
  sourceFileId: UUID
  cardProductName: string
  preparedFor: string
  accountNumberMasked: string
  statementStartDate: string
  statementEndDate: string
  currency: string
  importedAt: string
  fileHash: string
  parseVersion: string
}

export interface TransactionRaw {
  rawId: UUID
  statementId: UUID
  sourceFileId: UUID
  rowIndex: number
  rawData: Record<string, string | number | null>
  sourceRowFingerprint: string
  importBatchId: UUID
}

export interface TransactionNormalized {
  transactionId: UUID
  statementId: UUID
  transactionDate: string
  postDate?: string | null
  descriptionRaw: string
  descriptionNormalized: string
  cardMember: string
  accountLastDigits: string
  amount: number
  merchantRaw: string
  merchantNormalized: string
  extendedDetails: string
  statementDescriptor: string
  address: string
  city: string
  state: string
  zip: string
  country: string
  reference: string
  amexCategoryRaw: string
  categoryIdResolved: string
  transactionKind: TransactionKind
  isCredit: boolean
  isRefund: boolean
  isPayment: boolean
  isPendingLike: boolean
  duplicateGroupKey: string
  sourceRowFingerprint: string
  importBatchId: string
  hasManualOverride: boolean
  hasRuleOverride: boolean
  merchantFirstSeenAt?: string
  appliedRuleIds?: string[]
}

export interface TransactionOverride {
  transactionId: UUID
  merchantOverride?: string
  categoryOverrideId?: string
  notes?: string
  splitDefinition?: SplitDefinition
  isExcludedFromAnalytics?: boolean
  isReimbursable?: boolean
  isBusiness?: boolean
  updatedAt: string
}

export interface SplitDefinition {
  mode: 'amount' | 'percentage'
  parts: Array<{
    id: string
    label: string
    categoryId: string
    amount: number
    tags?: string[]
  }>
}

export interface Category {
  categoryId: UUID
  name: string
  parentCategoryId?: string | null
  colorToken: string
  iconToken: string
  isSystem: boolean
  isHidden: boolean
  sortOrder: number
}

export interface CategoryAlias {
  aliasId: UUID
  rawCategory: string
  categoryId: string
  createdAt: string
}

export interface Tag {
  tagId: UUID
  name: string
  colorToken: string
  description: string
  isArchived: boolean
}

export interface TransactionTag {
  id: UUID
  transactionId: UUID
  tagId: UUID
}

export type RuleConditionOperator =
  | 'contains'
  | 'equals'
  | 'gt'
  | 'lt'
  | 'between'
  | 'in'

export interface RuleCondition {
  field:
    | 'merchant'
    | 'description'
    | 'amount'
    | 'cardMember'
    | 'amexCategoryRaw'
    | 'country'
    | 'state'
    | 'city'
    | 'hasTag'
  operator: RuleConditionOperator
  value: string | number | [number, number] | string[]
}

export interface RuleAction {
  type:
    | 'setCategory'
    | 'addTags'
    | 'renameMerchant'
    | 'markBusiness'
    | 'markReimbursable'
    | 'excludeFromAnalytics'
    | 'flagForReview'
  value: string | boolean | string[]
}

export interface Rule {
  ruleId: UUID
  name: string
  enabled: boolean
  priority: number
  conditions: RuleCondition[]
  actions: RuleAction[]
  applyMode: 'new-only' | 'retroactive'
}

export interface MerchantMapping {
  mappingId: UUID
  merchantRaw: string
  merchantNormalized: string
  createdAt: string
}

export interface SavedView {
  viewId: UUID
  name: string
  page: 'dashboard' | 'transactions' | 'insights'
  filterState: string
  createdAt: string
}

export interface AppSetting {
  key: string
  value: string
}

export interface AuditLog {
  id: UUID
  eventType: string
  message: string
  createdAt: string
}

export interface EnrichedTransaction extends TransactionNormalized {
  merchantFinal: string
  categoryFinalId: string
  categoryFinalName: string
  notes: string
  tags: Tag[]
  isExcludedFromAnalytics: boolean
  isReimbursable: boolean
  isBusiness: boolean
  splitDefinition?: SplitDefinition
}
