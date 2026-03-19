import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { format, parseISO } from 'date-fns'
import { RefreshCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { AdvancedDataTable } from '@/components/ui/advanced-data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useScopedTransactions } from '@/hooks/use-time-scope'
import { useWorkspace } from '@/hooks/use-workspace'
import {
  recurringCandidates,
  type RecurringCadence,
  type RecurringCandidate,
  type RecurringStatus,
} from '@/lib/analytics/metrics'
import { amountToCurrency } from '@/lib/utils'
import type { RecurringDecision } from '@/types/domain'

interface RecurringCandidateWithDecision extends RecurringCandidate {
  decision: RecurringDecision | null
  categoryOverrideId: string | null
}

const cadenceLabels: Record<RecurringCadence, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annual: 'Annual',
}

const statusLabels: Record<RecurringStatus, string> = {
  active: 'Active',
  new: 'New',
  possibly_cancelled: 'Possibly cancelled',
}

function decisionKey(merchant: string): string {
  return merchant.trim().toLowerCase()
}

function formatIsoDate(value: string): string {
  if (!value) return '—'
  try {
    return format(parseISO(value), 'MMM d, yyyy')
  } catch {
    return value
  }
}

export function RecurringPage() {
  const navigate = useNavigate()
  const workspace = useWorkspace()
  const scopedTransactions = useScopedTransactions(workspace.transactions, workspace.statements)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [cardHolderFilter, setCardHolderFilter] = useState('all')
  const [cadenceFilter, setCadenceFilter] = useState<'all' | RecurringCadence>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | RecurringStatus>('all')
  const [decisionFilter, setDecisionFilter] = useState<
    'excludeIgnored' | 'all' | 'undecided' | 'confirmed' | 'ignored'
  >('excludeIgnored')
  const [minMonthlyEquivalent, setMinMonthlyEquivalent] = useState('')
  const [minConfidence, setMinConfidence] = useState('0.55')
  const [selectedMerchant, setSelectedMerchant] = useState<string | null>(null)
  const [pendingMerchantDecision, setPendingMerchantDecision] = useState<string | null>(null)

  const recurring = useMemo(() => recurringCandidates(scopedTransactions), [scopedTransactions])
  const categoryNameById = useMemo(
    () => new Map(workspace.categories.map((category) => [category.categoryId, category.name])),
    [workspace.categories],
  )
  const recurringWithDecision = useMemo<RecurringCandidateWithDecision[]>(
    () =>
      recurring.map((candidate) => ({
        ...candidate,
        category:
          (workspace.recurringCategoryOverrides[decisionKey(candidate.merchant)]
            ? categoryNameById.get(workspace.recurringCategoryOverrides[decisionKey(candidate.merchant)])
            : undefined) ?? candidate.category,
        categoryOverrideId: workspace.recurringCategoryOverrides[decisionKey(candidate.merchant)] ?? null,
        decision: workspace.recurringDecisions[decisionKey(candidate.merchant)]?.decision ?? null,
      })),
    [categoryNameById, recurring, workspace.recurringCategoryOverrides, workspace.recurringDecisions],
  )
  const categories = useMemo(
    () => ['all', ...new Set(recurringWithDecision.map((item) => item.category).filter(Boolean))],
    [recurringWithDecision],
  )
  const cardHolders = useMemo(
    () => ['all', ...new Set(recurringWithDecision.map((item) => item.cardHolder).filter(Boolean))],
    [recurringWithDecision],
  )
  const filteredRecurring = useMemo(() => {
    const queryValue = query.trim().toLowerCase()
    const minMonthly = Number(minMonthlyEquivalent)
    const minConfidenceValue = Number(minConfidence)
    return recurringWithDecision.filter((row) => {
      if (queryValue && !row.merchant.toLowerCase().includes(queryValue)) return false
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false
      if (cardHolderFilter !== 'all' && row.cardHolder !== cardHolderFilter) return false
      if (cadenceFilter !== 'all' && row.cadence !== cadenceFilter) return false
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (Number.isFinite(minMonthly) && minMonthlyEquivalent.trim() && row.monthlyEquivalent < minMonthly) {
        return false
      }
      if (Number.isFinite(minConfidenceValue) && row.confidence < minConfidenceValue) return false
      if (decisionFilter === 'excludeIgnored' && row.decision === 'ignored') return false
      if (decisionFilter === 'confirmed' && row.decision !== 'confirmed') return false
      if (decisionFilter === 'ignored' && row.decision !== 'ignored') return false
      if (decisionFilter === 'undecided' && row.decision !== null) return false
      return true
    })
  }, [
    cadenceFilter,
    cardHolderFilter,
    categoryFilter,
    decisionFilter,
    minConfidence,
    minMonthlyEquivalent,
    query,
    recurringWithDecision,
    statusFilter,
  ])
  const monthlyScope = useMemo(
    () =>
      filteredRecurring.filter((candidate) => candidate.status !== 'possibly_cancelled' && candidate.decision !== 'ignored'),
    [filteredRecurring],
  )
  const summary = useMemo(() => {
    const monthlyTotal = monthlyScope.reduce((sum, row) => sum + row.monthlyEquivalent, 0)
    const activeCount = monthlyScope.filter((row) => row.status === 'active').length
    const newCount = monthlyScope.filter((row) => row.status === 'new').length
    const staleCount = filteredRecurring.filter((row) => row.status === 'possibly_cancelled').length
    const increasingCount = monthlyScope.filter((row) => row.priceTrend === 'up').length
    const categoryTotals = new Map<string, number>()
    monthlyScope.forEach((row) => {
      categoryTotals.set(row.category, (categoryTotals.get(row.category) ?? 0) + row.monthlyEquivalent)
    })
    const topCategories = [...categoryTotals.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 8)
    return {
      monthlyTotal,
      annualRunRate: monthlyTotal * 12,
      activeCount,
      newCount,
      staleCount,
      increasingCount,
      topCategories,
    }
  }, [filteredRecurring, monthlyScope])
  const selectedCandidate = useMemo(() => {
    if (selectedMerchant) {
      return filteredRecurring.find((row) => row.merchant === selectedMerchant) ?? null
    }
    return filteredRecurring[0] ?? null
  }, [filteredRecurring, selectedMerchant])
  const selectedCandidateTransactions = useMemo(() => {
    if (!selectedCandidate) return []
    const matchedIds = new Set(selectedCandidate.matchedTransactionIds)
    return scopedTransactions
      .filter((tx) => matchedIds.has(tx.transactionId))
      .sort((left, right) => right.transactionDate.localeCompare(left.transactionDate))
  }, [scopedTransactions, selectedCandidate])

  useEffect(() => {
    if (!selectedCandidate) {
      setSelectedMerchant(null)
      return
    }
    setSelectedMerchant(selectedCandidate.merchant)
  }, [selectedCandidate])

  const applyDecision = async (merchant: string, decision: RecurringDecision | null) => {
    setPendingMerchantDecision(merchant)
    try {
      await workspace.updateRecurringDecision(merchant, decision)
    } finally {
      setPendingMerchantDecision(null)
    }
  }

  const recurringColumns = useMemo<ColumnDef<RecurringCandidateWithDecision, unknown>[]>(
    () => [
      {
        accessorKey: 'merchant',
        header: 'Merchant',
        cell: ({ row }) => (
          <button
            type="button"
            className="cursor-pointer text-left font-medium text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
            onClick={() => navigate(`/transactions?merchant=${encodeURIComponent(row.original.merchant)}`)}
          >
            {row.original.merchant}
          </button>
        ),
      },
      {
        accessorKey: 'category',
        header: 'Category',
      },
      {
        accessorKey: 'cardHolder',
        header: 'Card holder',
      },
      {
        accessorKey: 'cadence',
        header: 'Cadence',
        cell: ({ row }) => <Badge>{cadenceLabels[row.original.cadence]}</Badge>,
      },
      {
        accessorKey: 'occurrences',
        header: 'Occurrences',
      },
      {
        accessorKey: 'lastAmount',
        header: 'Last amount',
        cell: ({ row }) => amountToCurrency(row.original.lastAmount),
      },
      {
        accessorKey: 'monthlyEquivalent',
        header: 'Monthly eq',
        cell: ({ row }) => amountToCurrency(row.original.monthlyEquivalent),
      },
      {
        accessorKey: 'lastChargeDate',
        header: 'Last charge',
        cell: ({ row }) => formatIsoDate(row.original.lastChargeDate),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status
          const className =
            status === 'active'
              ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
              : status === 'possibly_cancelled'
                ? 'border-amber-200 bg-amber-100 text-amber-800'
                : 'border-sky-200 bg-sky-100 text-sky-800'
          return <Badge className={className}>{statusLabels[status]}</Badge>
        },
      },
      {
        accessorKey: 'confidence',
        header: 'Confidence',
        cell: ({ row }) => `${Math.round(row.original.confidence * 100)}%`,
      },
      {
        accessorKey: 'decision',
        header: 'Decision',
        cell: ({ row }) => {
          if (row.original.decision === 'confirmed') {
            return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">Confirmed</Badge>
          }
          if (row.original.decision === 'ignored') {
            return <Badge className="border-slate-200 bg-slate-100 text-slate-700">Ignored</Badge>
          }
          return <span className="text-xs text-slate-500">Undecided</span>
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const loading = pendingMerchantDecision === row.original.merchant
          return (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="secondary"
                disabled={loading || row.original.decision === 'confirmed'}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  void applyDecision(row.original.merchant, 'confirmed')
                }}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={loading || row.original.decision === 'ignored'}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  void applyDecision(row.original.merchant, 'ignored')
                }}
              >
                Ignore
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={loading || row.original.decision == null}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  void applyDecision(row.original.merchant, null)
                }}
              >
                Clear
              </Button>
            </div>
          )
        },
      },
    ],
    [navigate, pendingMerchantDecision],
  )

  return (
    <div>
      <PageHeader
        title="Recurring"
        subtitle="Recurring charge candidates based on repeated merchant and amount behavior."
        icon={RefreshCcw}
      />
      <div className="space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <Card>
            <CardDescription>Monthly recurring total</CardDescription>
            <CardTitle className="mt-1 text-xl">{amountToCurrency(summary.monthlyTotal)}</CardTitle>
          </Card>
          <Card>
            <CardDescription>Annual run-rate</CardDescription>
            <CardTitle className="mt-1 text-xl">{amountToCurrency(summary.annualRunRate)}</CardTitle>
          </Card>
          <Card>
            <CardDescription>Active recurring charges</CardDescription>
            <CardTitle className="mt-1 text-xl">{summary.activeCount}</CardTitle>
          </Card>
          <Card>
            <CardDescription>Possibly cancelled</CardDescription>
            <CardTitle className="mt-1 text-xl">{summary.staleCount}</CardTitle>
          </Card>
          <Card>
            <CardDescription>Newly detected</CardDescription>
            <CardTitle className="mt-1 text-xl">{summary.newCount}</CardTitle>
          </Card>
          <Card>
            <CardDescription>Recent price increases</CardDescription>
            <CardTitle className="mt-1 text-xl">{summary.increasingCount}</CardTitle>
          </Card>
        </div>
        <Card>
          <CardTitle>Recurring filters</CardTitle>
          <CardDescription>Focus the list by cadence, category, status, confidence, and monthly impact.</CardDescription>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Input placeholder="Search merchant..." value={query} onChange={(event) => setQuery(event.target.value)} />
            <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category === 'all' ? 'All categories' : category}
                </option>
              ))}
            </Select>
            <Select value={cardHolderFilter} onChange={(event) => setCardHolderFilter(event.target.value)}>
              {cardHolders.map((holder) => (
                <option key={holder} value={holder}>
                  {holder === 'all' ? 'All card holders' : holder}
                </option>
              ))}
            </Select>
            <Select value={cadenceFilter} onChange={(event) => setCadenceFilter(event.target.value as 'all' | RecurringCadence)}>
              <option value="all">All cadences</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </Select>
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | RecurringStatus)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="new">New</option>
              <option value="possibly_cancelled">Possibly cancelled</option>
            </Select>
            <Select
              value={decisionFilter}
              onChange={(event) =>
                setDecisionFilter(
                  event.target.value as 'excludeIgnored' | 'all' | 'undecided' | 'confirmed' | 'ignored',
                )
              }
            >
              <option value="excludeIgnored">Exclude ignored</option>
              <option value="all">All decisions</option>
              <option value="undecided">Undecided only</option>
              <option value="confirmed">Confirmed only</option>
              <option value="ignored">Ignored only</option>
            </Select>
            <Input
              placeholder="Min monthly equivalent"
              value={minMonthlyEquivalent}
              onChange={(event) => setMinMonthlyEquivalent(event.target.value)}
            />
            <Select value={minConfidence} onChange={(event) => setMinConfidence(event.target.value)}>
              <option value="0.55">Confidence 55%+</option>
              <option value="0.65">Confidence 65%+</option>
              <option value="0.75">Confidence 75%+</option>
              <option value="0.85">Confidence 85%+</option>
              <option value="0">No confidence filter</option>
            </Select>
          </div>
        </Card>
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
          <Card className="min-w-0">
            <CardTitle>Recurring charge candidates</CardTitle>
            <CardDescription>
              Sorted by monthly-equivalent amount. Click a merchant to open all matching transactions.
            </CardDescription>
            <div className="mt-3 min-w-0">
              <AdvancedDataTable
                tableId="recurring-candidates"
                data={filteredRecurring}
                columns={recurringColumns}
                getRowId={(row) => row.merchant}
                defaultSorting={[{ id: 'monthlyEquivalent', desc: true }]}
                onRowClick={(row) => setSelectedMerchant(row.merchant)}
                isRowActive={(row) => row.merchant === selectedCandidate?.merchant}
                activeRowClassName="bg-sky-50/80"
                emptyMessage="No recurring charge patterns were detected for these filters."
              />
            </div>
          </Card>
          <Card className="min-w-0">
            <CardTitle>Recurring details</CardTitle>
            {selectedCandidate ? (
              <div className="mt-3 space-y-3">
                <div>
                  <CardDescription>Merchant</CardDescription>
                  <button
                    type="button"
                    className="text-left text-base font-semibold text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
                    onClick={() =>
                      navigate(`/merchants?merchant=${encodeURIComponent(selectedCandidate.merchant)}`)
                    }
                  >
                    {selectedCandidate.merchant}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-xs text-slate-500">Cadence</p>
                    <p className="font-medium">{cadenceLabels[selectedCandidate.cadence]}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-xs text-slate-500">Monthly equivalent</p>
                    <p className="font-medium">{amountToCurrency(selectedCandidate.monthlyEquivalent)}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-xs text-slate-500">Last amount</p>
                    <p className="font-medium">{amountToCurrency(selectedCandidate.lastAmount)}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-xs text-slate-500">Median amount</p>
                    <p className="font-medium">{amountToCurrency(selectedCandidate.medianAmount)}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-xs text-slate-500">Last charge</p>
                    <p className="font-medium">{formatIsoDate(selectedCandidate.lastChargeDate)}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-xs text-slate-500">Next expected</p>
                    <p className="font-medium">{formatIsoDate(selectedCandidate.nextExpectedDate)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{statusLabels[selectedCandidate.status]}</Badge>
                  {selectedCandidate.priceTrend === 'up' ? (
                    <Badge className="border-amber-200 bg-amber-100 text-amber-800">Price trending up</Badge>
                  ) : selectedCandidate.priceTrend === 'down' ? (
                    <Badge className="border-sky-200 bg-sky-100 text-sky-800">Price trending down</Badge>
                  ) : (
                    <Badge className="border-slate-200 bg-slate-100 text-slate-700">Price stable</Badge>
                  )}
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                  <p className="text-xs text-slate-500">Actions</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={
                        pendingMerchantDecision === selectedCandidate.merchant ||
                        selectedCandidate.decision === 'confirmed'
                      }
                      onClick={() => void applyDecision(selectedCandidate.merchant, 'confirmed')}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={
                        pendingMerchantDecision === selectedCandidate.merchant ||
                        selectedCandidate.decision === 'ignored'
                      }
                      onClick={() => void applyDecision(selectedCandidate.merchant, 'ignored')}
                    >
                      Ignore
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={
                        pendingMerchantDecision === selectedCandidate.merchant ||
                        selectedCandidate.decision == null
                      }
                      onClick={() => void applyDecision(selectedCandidate.merchant, null)}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div>
                  <CardDescription>Matched transactions</CardDescription>
                  <div className="mt-1 max-h-72 space-y-1 overflow-auto">
                    {selectedCandidateTransactions.slice(0, 20).map((transaction) => (
                      <div key={transaction.transactionId} className="rounded-md border border-slate-200 p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span>{formatIsoDate(transaction.transactionDate)}</span>
                          <span className="font-semibold">{amountToCurrency(transaction.amount)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-slate-600">{transaction.descriptionRaw}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() =>
                    navigate(`/transactions?merchant=${encodeURIComponent(selectedCandidate.merchant)}`)
                  }
                >
                  Open in transactions
                </Button>
              </div>
            ) : (
              <CardDescription className="mt-3">
                Select a recurring candidate to inspect cadence details and matched transactions.
              </CardDescription>
            )}
          </Card>
        </div>
        <Card>
          <CardTitle>Monthly equivalent by category</CardTitle>
          <CardDescription>
            Normalized to monthly spend across recurring items in scope.
          </CardDescription>
          <div className="mt-3 space-y-2 text-sm">
            {summary.topCategories.length > 0 ? (
              summary.topCategories.map((category) => (
                <div key={category.category} className="flex items-center justify-between rounded-md bg-slate-50 p-2">
                  <span>{category.category}</span>
                  <span className="font-medium">{amountToCurrency(category.amount)}</span>
                </div>
              ))
            ) : (
              <CardDescription>No recurring category spend in the current filters.</CardDescription>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
