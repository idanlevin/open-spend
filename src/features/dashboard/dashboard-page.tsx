import { useMemo, useState } from 'react'
import { format, endOfMonth, parse } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LucideIcon } from 'lucide-react'
import {
  BadgeDollarSign,
  ChevronRight,
  FolderSync,
  LayoutDashboard,
  ReceiptText,
  RefreshCcw,
  Tags,
  TrendingUp,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { amountToCurrency } from '@/lib/utils'
import { useWorkspace } from '@/hooks/use-workspace'
import { buildDashboardMetrics, spendOverTime, topByDimension } from '@/lib/analytics/metrics'
import { FolderImporter } from '@/features/import/folder-importer'

const PIE_COLORS = ['#a78bfa', '#f9a8d4', '#93c5fd', '#86efac', '#fde68a', '#fca5a5']

export function DashboardPage() {
  const navigate = useNavigate()
  const [includeRefundsInTrend, setIncludeRefundsInTrend] = useState(false)
  const workspace = useWorkspace()
  const metrics = useMemo(
    () => buildDashboardMetrics(workspace.transactions),
    [workspace.transactions],
  )
  const trend = useMemo(
    () => spendOverTime(workspace.transactions, { includeRefunds: includeRefundsInTrend }),
    [includeRefundsInTrend, workspace.transactions],
  )
  const byCategory = useMemo(
    () => topByDimension(workspace.transactions, 'categoryFinalName', 6),
    [workspace.transactions],
  )
  const byMerchant = useMemo(
    () => topByDimension(workspace.transactions, 'merchantFinal', 8),
    [workspace.transactions],
  )

  const needsReview = {
    uncategorized: workspace.transactions.filter((tx) => tx.categoryFinalName === 'Uncategorized').length,
    newMerchants: workspace.latestImport?.newMerchants.length ?? 0,
    suspectedDuplicates: workspace.latestImport?.importBatch.duplicatesSkipped ?? 0,
    ruleConflicts: 0,
  }

  const navigateToTransactions = (params?: Record<string, string | boolean | undefined>) => {
    const searchParams = new URLSearchParams()
    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (value === undefined || value === '') return
      searchParams.set(key, String(value))
    })
    const query = searchParams.toString()
    navigate(query ? `/transactions?${query}` : '/transactions')
  }

  const handleTopMerchantClick = () => {
    if (!metrics.topMerchant || metrics.topMerchant === '-') return
    const query = new URLSearchParams({ merchant: metrics.topMerchant }).toString()
    navigate(`/merchants?${query}`)
  }

  const handleMonthBarClick = (chartPoint: unknown) => {
    const period =
      typeof chartPoint === 'object' &&
      chartPoint !== null &&
      'payload' in chartPoint &&
      typeof (chartPoint as { payload?: { period?: unknown } }).payload?.period === 'string'
        ? (chartPoint as { payload: { period: string } }).payload.period
        : undefined

    if (!period) return
    const monthDate = parse(period, 'yyyy-MM', new Date())
    const startDate = format(monthDate, 'yyyy-MM-01')
    const endDate = format(endOfMonth(monthDate), 'yyyy-MM-dd')
    navigateToTransactions({ month: period, startDate, endDate })
  }

  const handleCategorySliceClick = (slicePoint: unknown) => {
    const categoryName =
      typeof slicePoint === 'object' &&
      slicePoint !== null &&
      'payload' in slicePoint &&
      typeof (slicePoint as { payload?: { label?: unknown } }).payload?.label === 'string'
        ? (slicePoint as { payload: { label: string } }).payload.label
        : undefined
    if (!categoryName) return
    const category = workspace.categories.find(
      (item) => item.name.toLowerCase() === categoryName.toLowerCase(),
    )
    navigateToTransactions({
      categoryId: category?.categoryId,
      category: categoryName,
    })
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Local-first workspace for AMEX spending analytics."
        icon={LayoutDashboard}
        actions={
          <Button variant="secondary" onClick={() => workspace.refresh()}>
            <FolderSync className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />
      <div className="space-y-4 p-6">
        <FolderImporter />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total spend" value={amountToCurrency(metrics.totalSpend)} icon={BadgeDollarSign} />
          <MetricCard label="Net spend" value={amountToCurrency(metrics.netSpend)} icon={TrendingUp} />
          <MetricCard label="Avg transaction" value={amountToCurrency(metrics.avgTransaction)} icon={ReceiptText} />
          <MetricCard
            label="Transactions"
            value={String(metrics.transactionCount)}
            icon={RefreshCcw}
            actionLabel={metrics.transactionCount > 0 ? 'View all transactions' : undefined}
            onClick={metrics.transactionCount > 0 ? () => navigateToTransactions() : undefined}
          />
          <MetricCard
            label="Top category"
            value={metrics.topCategory}
            icon={Tags}
            actionLabel={metrics.topCategory && metrics.topCategory !== '-' ? 'View category' : undefined}
            onClick={
              metrics.topCategory && metrics.topCategory !== '-'
                ? () => {
                    const category = workspace.categories.find(
                      (item) => item.name.toLowerCase() === metrics.topCategory.toLowerCase(),
                    )
                    navigateToTransactions({
                      categoryId: category?.categoryId,
                      category: metrics.topCategory,
                    })
                  }
                : undefined
            }
          />
          <MetricCard
            label="Top merchant"
            value={metrics.topMerchant}
            icon={BadgeDollarSign}
            actionLabel={metrics.topMerchant && metrics.topMerchant !== '-' ? 'View merchant' : undefined}
            onClick={metrics.topMerchant && metrics.topMerchant !== '-' ? handleTopMerchantClick : undefined}
          />
          <MetricCard label="Refund total" value={amountToCurrency(metrics.refundsTotal)} icon={TrendingUp} />
          <MetricCard
            label="Uncategorized"
            value={String(metrics.uncategorizedCount)}
            icon={ReceiptText}
            actionLabel={metrics.uncategorizedCount > 0 ? 'Review uncategorized' : undefined}
            onClick={
              metrics.uncategorizedCount > 0
                ? () => navigateToTransactions({ uncategorizedOnly: true })
                : undefined
            }
          />
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Spending over time</CardTitle>
                <CardDescription>
                  Monthly spend trend for current workspace scope. Click a month to drill in.
                </CardDescription>
              </div>
              <label className="mt-0.5 inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/70 px-2 py-1 text-xs font-medium text-violet-900">
                <Checkbox
                  checked={includeRefundsInTrend}
                  onChange={(event) => setIncludeRefundsInTrend(event.target.checked)}
                />
                Include refunds
              </label>
            </div>
            <div className="mt-3 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(value) => amountToCurrency(Number(value))} />
                  <Bar
                    dataKey="amount"
                    fill="#8b8cfb"
                    radius={8}
                    onClick={handleMonthBarClick}
                    cursor="pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <CardTitle>Category composition</CardTitle>
            <CardDescription>Top categories in analytics scope. Click a slice to view transactions.</CardDescription>
            <div className="mt-3 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byCategory}
                    dataKey="amount"
                    nameKey="label"
                    outerRadius={95}
                    onClick={handleCategorySliceClick}
                    cursor="pointer"
                  >
                    {byCategory.map((entry, idx) => (
                      <Cell key={entry.label} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => amountToCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardTitle>Top merchants</CardTitle>
            <div className="mt-2 space-y-2 text-sm">
              {byMerchant.length === 0 ? (
                <p className="text-slate-500">Import statements to see merchant rankings.</p>
              ) : (
                byMerchant.map((merchant) => (
                  <button
                    key={merchant.label}
                    type="button"
                    className="flex w-full items-center justify-between rounded-md bg-slate-50 p-2 text-left transition hover:bg-violet-50"
                    onClick={() => {
                      const query = new URLSearchParams({ merchant: merchant.label }).toString()
                      navigate(`/merchants?${query}`)
                    }}
                  >
                    <span className="truncate">{merchant.label}</span>
                    <span className="flex items-center gap-2">
                      <strong>{amountToCurrency(merchant.amount)}</strong>
                      <ChevronRight className="h-4 w-4 text-violet-500" />
                    </span>
                  </button>
                ))
              )}
            </div>
          </Card>
          <Card>
            <CardTitle>Needs review</CardTitle>
            <CardDescription>High-priority cleanup tasks across imports.</CardDescription>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <ReviewStat label="Uncategorized" value={needsReview.uncategorized} />
              <ReviewStat label="New merchants" value={needsReview.newMerchants} />
              <ReviewStat label="Duplicates" value={needsReview.suspectedDuplicates} />
              <ReviewStat label="Rule conflicts" value={needsReview.ruleConflicts} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  icon: Icon,
  onClick,
  actionLabel,
}: {
  label: string
  value: string
  icon: LucideIcon
  onClick?: () => void
  actionLabel?: string
}) {
  const content = (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-(--text-muted)">{label}</p>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br from-violet-100 to-pink-100 text-violet-700">
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-1 text-2xl font-semibold text-(--text-primary)">{value}</p>
      {actionLabel ? (
        <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-violet-700">
          {actionLabel}
          <ChevronRight className="h-3.5 w-3.5" />
        </p>
      ) : null}
    </Card>
  )

  if (!onClick) return content

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl text-left transition-transform duration-150 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
    >
      {content}
    </button>
  )
}

function ReviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-violet-100 bg-linear-to-br from-violet-50/80 to-sky-50/80 p-2">
      <p className="text-(--text-muted)">{label}</p>
      <p className="text-xl font-semibold text-(--text-primary)">{value}</p>
    </div>
  )
}
