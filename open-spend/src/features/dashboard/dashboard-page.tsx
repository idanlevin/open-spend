import { useMemo } from 'react'
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
import { amountToCurrency } from '@/lib/utils'
import { useWorkspace } from '@/hooks/use-workspace'
import { buildDashboardMetrics, spendOverTime, topByDimension } from '@/lib/analytics/metrics'
import { FolderImporter } from '@/features/import/folder-importer'

const PIE_COLORS = ['#a78bfa', '#f9a8d4', '#93c5fd', '#86efac', '#fde68a', '#fca5a5']

export function DashboardPage() {
  const workspace = useWorkspace()
  const metrics = useMemo(
    () => buildDashboardMetrics(workspace.transactions),
    [workspace.transactions],
  )
  const trend = useMemo(() => spendOverTime(workspace.transactions), [workspace.transactions])
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
          <MetricCard label="Transactions" value={String(metrics.transactionCount)} icon={RefreshCcw} />
          <MetricCard label="Top category" value={metrics.topCategory} icon={Tags} />
          <MetricCard label="Top merchant" value={metrics.topMerchant} icon={BadgeDollarSign} />
          <MetricCard label="Refund total" value={amountToCurrency(metrics.refundsTotal)} icon={TrendingUp} />
          <MetricCard label="Uncategorized" value={String(metrics.uncategorizedCount)} icon={ReceiptText} />
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardTitle>Spending over time</CardTitle>
            <CardDescription>Monthly spend trend for current workspace scope.</CardDescription>
            <div className="mt-3 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(value) => amountToCurrency(Number(value))} />
                  <Bar dataKey="amount" fill="#8b8cfb" radius={8} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <CardTitle>Category composition</CardTitle>
            <CardDescription>Top categories in analytics scope.</CardDescription>
            <div className="mt-3 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="amount" nameKey="label" outerRadius={95}>
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
                  <div key={merchant.label} className="flex items-center justify-between rounded-md bg-slate-50 p-2">
                    <span className="truncate">{merchant.label}</span>
                    <strong>{amountToCurrency(merchant.amount)}</strong>
                  </div>
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
}: {
  label: string
  value: string
  icon: LucideIcon
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-100 to-pink-100 text-violet-700">
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
    </Card>
  )
}

function ReviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-sky-50/80 p-2">
      <p className="text-[var(--text-muted)]">{label}</p>
      <p className="text-xl font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  )
}
