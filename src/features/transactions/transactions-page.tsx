import { useEffect, useMemo, useState } from 'react'
import { parse } from 'date-fns'
import { type ColumnDef, type GroupingState } from '@tanstack/react-table'
import { Download, TableProperties } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { AdvancedDataTable } from '@/components/ui/advanced-data-table'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useScopedTransactions } from '@/hooks/use-time-scope'
import { useWorkspace } from '@/hooks/use-workspace'
import { useViewStore, type GroupByOption } from '@/stores/view-store'
import { useTimeRangeStore } from '@/stores/time-range-store'
import type { EnrichedTransaction } from '@/types/domain'
import { amountToCurrency, normalizeText } from '@/lib/utils'
import { applyTransactionFilters } from '@/lib/analytics/filtering'
import { exportTransactionsCsv, exportTransactionsXlsx } from '@/lib/export/exporters'

export function TransactionsPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const workspace = useWorkspace()
  const { filters, setFilters, resetFilters } = useViewStore()
  const setGlobalTimeMode = useTimeRangeStore((state) => state.setMode)
  const patchGlobalTime = useTimeRangeStore((state) => state.patch)
  const scopedTransactions = useScopedTransactions(workspace.transactions, workspace.statements)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedRows, setSelectedRows] = useState<EnrichedTransaction[]>([])
  const [selectionResetToken, setSelectionResetToken] = useState(0)
  const [grouping, setGrouping] = useState<GroupingState>([])
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkTagId, setBulkTagId] = useState('')
  const [showBulkActions, setShowBulkActions] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)

  const filteredRows = useMemo(
    () => applyTransactionFilters(scopedTransactions, { ...filters, startDate: '', endDate: '' }),
    [filters, scopedTransactions],
  )

  const columns = useMemo<ColumnDef<EnrichedTransaction>[]>(
    () => [
      {
        accessorKey: 'transactionDate',
        header: 'Date',
      },
      {
        accessorKey: 'statementId',
        header: 'Statement',
        cell: ({ row }) => <span className="text-xs">{row.original.statementId.slice(0, 12)}</span>,
      },
      {
        accessorKey: 'merchantFinal',
        header: 'Merchant',
        cell: ({ row }) => (
          <div>
            <p>{row.original.merchantFinal}</p>
            {row.original.hasManualOverride ? <Badge className="mt-1">Edited</Badge> : null}
          </div>
        ),
      },
      {
        accessorKey: 'descriptionRaw',
        header: 'Description',
      },
      {
        accessorKey: 'cardMember',
        header: 'Cardholder',
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => (
          <span className={row.original.amount < 0 ? 'text-emerald-700' : 'text-slate-900'}>
            {amountToCurrency(row.original.amount)}
          </span>
        ),
      },
      {
        accessorKey: 'categoryFinalName',
        header: 'Category',
      },
      {
        accessorKey: 'amexCategoryRaw',
        header: 'Raw Category',
        cell: ({ row }) => (
          <span className="text-xs text-slate-700">{row.original.amexCategoryRaw || '—'}</span>
        ),
      },
      {
        id: 'tags',
        header: 'Tags',
        accessorFn: (row) => row.tags.map((tag) => tag.name).join(', '),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.tags.slice(0, 2).map((tag) => (
              <Badge key={tag.tagId}>{tag.name}</Badge>
            ))}
          </div>
        ),
      },
      {
        accessorKey: 'notes',
        header: 'Notes',
        cell: ({ row }) => <span className="line-clamp-1 text-xs text-slate-600">{row.original.notes}</span>,
      },
    ],
    [],
  )

  const selectedTransaction = useMemo(
    () => filteredRows.find((tx) => tx.transactionId === selectedId),
    [filteredRows, selectedId],
  )

  const selectedCount = selectedRows.length
  const selectedRowsWithRevertableEdits = useMemo(
    () =>
      selectedRows.filter((row) => {
        const override = row.manualOverride
        if (!override) return false
        return (
          typeof override.merchantOverride === 'string' ||
          typeof override.categoryOverrideId === 'string' ||
          (typeof override.notes === 'string' && override.notes.trim().length > 0)
        )
      }),
    [selectedRows],
  )

  const applyBulkCategory = async () => {
    if (!bulkCategory || selectedRows.length === 0) return
    await Promise.all(selectedRows.map((row) => workspace.updateCategoryOverride(row.transactionId, bulkCategory)))
    setBulkCategory('')
    setSelectedRows([])
    setSelectionResetToken((value) => value + 1)
  }

  const applyBulkTag = async () => {
    if (!bulkTagId || selectedRows.length === 0) return
    await Promise.all(
      selectedRows.map((row) =>
        workspace.updateTags(
          row.transactionId,
          Array.from(new Set([...row.tags.map((tag) => tag.tagId), bulkTagId])),
        ),
      ),
    )
    setBulkTagId('')
    setSelectedRows([])
    setSelectionResetToken((value) => value + 1)
  }

  const applyBulkRevertManualEdits = async () => {
    if (selectedRowsWithRevertableEdits.length === 0) return
    const message = `Revert manual merchant/category/notes edits for ${selectedRowsWithRevertableEdits.length} selected transaction${selectedRowsWithRevertableEdits.length === 1 ? '' : 's'}?`
    if (!window.confirm(message)) return
    await Promise.all(
      selectedRowsWithRevertableEdits.map((row) => workspace.revertTransactionEdits(row.transactionId)),
    )
    setSelectedRows([])
    setSelectionResetToken((value) => value + 1)
    setShowBulkActions(false)
  }

  const exportRows = selectedCount > 0 ? selectedRows : filteredRows

  const handleExport = (format: 'csv' | 'xlsx') => {
    if (format === 'csv') {
      exportTransactionsCsv(exportRows, selectedCount > 0 ? 'transactions-selected.csv' : 'transactions.csv')
    } else {
      exportTransactionsXlsx(
        exportRows,
        selectedCount > 0 ? 'transactions-selected.xlsx' : 'transactions-cleaned.xlsx',
      )
    }
    setShowExportMenu(false)
  }

  useEffect(() => {
    if (selectedCount > 0) return
    setShowBulkActions(false)
  }, [selectedCount])

  const setGroupBy = (next: GroupByOption) => {
    setFilters({ groupBy: next })
    if (next === 'none') {
      setGrouping([])
      return
    }
    const fieldByGroup: Record<Exclude<GroupByOption, 'none'>, string> = {
      category: 'categoryFinalName',
      merchant: 'merchantFinal',
      cardMember: 'cardMember',
      statement: 'statementId',
      month: 'transactionDate',
    }
    setGrouping([fieldByGroup[next]])
  }

  useEffect(() => {
    resetFilters()
    if ([...searchParams.keys()].length === 0) return

    const patch: Parameters<typeof setFilters>[0] = {}
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')
    const monthParam = searchParams.get('month')
    const categoryIdParam = searchParams.get('categoryId')
    const categoryNameParam = searchParams.get('category')
    const merchantParam = searchParams.get('merchant')
    const queryParam = searchParams.get('q')
    const uncategorizedOnlyParam = searchParams.get('uncategorizedOnly')
    const paymentsOnlyParam = searchParams.get('paymentsOnly')
    const kindParam = searchParams.get('kind')

    if (monthParam) {
      const monthDate = parse(monthParam, 'yyyy-MM', new Date())
      if (!Number.isNaN(monthDate.getTime())) {
        setGlobalTimeMode('month')
        patchGlobalTime({ month: monthParam })
      }
    } else if (startDateParam || endDateParam) {
      setGlobalTimeMode('custom')
      patchGlobalTime({
        customStartDate: startDateParam ?? '',
        customEndDate: endDateParam ?? '',
      })
    }
    if (merchantParam) patch.merchants = [merchantParam]
    if (queryParam) patch.query = queryParam
    if (uncategorizedOnlyParam === 'true') patch.uncategorizedOnly = true
    if (paymentsOnlyParam === 'true' || kindParam === 'payment') {
      patch.paymentsOnly = true
      patch.refundsOnly = false
    } else if (kindParam === 'refund') {
      patch.refundsOnly = true
      patch.paymentsOnly = false
    }

    if (categoryIdParam) {
      patch.categoryIds = [categoryIdParam]
    } else if (categoryNameParam) {
      const category = workspace.categories.find(
        (item) => item.name.toLowerCase() === categoryNameParam.toLowerCase(),
      )
      if (category) patch.categoryIds = [category.categoryId]
    }

    setFilters(patch)
  }, [
    patchGlobalTime,
    resetFilters,
    searchParams,
    setFilters,
    setGlobalTimeMode,
    workspace.categories,
  ])

  return (
    <div>
      <PageHeader
        title="Transactions explorer"
        subtitle="Filter, group, edit, and export enriched transactions."
        icon={TableProperties}
      />
      <div className="flex gap-4 p-6">
        <Card className="min-w-0 flex-1 overflow-hidden p-0">
          <div className="p-3">
            <AdvancedDataTable
              tableId="transactions-explorer"
              data={filteredRows}
              columns={columns}
              getRowId={(row) => row.transactionId}
              enableRowSelection
              onSelectedRowsChange={setSelectedRows}
              selectionResetToken={selectionResetToken}
              defaultSorting={[{ id: 'transactionDate', desc: true }]}
              grouping={grouping}
              onGroupingChange={setGrouping}
              enableGrouping
              onRowClick={(row) => setSelectedId(row.transactionId)}
              isRowActive={(row) => row.transactionId === selectedId}
              emptyMessage="No transactions match the current filters."
              toolbarActions={
                <>
                  <Select
                    className="h-8 w-[180px]"
                    value={filters.groupBy}
                    onChange={(event) => setGroupBy(event.target.value as GroupByOption)}
                  >
                    <option value="none">No grouping</option>
                    <option value="category">Group by category</option>
                    <option value="merchant">Group by merchant</option>
                    <option value="cardMember">Group by cardholder</option>
                    <option value="statement">Group by statement</option>
                    <option value="month">Group by month</option>
                  </Select>
                  {selectedCount > 0 ? (
                    <div className="relative">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowBulkActions((current) => !current)}
                      >
                        Bulk actions ({selectedCount})
                      </Button>
                      {showBulkActions ? (
                        <div className="absolute top-[calc(100%+6px)] right-0 z-20 w-[290px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                          <CardTitle>Bulk actions</CardTitle>
                          <CardDescription>{selectedCount} selected</CardDescription>
                          <div className="mt-2 space-y-2">
                            <Select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)}>
                              <option value="">Set category...</option>
                              {workspace.categories.map((category) => (
                                <option key={category.categoryId} value={category.categoryId}>
                                  {category.name}
                                </option>
                              ))}
                            </Select>
                            <Button
                              className="w-full"
                              onClick={applyBulkCategory}
                              disabled={!bulkCategory || selectedCount === 0}
                            >
                              Apply category to selected
                            </Button>
                            <Select value={bulkTagId} onChange={(event) => setBulkTagId(event.target.value)}>
                              <option value="">Add tag...</option>
                              {workspace.tags.map((tag) => (
                                <option key={tag.tagId} value={tag.tagId}>
                                  {tag.name}
                                </option>
                              ))}
                            </Select>
                            <Button className="w-full" onClick={applyBulkTag} disabled={!bulkTagId || selectedCount === 0}>
                              Add tag to selected
                            </Button>
                            <Button
                              className="w-full"
                              variant="ghost"
                              onClick={applyBulkRevertManualEdits}
                              disabled={selectedRowsWithRevertableEdits.length === 0}
                            >
                              Revert manual edits on selected
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="relative">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowExportMenu((current) => !current)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {selectedCount > 0 ? 'Export selected' : 'Export'}
                    </Button>
                    {showExportMenu ? (
                      <div className="absolute top-[calc(100%+6px)] right-0 z-20 w-[200px] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                        <p className="px-2 pb-1 text-xs font-medium text-slate-500">Choose file format</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => handleExport('csv')}
                        >
                          Export as CSV
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => handleExport('xlsx')}
                        >
                          Export as XLSX
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </>
              }
            />
          </div>
        </Card>
        <Card className="w-[320px] shrink-0">
          <CardTitle>Details</CardTitle>
          <CardDescription>
            {selectedTransaction ? (
              <button
                type="button"
                className="cursor-pointer text-left text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
                onClick={() =>
                  navigate(`/merchants?merchant=${encodeURIComponent(selectedTransaction.merchantFinal)}`)
                }
              >
                {selectedTransaction.merchantFinal}
              </button>
            ) : (
              'Select a transaction'
            )}
          </CardDescription>
          {selectedTransaction ? (
            <TransactionDetails transaction={selectedTransaction} />
          ) : (
            <p className="mt-3 text-sm text-slate-500">Use the table to inspect and edit transaction details.</p>
          )}
        </Card>
      </div>
    </div>
  )
}

function TransactionDetails({ transaction }: { transaction: EnrichedTransaction }) {
  const workspace = useWorkspace()
  const [notes, setNotes] = useState(transaction.notes)
  const [merchantOverride, setMerchantOverride] = useState(transaction.merchantFinal)
  const [categoryId, setCategoryId] = useState(transaction.categoryFinalId)
  const [tagIds, setTagIds] = useState(transaction.tags.map((tag) => tag.tagId))
  const [revertingField, setRevertingField] = useState<string | null>(null)

  useEffect(() => {
    setNotes(transaction.notes)
    setMerchantOverride(transaction.merchantFinal)
    setCategoryId(transaction.categoryFinalId)
    setTagIds(transaction.tags.map((tag) => tag.tagId))
  }, [transaction])

  const categoryNameById = useMemo(
    () => new Map(workspace.categories.map((category) => [category.categoryId, category.name])),
    [workspace.categories],
  )

  const manualChanges = useMemo<
    Array<{ field: 'merchantOverride' | 'categoryOverrideId' | 'notes'; label: string; from: string; to: string }>
  >(() => {
    const changes: Array<{
      field: 'merchantOverride' | 'categoryOverrideId' | 'notes'
      label: string
      from: string
      to: string
    }> = []
    const override = transaction.manualOverride
    if (!transaction.hasManualOverride || !override) return changes

    if (
      typeof override.merchantOverride === 'string' &&
      normalizeText(override.merchantOverride) !== normalizeText(transaction.merchantNormalized)
    ) {
      changes.push({
        field: 'merchantOverride',
        label: 'Merchant',
        from: transaction.merchantNormalized,
        to: override.merchantOverride,
      })
    }

    if (
      typeof override.categoryOverrideId === 'string' &&
      override.categoryOverrideId !== transaction.categoryIdResolved
    ) {
      changes.push({
        field: 'categoryOverrideId',
        label: 'Category',
        from: categoryNameById.get(transaction.categoryIdResolved) ?? transaction.categoryIdResolved,
        to: categoryNameById.get(override.categoryOverrideId) ?? override.categoryOverrideId,
      })
    }

    if (typeof override.notes === 'string' && override.notes.trim().length > 0) {
      changes.push({
        field: 'notes',
        label: 'Notes',
        from: 'None',
        to: override.notes,
      })
    }

    return changes
  }, [categoryNameById, transaction])

  const save = async () => {
    const nextMerchant = merchantOverride.trim()
    const nextNotes = notes
    const currentTagIds = transaction.tags.map((tag) => tag.tagId)
    const hasTagChanges =
      currentTagIds.length !== tagIds.length ||
      currentTagIds.some((tagId) => !tagIds.includes(tagId)) ||
      tagIds.some((tagId) => !currentTagIds.includes(tagId))
    const shouldRenameMerchant =
      nextMerchant.length > 0 &&
      normalizeText(nextMerchant) !== normalizeText(transaction.merchantFinal)
    const shouldUpdateNotes = nextNotes !== transaction.notes
    const shouldUpdateCategory = categoryId !== transaction.categoryFinalId

    if (shouldUpdateNotes) {
      await workspace.updateTransactionFlags(transaction.transactionId, { notes: nextNotes })
    }
    if (shouldRenameMerchant) {
      await workspace.renameMerchant(transaction.merchantFinal, nextMerchant)
    }
    if (shouldUpdateCategory) {
      await workspace.updateCategoryOverride(transaction.transactionId, categoryId)
    }
    if (hasTagChanges) {
      await workspace.updateTags(transaction.transactionId, tagIds)
    }
  }

  return (
    <div className="mt-3 space-y-2 text-sm">
      <div>
        <p className="text-xs text-slate-500">Amount</p>
        <p className="text-base font-semibold">{amountToCurrency(transaction.amount)}</p>
      </div>
      <div>
        <p className="text-xs text-slate-500">Merchant (renames all matching transactions)</p>
        <Input value={merchantOverride} onChange={(event) => setMerchantOverride(event.target.value)} />
      </div>
      <div>
        <p className="text-xs text-slate-500">Raw Category</p>
        <p className="text-sm">{transaction.amexCategoryRaw || '—'}</p>
      </div>
      <div>
        <p className="text-xs text-slate-500">Category</p>
        <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          {workspace.categories.map((category) => (
            <option key={category.categoryId} value={category.categoryId}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <p className="text-xs text-slate-500">Tags</p>
        <div className="max-h-28 space-y-1 overflow-auto rounded-md border border-slate-200 p-2">
          {workspace.tags.map((tag) => (
            <label key={tag.tagId} className="flex items-center gap-2">
              <Checkbox
                checked={tagIds.includes(tag.tagId)}
                onChange={(event) =>
                  setTagIds((current) =>
                    event.target.checked
                      ? [...current, tag.tagId]
                      : current.filter((id) => id !== tag.tagId),
                  )
                }
              />
              {tag.name}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs text-slate-500">Notes</p>
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
      {manualChanges.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2">
          <p className="text-xs font-semibold text-amber-900">Manual edits</p>
          <div className="mt-1 space-y-2">
            {manualChanges.map((change) => (
              <div key={change.field} className="rounded border border-amber-100 bg-white/70 p-2">
                <p className="text-xs font-medium text-slate-700">{change.label}</p>
                <p className="text-xs text-slate-600">
                  {change.from} {'->'} {change.to}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1 h-7 px-2 text-xs"
                  disabled={revertingField !== null}
                  onClick={async () => {
                    setRevertingField(change.field)
                    try {
                      await workspace.revertTransactionEdits(transaction.transactionId, [change.field])
                    } finally {
                      setRevertingField(null)
                    }
                  }}
                >
                  Revert
                </Button>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2 h-8 w-full"
            disabled={revertingField !== null}
            onClick={async () => {
              setRevertingField('all')
              try {
                await workspace.revertTransactionEdits(transaction.transactionId, manualChanges.map((x) => x.field))
              } finally {
                setRevertingField(null)
              }
            }}
          >
            Revert all manual edits
          </Button>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={transaction.isExcludedFromAnalytics}
            onChange={(event) =>
              workspace.updateTransactionFlags(transaction.transactionId, {
                isExcludedFromAnalytics: event.target.checked,
              })
            }
          />
          Excluded
        </label>
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={transaction.isBusiness}
            onChange={(event) =>
              workspace.updateTransactionFlags(transaction.transactionId, {
                isBusiness: event.target.checked,
              })
            }
          />
          Business
        </label>
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={transaction.isReimbursable}
            onChange={(event) =>
              workspace.updateTransactionFlags(transaction.transactionId, {
                isReimbursable: event.target.checked,
              })
            }
          />
          Reimbursable
        </label>
      </div>
      <Button className="w-full" onClick={save}>
        Save overrides
      </Button>
    </div>
  )
}
