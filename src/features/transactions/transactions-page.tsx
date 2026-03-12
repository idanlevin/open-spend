import { useEffect, useMemo, useState } from 'react'
import { endOfMonth, format, parse } from 'date-fns'
import {
  type ColumnDef,
  type GroupingState,
  type RowSelectionState,
  flexRender,
  getCoreRowModel,
  getGroupedRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Download, FilterX, TableProperties } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useWorkspace } from '@/hooks/use-workspace'
import { useViewStore, type GroupByOption } from '@/stores/view-store'
import type { EnrichedTransaction } from '@/types/domain'
import { amountToCurrency } from '@/lib/utils'
import { applyTransactionFilters } from '@/lib/analytics/filtering'
import { exportTransactionsCsv, exportTransactionsXlsx } from '@/lib/export/exporters'

export function TransactionsPage() {
  const [searchParams] = useSearchParams()
  const workspace = useWorkspace()
  const { filters, setFilters, resetFilters } = useViewStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [grouping, setGrouping] = useState<GroupingState>([])
  const [bulkCategory, setBulkCategory] = useState('')

  const filteredRows = useMemo(
    () => applyTransactionFilters(workspace.transactions, filters),
    [workspace.transactions, filters],
  )

  const columns = useMemo<ColumnDef<EnrichedTransaction>[]>(
    () => [
      {
        id: 'select',
        header: 'Select',
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onChange={(event) => row.toggleSelected(Boolean(event.target.checked))}
          />
        ),
      },
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
        id: 'tags',
        header: 'Tags',
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

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: {
      rowSelection,
      grouping,
    },
    onGroupingChange: setGrouping,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getRowId: (row) => row.transactionId,
  })

  const selectedTransaction = useMemo(
    () => workspace.transactions.find((tx) => tx.transactionId === selectedId),
    [workspace.transactions, selectedId],
  )

  const selectedRows = table.getSelectedRowModel().rows
  const selectedCount = selectedRows.length

  const applyBulkCategory = async () => {
    if (!bulkCategory || selectedRows.length === 0) return
    await Promise.all(
      selectedRows.map((row) => workspace.updateCategoryOverride(row.original.transactionId, bulkCategory)),
    )
    setBulkCategory('')
    setRowSelection({})
  }

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
        patch.startDate = format(monthDate, 'yyyy-MM-01')
        patch.endDate = format(endOfMonth(monthDate), 'yyyy-MM-dd')
      }
    }
    if (startDateParam) patch.startDate = startDateParam
    if (endDateParam) patch.endDate = endDateParam
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

    resetFilters()
    setFilters(patch)
  }, [resetFilters, searchParams, setFilters, workspace.categories])

  return (
    <div>
      <PageHeader
        title="Transactions explorer"
        subtitle="Filter, group, edit, and export enriched transactions."
        icon={TableProperties}
        actions={
          <>
            <Button variant="secondary" onClick={() => exportTransactionsCsv(filteredRows)}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="secondary" onClick={() => exportTransactionsXlsx(filteredRows)}>
              <Download className="mr-2 h-4 w-4" />
              Export XLSX
            </Button>
          </>
        }
      />
      <div className="flex gap-4 p-6">
        <div className="w-[260px] shrink-0 space-y-3">
          <Card>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Current view controls</CardDescription>
            <div className="mt-3 space-y-2">
              <Input
                placeholder="Search merchant, note, reference..."
                value={filters.query}
                onChange={(event) => setFilters({ query: event.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={filters.startDate}
                  onChange={(event) => setFilters({ startDate: event.target.value })}
                />
                <Input
                  type="date"
                  value={filters.endDate}
                  onChange={(event) => setFilters({ endDate: event.target.value })}
                />
              </div>
              <Select
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
              <Select
                value={filters.categoryIds[0] || ''}
                onChange={(event) =>
                  setFilters({
                    categoryIds: event.target.value ? [event.target.value] : [],
                  })
                }
              >
                <option value="">All categories</option>
                {workspace.categories.map((category) => (
                  <option key={category.categoryId} value={category.categoryId}>
                    {category.name}
                  </option>
                ))}
              </Select>
              <Select
                value={filters.cardholders[0] || ''}
                onChange={(event) =>
                  setFilters({
                    cardholders: event.target.value ? [event.target.value] : [],
                  })
                }
              >
                <option value="">All cardholders</option>
                {workspace.cardholderOptions.map((cardholder) => (
                  <option key={cardholder} value={cardholder}>
                    {cardholder}
                  </option>
                ))}
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  placeholder="Min"
                  value={filters.minAmount ?? ''}
                  onChange={(event) =>
                    setFilters({
                      minAmount: event.target.value ? Number(event.target.value) : undefined,
                    })
                  }
                />
                <Input
                  type="number"
                  placeholder="Max"
                  value={filters.maxAmount ?? ''}
                  onChange={(event) =>
                    setFilters({
                      maxAmount: event.target.value ? Number(event.target.value) : undefined,
                    })
                  }
                />
              </div>
              <div className="space-y-1 text-sm">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={filters.uncategorizedOnly}
                    onChange={(event) => setFilters({ uncategorizedOnly: event.target.checked })}
                  />
                  Uncategorized only
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={filters.excludedOnly}
                    onChange={(event) => setFilters({ excludedOnly: event.target.checked })}
                  />
                  Excluded only
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={filters.refundsOnly}
                    onChange={(event) =>
                      setFilters({ refundsOnly: event.target.checked, paymentsOnly: false })
                    }
                  />
                  Refunds only
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={filters.paymentsOnly}
                    onChange={(event) =>
                      setFilters({ paymentsOnly: event.target.checked, refundsOnly: false })
                    }
                  />
                  Payments only
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={filters.businessOnly}
                    onChange={(event) => setFilters({ businessOnly: event.target.checked })}
                  />
                  Business only
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={filters.reimbursableOnly}
                    onChange={(event) => setFilters({ reimbursableOnly: event.target.checked })}
                  />
                  Reimbursable only
                </label>
              </div>
              <Button variant="ghost" className="w-full" onClick={resetFilters}>
                <FilterX className="mr-2 h-4 w-4" />
                Reset filters
              </Button>
            </div>
          </Card>
          <Card>
            <CardTitle>Bulk actions</CardTitle>
            <CardDescription>{selectedCount} selected</CardDescription>
            <div className="mt-3 space-y-2">
              <Select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)}>
                <option value="">Set category...</option>
                {workspace.categories.map((category) => (
                  <option key={category.categoryId} value={category.categoryId}>
                    {category.name}
                  </option>
                ))}
              </Select>
              <Button className="w-full" onClick={applyBulkCategory} disabled={!bulkCategory || selectedCount === 0}>
                Apply category to selected
              </Button>
            </div>
          </Card>
        </div>
        <Card className="min-w-0 flex-1 overflow-hidden p-0">
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-linear-to-r from-violet-100/80 to-sky-100/80">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} className="border-b border-slate-200 px-2 py-2 text-left">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                    onClick={() => setSelectedId(row.original.transactionId)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-2 py-1.5 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="w-[320px] shrink-0">
          <CardTitle>Details</CardTitle>
          <CardDescription>
            {selectedTransaction ? selectedTransaction.merchantFinal : 'Select a transaction'}
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

  const save = async () => {
    await workspace.updateTransactionFlags(transaction.transactionId, {
      notes,
      merchantOverride,
    })
    await workspace.updateCategoryOverride(transaction.transactionId, categoryId)
    await workspace.updateTags(transaction.transactionId, tagIds)
  }

  return (
    <div className="mt-3 space-y-2 text-sm">
      <div>
        <p className="text-xs text-slate-500">Amount</p>
        <p className="text-base font-semibold">{amountToCurrency(transaction.amount)}</p>
      </div>
      <div>
        <p className="text-xs text-slate-500">Merchant</p>
        <Input value={merchantOverride} onChange={(event) => setMerchantOverride(event.target.value)} />
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
