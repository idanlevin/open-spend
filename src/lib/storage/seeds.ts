import type { Category, Tag } from '@/types/domain'

const now = new Date().toISOString()

export const SYSTEM_CATEGORIES: Category[] = [
  'Food & Dining',
  'Shopping',
  'Travel',
  'Home',
  'Health',
  'Family',
  'Transportation',
  'Business',
  'Financial',
  'Entertainment',
  'Utilities',
  'Education',
  'Gifts',
  'Transfers/Credits',
  'Uncategorized',
].map((name, index) => ({
  categoryId: `cat_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
  name,
  parentCategoryId: null,
  colorToken: `hsl(${(index * 31) % 360} 55% 48%)`,
  iconToken: 'folder',
  isSystem: true,
  isHidden: false,
  sortOrder: index,
}))

export const STARTER_TAGS: Tag[] = [
  'Tax deductible',
  'Reimbursable',
  'Vacation',
  'Work travel',
  'Household',
  'Kids',
  'Medical',
  'Subscription',
  'Gift',
  'One-time purchase',
].map((name, index) => ({
  tagId: `tag_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
  name,
  colorToken: `hsl(${(index * 41) % 360} 70% 45%)`,
  description: `Starter tag created at ${now}`,
  isArchived: false,
}))
