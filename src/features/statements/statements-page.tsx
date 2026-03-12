import { useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { Files } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { useWorkspace } from '@/hooks/use-workspace'
import { amountToCurrency } from '@/lib/utils'

export function StatementsPage() {
  const workspace = useWorkspace()
  const byStatement = useMemo(() => {
    return workspace.statements.map((statement) => {
      const scoped = workspace.transactions.filter((tx) => tx.statementId === statement.statementId)
      const totalDebits = scoped.filter((tx) => tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0)
      const totalRefunds = scoped.filter((tx) => tx.isRefund).reduce((sum, tx) => sum + tx.amount, 0)
      const totalPayments = scoped.filter((tx) => tx.isPayment).reduce((sum, tx) => sum + tx.amount, 0)
      return {
        statement,
        count: scoped.length,
        totalDebits,
        totalRefunds,
        totalPayments,
      }
    })
  }, [workspace.statements, workspace.transactions])

  return (
    <div>
      <PageHeader
        title="Statements"
        subtitle="Statement-centric audit trail with import provenance and scoped metrics."
        icon={Files}
      />
      <div className="grid gap-4 p-6 lg:grid-cols-2">
        {byStatement.map(({ statement, count, totalDebits, totalRefunds, totalPayments }) => (
          <Card key={statement.statementId}>
            <CardTitle>
              {statement.statementStartDate} - {statement.statementEndDate}
            </CardTitle>
            <CardDescription>
              {statement.preparedFor} · {statement.accountNumberMasked} · {statement.cardProductName}
            </CardDescription>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-md bg-slate-50 p-2">
                <p className="text-slate-500">Transactions</p>
                <p className="text-lg font-semibold">{count}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-2">
                <p className="text-slate-500">Imported</p>
                <p className="text-sm font-semibold">
                  {format(parseISO(statement.importedAt), 'MMM d, yyyy')}
                </p>
              </div>
              <div className="rounded-md bg-slate-50 p-2">
                <p className="text-slate-500">Debits</p>
                <p className="text-sm font-semibold">{amountToCurrency(totalDebits)}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-2">
                <p className="text-slate-500">Refunds</p>
                <p className="text-sm font-semibold text-emerald-700">{amountToCurrency(totalRefunds)}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-2">
                <p className="text-slate-500">Payments</p>
                <p className="text-sm font-semibold text-emerald-700">{amountToCurrency(totalPayments)}</p>
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-500">Parse version: {statement.parseVersion}</div>
          </Card>
        ))}
        {byStatement.length === 0 ? (
          <Card>
            <CardTitle>No statements imported</CardTitle>
            <CardDescription>Use folder import on the dashboard to populate this page.</CardDescription>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
