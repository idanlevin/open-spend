import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Store } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useScopedTransactions } from '@/hooks/use-time-scope'
import { useWorkspace } from '@/hooks/use-workspace'
import { amountToCurrency } from '@/lib/utils'

function merchantKey(value: string): string {
  return value.trim().toLowerCase()
}

export function MerchantsPage() {
  const navigate = useNavigate()
  const workspace = useWorkspace()
  const scopedTransactions = useScopedTransactions(workspace.transactions, workspace.statements)
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedMerchant, setSelectedMerchant] = useState<string>('')
  const [renameTo, setRenameTo] = useState('')
  const [recurringCategoryOverride, setRecurringCategoryOverride] = useState('')

  const merchantStats = useMemo(() => {
    const map = new Map<
      string,
      { amount: number; count: number; firstSeen: string; lastSeen: string; rawAliases: Set<string> }
    >()
    scopedTransactions.forEach((tx) => {
      const entry = map.get(tx.merchantFinal) ?? {
        amount: 0,
        count: 0,
        firstSeen: tx.transactionDate,
        lastSeen: tx.transactionDate,
        rawAliases: new Set<string>(),
      }
      entry.amount += tx.amount
      entry.count += 1
      if (tx.transactionDate < entry.firstSeen) entry.firstSeen = tx.transactionDate
      if (tx.transactionDate > entry.lastSeen) entry.lastSeen = tx.transactionDate
      entry.rawAliases.add(tx.merchantRaw)
      map.set(tx.merchantFinal, entry)
    })
    return [...map.entries()]
      .map(([merchant, value]) => ({ merchant, ...value }))
      .sort((a, b) => b.amount - a.amount)
  }, [scopedTransactions])

  const selectedMerchantFromQuery = searchParams.get('merchant')
  const selectedMerchantResolved = useMemo(() => {
    const matchedFromQuery = selectedMerchantFromQuery
      ? merchantStats.find(
          (row) => row.merchant.toLowerCase() === selectedMerchantFromQuery.toLowerCase(),
        )?.merchant
      : undefined
    return matchedFromQuery ?? (selectedMerchant || merchantStats[0]?.merchant || '')
  }, [merchantStats, selectedMerchant, selectedMerchantFromQuery])
  const active =
    merchantStats.find((row) => row.merchant === selectedMerchantResolved) ?? merchantStats[0]
  const renameValue = renameTo || active?.merchant || ''
  const activeRecurringCategoryOverride = active
    ? workspace.recurringCategoryOverrides[merchantKey(active.merchant)] ?? ''
    : ''

  useEffect(() => {
    setRecurringCategoryOverride(activeRecurringCategoryOverride)
  }, [activeRecurringCategoryOverride])

  return (
    <div>
      <PageHeader
        title="Merchants"
        subtitle="Normalize merchant identities and review merchant-level spend."
        icon={Store}
      />
      <div className="grid gap-4 p-6 xl:grid-cols-[1.2fr,1fr]">
        <Card>
          <CardTitle>Merchant directory</CardTitle>
          <CardDescription>Spend totals, aliases, and first/last seen.</CardDescription>
          <div className="mt-3 max-h-[70vh] space-y-2 overflow-auto">
            {merchantStats.map((merchant) => (
              <button
                key={merchant.merchant}
                className={`w-full rounded-md border p-2 text-left ${
                  selectedMerchantResolved === merchant.merchant
                    ? 'border-slate-900 bg-slate-100'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
                onClick={() => {
                  setSelectedMerchant(merchant.merchant)
                  setRenameTo(merchant.merchant)
                  setSearchParams({ merchant: merchant.merchant })
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{merchant.merchant}</span>
                  <span>{amountToCurrency(merchant.amount)}</span>
                </div>
                <p className="text-xs text-slate-500">{merchant.count} transactions</p>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <CardTitle>Merchant details</CardTitle>
          {active ? (
            <div className="mt-3 space-y-3 text-sm">
              <div className="rounded-md bg-slate-50 p-2">
                <p className="text-slate-500">Merchant</p>
                <p className="text-base font-semibold">{active.merchant}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="rounded-md bg-slate-50 p-2 text-left transition hover:bg-violet-50"
                  onClick={() => navigate(`/transactions?merchant=${encodeURIComponent(active.merchant)}`)}
                >
                  <p className="text-slate-500">Transactions</p>
                  <p className="flex items-center gap-1 text-lg font-semibold">
                    {active.count}
                    <ArrowRight className="h-4 w-4 text-violet-500" />
                  </p>
                </button>
                <div className="rounded-md bg-slate-50 p-2">
                  <p className="text-slate-500">Total spend</p>
                  <p className="text-lg font-semibold">{amountToCurrency(active.amount)}</p>
                </div>
              </div>
              <div>
                <p className="text-slate-500">Raw aliases</p>
                <ul className="mt-1 list-disc pl-4 text-xs text-slate-600">
                  {[...active.rawAliases].slice(0, 12).map((alias) => (
                    <li key={alias}>{alias}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-slate-500">Rename normalized merchant</p>
                <div className="flex gap-2">
                  <Input value={renameValue} onChange={(event) => setRenameTo(event.target.value)} />
                  <Button
                    onClick={async () => {
                      if (!active || !renameValue.trim()) return
                      await workspace.renameMerchant(active.merchant, renameValue.trim())
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
              <div>
                <p className="mb-1 text-slate-500">Recurring category override</p>
                <CardDescription className="mb-2 text-xs">
                  Used by the Recurring page. Leave on auto-detect to use the model&apos;s inferred category.
                </CardDescription>
                <div className="flex gap-2">
                  <Select
                    value={recurringCategoryOverride}
                    onChange={(event) => setRecurringCategoryOverride(event.target.value)}
                  >
                    <option value="">Auto-detect from recurring transactions</option>
                    {workspace.categories.map((category) => (
                      <option key={category.categoryId} value={category.categoryId}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      if (!active) return
                      await workspace.updateRecurringCategoryOverride(
                        active.merchant,
                        recurringCategoryOverride || null,
                      )
                    }}
                    disabled={!active || recurringCategoryOverride === activeRecurringCategoryOverride}
                  >
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      if (!active) return
                      setRecurringCategoryOverride('')
                      await workspace.updateRecurringCategoryOverride(active.merchant, null)
                    }}
                    disabled={!active || !activeRecurringCategoryOverride}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <CardDescription className="mt-3">No merchant data yet.</CardDescription>
          )}
        </Card>
      </div>
    </div>
  )
}
