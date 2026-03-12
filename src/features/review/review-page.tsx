import { useMemo } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { useWorkspace } from '@/hooks/use-workspace'
import { amountToCurrency } from '@/lib/utils'

export function ReviewPage() {
  const workspace = useWorkspace()
  const uncategorized = useMemo(
    () =>
      workspace.transactions
        .filter((tx) => tx.categoryFinalName === 'Uncategorized' && !tx.isPayment)
        .slice(0, 80),
    [workspace.transactions],
  )
  const largeTransactions = useMemo(
    () =>
      workspace.transactions
        .filter((tx) => tx.amount > 1000 && !tx.isExcludedFromAnalytics)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 20),
    [workspace.transactions],
  )

  return (
    <div>
      <PageHeader
        title="Review queue"
        subtitle="Central triage inbox for cleanup work."
        icon={ClipboardCheck}
      />
      <div className="grid gap-4 p-6 xl:grid-cols-2">
        <Card>
          <CardTitle>Uncategorized transactions</CardTitle>
          <CardDescription>Assign categories with fast inline actions.</CardDescription>
          <div className="mt-3 max-h-[70vh] space-y-2 overflow-auto">
            {uncategorized.length === 0 ? (
              <p className="text-sm text-slate-500">No uncategorized transactions in scope.</p>
            ) : (
              uncategorized.map((tx) => (
                <div key={tx.transactionId} className="rounded-md border border-slate-200 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{tx.merchantFinal}</p>
                      <p className="text-xs text-slate-500">{tx.descriptionRaw}</p>
                    </div>
                    <strong>{amountToCurrency(tx.amount)}</strong>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Select
                      defaultValue=""
                      onChange={(event) => {
                        if (!event.target.value) return
                        workspace.updateCategoryOverride(tx.transactionId, event.target.value)
                      }}
                    >
                      <option value="">Assign category...</option>
                      {workspace.categories
                        .filter((category) => category.categoryId !== 'cat_uncategorized')
                        .map((category) => (
                          <option key={category.categoryId} value={category.categoryId}>
                            {category.name}
                          </option>
                        ))}
                    </Select>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        workspace.updateTransactionFlags(tx.transactionId, { isExcludedFromAnalytics: true })
                      }
                    >
                      Exclude
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardTitle>New merchants</CardTitle>
            <CardDescription>Detected in latest import batch.</CardDescription>
            <div className="mt-2 flex flex-wrap gap-2">
              {(workspace.latestImport?.newMerchants ?? []).slice(0, 30).map((merchant) => (
                <Badge key={merchant}>{merchant}</Badge>
              ))}
              {(workspace.latestImport?.newMerchants.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-500">No new merchants in latest import.</p>
              ) : null}
            </div>
          </Card>
          <Card>
            <CardTitle>Suspected duplicates</CardTitle>
            <CardDescription>Skipped rows from import deduplication.</CardDescription>
            <p className="mt-2 text-sm">
              {workspace.latestImport?.importBatch.duplicatesSkipped ?? 0} duplicates skipped in latest import.
            </p>
          </Card>
          <Card>
            <CardTitle>Large unusual transactions</CardTitle>
            <CardDescription>Charges over $1,000 for quick review.</CardDescription>
            <div className="mt-2 space-y-2 text-sm">
              {largeTransactions.map((tx) => (
                <div key={tx.transactionId} className="flex justify-between rounded-md bg-slate-50 p-2">
                  <span className="truncate">{tx.merchantFinal}</span>
                  <span>{amountToCurrency(tx.amount)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
