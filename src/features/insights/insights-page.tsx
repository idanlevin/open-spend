import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { LineChart } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { AdvancedDataTable } from '@/components/ui/advanced-data-table'
import { useWorkspace } from '@/hooks/use-workspace'
import { amountToCurrency } from '@/lib/utils'
import { recurringCandidates, spendOverTime, topByDimension } from '@/lib/analytics/metrics'

type RecurringCandidate = ReturnType<typeof recurringCandidates>[number]

export function InsightsPage() {
  const workspace = useWorkspace()
  const trend = useMemo(() => spendOverTime(workspace.transactions), [workspace.transactions])
  const categories = useMemo(
    () => topByDimension(workspace.transactions, 'categoryFinalName', 10),
    [workspace.transactions],
  )
  const merchants = useMemo(
    () => topByDimension(workspace.transactions, 'merchantFinal', 10),
    [workspace.transactions],
  )
  const cardholders = useMemo(
    () => topByDimension(workspace.transactions, 'cardMember', 10),
    [workspace.transactions],
  )
  const recurring = useMemo(() => recurringCandidates(workspace.transactions), [workspace.transactions])
  const recurringColumns = useMemo<ColumnDef<RecurringCandidate, unknown>[]>(
    () => [
      {
        accessorKey: 'merchant',
        header: 'Merchant',
      },
      {
        accessorKey: 'occurrences',
        header: 'Occurrences',
      },
      {
        accessorKey: 'averageAmount',
        header: 'Avg amount',
        cell: ({ row }) => amountToCurrency(row.original.averageAmount),
      },
      {
        accessorKey: 'confidence',
        header: 'Confidence',
        cell: ({ row }) => `${Math.round(row.original.confidence * 100)}%`,
      },
    ],
    [],
  )

  return (
    <div>
      <PageHeader
        title="Insights"
        subtitle="Chart-first analysis across categories, merchants, and cardholders."
        icon={LineChart}
      />
      <div className="space-y-4 p-6">
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardTitle>Monthly spend trend</CardTitle>
            <CardDescription>
              Track long-term spending slope and seasonality. Balance payments are excluded.
            </CardDescription>
            <div className="mt-3 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(value) => amountToCurrency(Number(value))} />
                  <Area dataKey="amount" stroke="#8b8cfb" fill="#e9e8ff" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card>
            <CardTitle>Category ranking</CardTitle>
            <CardDescription>Top categories by amount and transaction count.</CardDescription>
            <div className="mt-3 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categories} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" />
                  <YAxis dataKey="label" type="category" width={140} />
                  <Tooltip formatter={(value) => amountToCurrency(Number(value))} />
                  <Bar dataKey="amount" fill="#9ca4ff" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardTitle>Merchant concentration</CardTitle>
            <CardDescription>Largest merchant buckets in the current workspace.</CardDescription>
            <div className="mt-3 space-y-2 text-sm">
              {merchants.map((merchant) => (
                <div key={merchant.label} className="flex justify-between rounded-md bg-slate-50 p-2">
                  <span className="truncate">{merchant.label}</span>
                  <span>{amountToCurrency(merchant.amount)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardTitle>Cardholder comparison</CardTitle>
            <CardDescription>Attribution of spend by card member.</CardDescription>
            <div className="mt-3 space-y-2 text-sm">
              {cardholders.map((holder) => (
                <div key={holder.label} className="flex justify-between rounded-md bg-slate-50 p-2">
                  <span>{holder.label}</span>
                  <span>{amountToCurrency(holder.amount)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <Card>
          <CardTitle>Recurring charge candidates</CardTitle>
          <CardDescription>Heuristic detections based on repeated merchant + amount behavior.</CardDescription>
          <div className="mt-3">
            <AdvancedDataTable
              tableId="insights-recurring-candidates"
              data={recurring}
              columns={recurringColumns}
              getRowId={(row) => row.merchant}
              defaultSorting={[{ id: 'confidence', desc: true }]}
              emptyMessage="No recurring charge patterns were detected yet."
            />
          </div>
        </Card>
      </div>
    </div>
  )
}
