import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { RefreshCcw, WandSparkles } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useWorkspace } from '@/hooks/use-workspace'
import { randomId } from '@/lib/utils'
import type { Rule } from '@/types/domain'

const ruleSchema = z.object({
  name: z.string().min(2),
  field: z.enum([
    'merchant',
    'description',
    'amount',
    'cardMember',
    'amexCategoryRaw',
    'country',
    'state',
    'city',
  ]),
  operator: z.enum(['contains', 'equals', 'gt', 'lt']),
  value: z.string().min(1),
  actionType: z.enum([
    'setCategory',
    'addTags',
    'renameMerchant',
    'markBusiness',
    'markReimbursable',
    'excludeFromAnalytics',
  ]),
  actionValue: z.string().min(1),
})

type RuleFormValues = z.infer<typeof ruleSchema>

export function RulesPage() {
  const workspace = useWorkspace()
  const [rerunningRules, setRerunningRules] = useState(false)
  const [lastRerunSummary, setLastRerunSummary] = useState<{
    processed: number
    matched: number
  } | null>(null)
  const form = useForm<RuleFormValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      name: '',
      field: 'merchant',
      operator: 'contains',
      value: '',
      actionType: 'setCategory',
      actionValue: 'cat_uncategorized',
    },
  })
  const actionType = form.watch('actionType')
  const categoryNameById = new Map(
    workspace.categories.map((category) => [category.categoryId, category.name]),
  )

  const onSubmit = form.handleSubmit(async (values) => {
    const categoryMatch = workspace.categories.find(
      (category) =>
        category.categoryId === values.actionValue ||
        category.name.trim().toLowerCase() === values.actionValue.trim().toLowerCase(),
    )
    const actionValue =
      values.actionType === 'markBusiness' ||
      values.actionType === 'markReimbursable' ||
      values.actionType === 'excludeFromAnalytics'
        ? values.actionValue === 'true'
        : values.actionType === 'addTags'
          ? values.actionValue.split(',').map((token) => token.trim())
          : values.actionType === 'setCategory'
            ? (categoryMatch?.categoryId ?? values.actionValue)
            : values.actionValue

    const rule: Rule = {
      ruleId: randomId('rule'),
      name: values.name,
      enabled: true,
      priority: workspace.rules.length + 1,
      applyMode: 'new-only',
      conditions: [
        {
          field: values.field,
          operator: values.operator,
          value: values.field === 'amount' ? Number(values.value) : values.value,
        },
      ],
      actions: [{ type: values.actionType, value: actionValue }],
    }
    await workspace.saveRule(rule)
    form.reset({
      name: '',
      field: 'merchant',
      operator: 'contains',
      value: '',
      actionType: 'setCategory',
      actionValue: 'cat_uncategorized',
    })
  })

  const rerunRulesForExistingTransactions = async () => {
    if (workspace.transactions.length === 0) {
      window.alert('No transactions found yet. Import statements first, then re-run rules.')
      return
    }
    const confirmed = window.confirm(
      'Re-run enabled rules on all existing transactions? This can update categories, merchant normalization, and flags from rules.',
    )
    if (!confirmed) return
    setRerunningRules(true)
    try {
      const summary = await workspace.rerunRules()
      setLastRerunSummary(summary)
    } finally {
      setRerunningRules(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Rules & automations"
        subtitle="Automate repeated cleanup with local, deterministic rules."
        icon={WandSparkles}
      />
      <div className="grid gap-4 p-6 xl:grid-cols-2">
        <Card>
          <CardTitle>Create rule</CardTitle>
          <CardDescription>
            Rules run at import. Use retroactive rerun to apply enabled rules to existing transactions.
          </CardDescription>
          <form className="mt-3 space-y-2" onSubmit={onSubmit}>
            <Input placeholder="Rule name" {...form.register('name')} />
            <div className="grid grid-cols-3 gap-2">
              <Select {...form.register('field')}>
                <option value="merchant">Merchant</option>
                <option value="description">Description</option>
                <option value="amount">Amount</option>
                <option value="cardMember">Cardholder</option>
                <option value="amexCategoryRaw">Raw category</option>
                <option value="country">Country</option>
                <option value="state">State</option>
                <option value="city">City</option>
              </Select>
              <Select {...form.register('operator')}>
                <option value="contains">contains</option>
                <option value="equals">equals</option>
                <option value="gt">gt</option>
                <option value="lt">lt</option>
              </Select>
              <Input placeholder="Condition value" {...form.register('value')} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select {...form.register('actionType')}>
                <option value="setCategory">Set category</option>
                <option value="addTags">Add tags</option>
                <option value="renameMerchant">Rename merchant</option>
                <option value="markBusiness">Mark business</option>
                <option value="markReimbursable">Mark reimbursable</option>
                <option value="excludeFromAnalytics">Exclude from analytics</option>
              </Select>
              {actionType === 'setCategory' ? (
                <Select {...form.register('actionValue')}>
                  {workspace.categories.map((category) => (
                    <option key={category.categoryId} value={category.categoryId}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input placeholder="Action value" {...form.register('actionValue')} />
              )}
            </div>
            <Button type="submit">Save rule</Button>
          </form>
        </Card>
        <Card>
          <CardTitle>Rule list</CardTitle>
          <CardDescription>Enabled local automations sorted by priority.</CardDescription>
          <div className="mt-3 flex items-center gap-2">
            <Button
              onClick={() => void rerunRulesForExistingTransactions()}
              disabled={rerunningRules}
            >
              <RefreshCcw className={`mr-2 h-4 w-4 ${rerunningRules ? 'animate-spin' : ''}`} />
              {rerunningRules ? 'Re-running rules...' : 'Re-run rules on existing transactions'}
            </Button>
          </div>
          {lastRerunSummary ? (
            <p className="mt-2 text-xs text-slate-500">
              Last re-run matched {lastRerunSummary.matched} of {lastRerunSummary.processed} transactions.
            </p>
          ) : null}
          <div className="mt-3 space-y-2 text-sm">
            {workspace.rules.length === 0 ? (
              <p className="text-slate-500">No rules yet.</p>
            ) : (
              workspace.rules.map((rule) => (
                <div key={rule.ruleId} className="rounded-md border border-slate-200 p-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{rule.name}</p>
                    <Badge>Priority {rule.priority}</Badge>
                  </div>
                  <p className="text-xs text-slate-600">
                    If <strong>{rule.conditions[0]?.field}</strong> {rule.conditions[0]?.operator}{' '}
                    <strong>{String(rule.conditions[0]?.value)}</strong>, then{' '}
                    <strong>{rule.actions[0]?.type}</strong> ={' '}
                    <strong>
                      {rule.actions[0]?.type === 'setCategory'
                        ? (categoryNameById.get(String(rule.actions[0]?.value)) ??
                          String(rule.actions[0]?.value))
                        : String(rule.actions[0]?.value)}
                    </strong>
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
