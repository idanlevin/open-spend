import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useNavigate } from 'react-router-dom'
import { BadgeDollarSign, HandCoins } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { AdvancedDataTable } from '@/components/ui/advanced-data-table'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { useWorkspace } from '@/hooks/use-workspace'
import type { EnrichedTransaction } from '@/types/domain'
import { amountToCurrency } from '@/lib/utils'

export function PaymentsPage() {
  const navigate = useNavigate()
  const workspace = useWorkspace()

  const payments = useMemo(
    () =>
      [...workspace.transactions]
        .filter((tx) => tx.isPayment)
        .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)),
    [workspace.transactions],
  )

  const totalPayments = useMemo(
    () => payments.filter((tx) => !tx.isExcludedFromAnalytics).reduce((sum, tx) => sum + tx.amount, 0),
    [payments],
  )
  const columns = useMemo<ColumnDef<EnrichedTransaction, unknown>[]>(
    () => [
      {
        accessorKey: 'transactionDate',
        header: 'Date',
      },
      {
        accessorKey: 'cardMember',
        header: 'Cardholder',
      },
      {
        accessorKey: 'merchantFinal',
        header: 'Merchant',
      },
      {
        accessorKey: 'descriptionRaw',
        header: 'Description',
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => <span className="font-medium text-emerald-700">{amountToCurrency(row.original.amount)}</span>,
      },
    ],
    [],
  )

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Balance payments tracked separately from refunds and spending analytics."
        icon={HandCoins}
        actions={
          <Button variant="secondary" onClick={() => navigate('/transactions?paymentsOnly=true')}>
            <BadgeDollarSign className="mr-2 h-4 w-4" />
            Open in explorer
          </Button>
        }
      />
      <div className="space-y-4 p-6">
        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <p className="text-xs uppercase tracking-wide text-(--text-muted)">Payments total</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-700">{amountToCurrency(totalPayments)}</p>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-(--text-muted)">Payment transactions</p>
            <p className="mt-1 text-2xl font-semibold text-(--text-primary)">{payments.length}</p>
          </Card>
        </div>

        <Card>
          <CardTitle>Recent payments</CardTitle>
          <CardDescription>Imported payment rows such as autopay and manual balance payments.</CardDescription>
          {payments.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No payments detected yet in this workspace.</p>
          ) : (
            <div className="mt-3">
              <AdvancedDataTable
                tableId="payments-recent"
                data={payments}
                columns={columns}
                getRowId={(row) => row.transactionId}
                defaultSorting={[{ id: 'transactionDate', desc: true }]}
                emptyMessage="No payments detected yet in this workspace."
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
