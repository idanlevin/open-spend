import { useEffect, useMemo, useRef, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { format, parseISO } from 'date-fns'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Store } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { AdvancedDataTable } from '@/components/ui/advanced-data-table'
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

function formatIsoDate(value: string): string {
  if (!value) return '—'
  try {
    return format(parseISO(value), 'MMM d, yyyy')
  } catch {
    return value
  }
}

interface MerchantRow {
  merchant: string
  transactionCount: number
  totalAmount: number
  averageAmount: number
  firstSeen: string
  lastSeen: string
  rawAliases: string[]
  aliasesPreview: string
  aliasCount: number
  topCategory: string
  categories: string[]
  cardHolders: string[]
  cardHoldersPreview: string
  latestDescription: string
}

type TransactionKindFilter = 'charges' | 'chargesAndRefunds' | 'paymentsOnly' | 'all'
type AliasFilter = 'all' | 'multiAlias' | 'singleAlias'

export function MerchantsPage() {
  const navigate = useNavigate()
  const workspace = useWorkspace()
  const scopedTransactions = useScopedTransactions(workspace.transactions, workspace.statements)
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const queryInputRef = useRef<HTMLInputElement | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [cardHolderFilter, setCardHolderFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState<TransactionKindFilter>('charges')
  const [aliasFilter, setAliasFilter] = useState<AliasFilter>('all')
  const [minTransactions, setMinTransactions] = useState('')
  const [minTotalAmount, setMinTotalAmount] = useState('')
  const [selectedMerchant, setSelectedMerchant] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [recurringCategoryOverride, setRecurringCategoryOverride] = useState('')

  const transactionsInScope = useMemo(() => {
    return scopedTransactions.filter((transaction) => {
      if (kindFilter === 'all') return true
      if (kindFilter === 'paymentsOnly') return transaction.isPayment
      if (kindFilter === 'charges') return transaction.transactionKind === 'charge'
      return transaction.transactionKind === 'charge' || transaction.transactionKind === 'refund'
    })
  }, [kindFilter, scopedTransactions])

  const merchantRows = useMemo<MerchantRow[]>(() => {
    const map = new Map<
      string,
      {
        totalAmount: number
        transactionCount: number
        firstSeen: string
        lastSeen: string
        rawAliases: Set<string>
        categoryTotals: Map<string, number>
        cardHolders: Set<string>
        latestDescription: string
        latestDate: string
      }
    >()

    transactionsInScope.forEach((transaction) => {
      const entry = map.get(transaction.merchantFinal) ?? {
        totalAmount: 0,
        transactionCount: 0,
        firstSeen: transaction.transactionDate,
        lastSeen: transaction.transactionDate,
        rawAliases: new Set<string>(),
        categoryTotals: new Map<string, number>(),
        cardHolders: new Set<string>(),
        latestDescription: transaction.descriptionRaw,
        latestDate: transaction.transactionDate,
      }

      entry.totalAmount += transaction.amount
      entry.transactionCount += 1
      if (transaction.transactionDate < entry.firstSeen) entry.firstSeen = transaction.transactionDate
      if (transaction.transactionDate > entry.lastSeen) entry.lastSeen = transaction.transactionDate
      entry.rawAliases.add(transaction.merchantRaw)
      if (transaction.cardMember) entry.cardHolders.add(transaction.cardMember)
      if (transaction.transactionDate >= entry.latestDate) {
        entry.latestDate = transaction.transactionDate
        entry.latestDescription = transaction.descriptionRaw
      }

      const categoryName = transaction.categoryFinalName || 'Uncategorized'
      entry.categoryTotals.set(
        categoryName,
        (entry.categoryTotals.get(categoryName) ?? 0) + Math.abs(transaction.amount),
      )
      map.set(transaction.merchantFinal, entry)
    })

    return [...map.entries()]
      .map(([merchant, value]) => {
        const rawAliases = [...value.rawAliases].sort((left, right) =>
          left.localeCompare(right, undefined, { sensitivity: 'base' }),
        )
        const categories = [...value.categoryTotals.entries()]
          .sort((left, right) => right[1] - left[1])
          .map(([category]) => category)
        const cardHolders = [...value.cardHolders].sort((left, right) =>
          left.localeCompare(right, undefined, { sensitivity: 'base' }),
        )
        const aliasesPreview =
          rawAliases.length > 3
            ? `${rawAliases.slice(0, 3).join(', ')} +${rawAliases.length - 3} more`
            : rawAliases.join(', ')
        const cardHoldersPreview =
          cardHolders.length > 2
            ? `${cardHolders.slice(0, 2).join(', ')} +${cardHolders.length - 2} more`
            : cardHolders.join(', ')
        return {
          merchant,
          transactionCount: value.transactionCount,
          totalAmount: value.totalAmount,
          averageAmount: value.transactionCount ? value.totalAmount / value.transactionCount : 0,
          firstSeen: value.firstSeen,
          lastSeen: value.lastSeen,
          rawAliases,
          aliasesPreview: aliasesPreview || '—',
          aliasCount: rawAliases.length,
          topCategory: categories[0] ?? 'Uncategorized',
          categories,
          cardHolders,
          cardHoldersPreview: cardHoldersPreview || '—',
          latestDescription: value.latestDescription,
        }
      })
      .sort((left, right) => Math.abs(right.totalAmount) - Math.abs(left.totalAmount))
  }, [transactionsInScope])

  const categories = useMemo(
    () => ['all', ...new Set(merchantRows.map((row) => row.topCategory).filter(Boolean))],
    [merchantRows],
  )
  const cardHolders = useMemo(
    () => ['all', ...new Set(merchantRows.flatMap((row) => row.cardHolders).filter(Boolean))],
    [merchantRows],
  )

  const filteredRows = useMemo(() => {
    const queryValue = query.trim().toLowerCase()
    const minTransactionsValue = Number(minTransactions)
    const minTotalAmountValue = Number(minTotalAmount)
    return merchantRows.filter((row) => {
      if (queryValue) {
        const matchesQuery =
          row.merchant.toLowerCase().includes(queryValue) ||
          row.topCategory.toLowerCase().includes(queryValue) ||
          row.latestDescription.toLowerCase().includes(queryValue) ||
          row.rawAliases.some((alias) => alias.toLowerCase().includes(queryValue))
        if (!matchesQuery) return false
      }
      if (categoryFilter !== 'all' && row.topCategory !== categoryFilter) return false
      if (cardHolderFilter !== 'all' && !row.cardHolders.includes(cardHolderFilter)) return false
      if (aliasFilter === 'multiAlias' && row.aliasCount < 2) return false
      if (aliasFilter === 'singleAlias' && row.aliasCount !== 1) return false
      if (
        Number.isFinite(minTransactionsValue) &&
        minTransactions.trim() &&
        row.transactionCount < minTransactionsValue
      ) {
        return false
      }
      if (
        Number.isFinite(minTotalAmountValue) &&
        minTotalAmount.trim() &&
        Math.abs(row.totalAmount) < minTotalAmountValue
      ) {
        return false
      }
      return true
    })
  }, [aliasFilter, cardHolderFilter, categoryFilter, merchantRows, minTotalAmount, minTransactions, query])

  const summary = useMemo(() => {
    const transactionCount = filteredRows.reduce((sum, row) => sum + row.transactionCount, 0)
    const totalAmount = filteredRows.reduce((sum, row) => sum + row.totalAmount, 0)
    const multiAliasCount = filteredRows.filter((row) => row.aliasCount > 1).length
    const topMerchant = [...filteredRows].sort(
      (left, right) => Math.abs(right.totalAmount) - Math.abs(left.totalAmount),
    )[0]
    return {
      merchantCount: filteredRows.length,
      transactionCount,
      totalAmount,
      multiAliasCount,
      topMerchantName: topMerchant?.merchant ?? '—',
      topMerchantAmount: topMerchant?.totalAmount ?? 0,
    }
  }, [filteredRows])

  const selectedMerchantFromQuery = searchParams.get('merchant')
  const selectedMerchantResolved = useMemo(() => {
    const matchedFromQuery = selectedMerchantFromQuery
      ? filteredRows.find((row) => row.merchant.toLowerCase() === selectedMerchantFromQuery.toLowerCase())?.merchant
      : undefined
    if (matchedFromQuery) return matchedFromQuery
    const matchedFromState = selectedMerchant
      ? filteredRows.find((row) => row.merchant === selectedMerchant)?.merchant
      : undefined
    if (matchedFromState) return matchedFromState
    return filteredRows[0]?.merchant ?? ''
  }, [filteredRows, selectedMerchant, selectedMerchantFromQuery])
  const active = filteredRows.find((row) => row.merchant === selectedMerchantResolved) ?? null

  useEffect(() => {
    setSelectedMerchant(active?.merchant ?? null)
  }, [active?.merchant])

  const renameValue = renameTo.trim()
  const activeRecurringCategoryOverride = active
    ? workspace.recurringCategoryOverrides[merchantKey(active.merchant)] ?? ''
    : ''

  useEffect(() => {
    setRecurringCategoryOverride(activeRecurringCategoryOverride)
  }, [activeRecurringCategoryOverride])

  useEffect(() => {
    setRenameTo(active?.merchant ?? '')
  }, [active?.merchant])

  const activeTransactions = useMemo(() => {
    if (!active) return []
    return transactionsInScope
      .filter((transaction) => transaction.merchantFinal === active.merchant)
      .sort((left, right) => right.transactionDate.localeCompare(left.transactionDate))
  }, [active, transactionsInScope])

  const merchantColumns = useMemo<ColumnDef<MerchantRow, unknown>[]>(
    () => [
      {
        accessorKey: 'merchant',
        header: 'Merchant',
        cell: ({ row }) => (
          <button
            type="button"
            className="cursor-pointer text-left font-medium text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              navigate(`/transactions?merchant=${encodeURIComponent(row.original.merchant)}`)
            }}
          >
            {row.original.merchant}
          </button>
        ),
      },
      {
        accessorKey: 'topCategory',
        header: 'Category',
      },
      {
        accessorKey: 'aliasesPreview',
        header: 'Aliases',
      },
      {
        accessorKey: 'aliasCount',
        header: 'Alias count',
      },
      {
        accessorKey: 'cardHoldersPreview',
        header: 'Cardholders',
      },
      {
        accessorKey: 'transactionCount',
        header: 'Transactions',
      },
      {
        accessorKey: 'averageAmount',
        header: 'Avg amount',
        cell: ({ row }) => amountToCurrency(row.original.averageAmount),
      },
      {
        accessorKey: 'totalAmount',
        header: 'Total',
        cell: ({ row }) => <span className="font-semibold">{amountToCurrency(row.original.totalAmount)}</span>,
      },
      {
        accessorKey: 'firstSeen',
        header: 'First seen',
        cell: ({ row }) => formatIsoDate(row.original.firstSeen),
      },
      {
        accessorKey: 'lastSeen',
        header: 'Last seen',
        cell: ({ row }) => formatIsoDate(row.original.lastSeen),
      },
    ],
    [navigate],
  )

  const setMerchantInUrl = (merchant: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('merchant', merchant)
      return next
    })
  }

  const applySearchQuery = () => {
    const nextQuery = queryInputRef.current?.value ?? ''
    if (nextQuery === query) return
    setQuery(nextQuery)
  }

  return (
    <div>
      <PageHeader
        title="Merchants"
        subtitle="Normalize merchant identities and review merchant-level spend."
        icon={Store}
      />
      <div className="space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Card>
            <CardDescription>Merchants in scope</CardDescription>
            <CardTitle className="mt-1 text-xl">{summary.merchantCount}</CardTitle>
          </Card>
          <Card>
            <CardDescription>Transactions in scope</CardDescription>
            <CardTitle className="mt-1 text-xl">{summary.transactionCount}</CardTitle>
          </Card>
          <Card>
            <CardDescription>Total amount</CardDescription>
            <CardTitle className="mt-1 text-xl">{amountToCurrency(summary.totalAmount)}</CardTitle>
          </Card>
          <Card>
            <CardDescription>Merchants with aliases</CardDescription>
            <CardTitle className="mt-1 text-xl">{summary.multiAliasCount}</CardTitle>
          </Card>
          <Card>
            <CardDescription>Largest merchant</CardDescription>
            <CardTitle className="mt-1 truncate text-xl">{summary.topMerchantName}</CardTitle>
            <CardDescription className="text-xs">{amountToCurrency(summary.topMerchantAmount)}</CardDescription>
          </Card>
        </div>
        <Card>
          <CardTitle>Merchant filters</CardTitle>
          <CardDescription>Search and narrow by category, cardholder, transaction kind, alias profile, and spend.</CardDescription>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex gap-2 sm:col-span-2">
              <Input
                ref={queryInputRef}
                placeholder="Search merchant, alias, category..."
                defaultValue={query}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  applySearchQuery()
                }}
              />
              <Button type="button" onClick={applySearchQuery}>
                Search
              </Button>
            </div>
            <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category === 'all' ? 'All categories' : category}
                </option>
              ))}
            </Select>
            <Select value={cardHolderFilter} onChange={(event) => setCardHolderFilter(event.target.value)}>
              {cardHolders.map((cardHolder) => (
                <option key={cardHolder} value={cardHolder}>
                  {cardHolder === 'all' ? 'All cardholders' : cardHolder}
                </option>
              ))}
            </Select>
            <Select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as TransactionKindFilter)}>
              <option value="charges">Charges only</option>
              <option value="chargesAndRefunds">Charges + refunds</option>
              <option value="paymentsOnly">Payments only</option>
              <option value="all">All transaction kinds</option>
            </Select>
            <Select value={aliasFilter} onChange={(event) => setAliasFilter(event.target.value as AliasFilter)}>
              <option value="all">All alias profiles</option>
              <option value="multiAlias">Multiple aliases only</option>
              <option value="singleAlias">Single alias only</option>
            </Select>
            <Input
              placeholder="Min transactions"
              value={minTransactions}
              onChange={(event) => setMinTransactions(event.target.value)}
            />
            <Input
              placeholder="Min absolute total amount"
              value={minTotalAmount}
              onChange={(event) => setMinTotalAmount(event.target.value)}
            />
          </div>
        </Card>
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
          <Card className="min-w-0">
            <CardTitle>Merchant directory</CardTitle>
            <CardDescription>
              Smart table with sortable spend totals, aliases, categories, and first/last seen transaction dates.
            </CardDescription>
            <div className="mt-3 min-w-0">
              <AdvancedDataTable
                tableId="merchants-directory"
                data={filteredRows}
                columns={merchantColumns}
                getRowId={(row) => row.merchant}
                defaultSorting={[{ id: 'totalAmount', desc: true }]}
                onRowClick={(row) => {
                  setSelectedMerchant(row.merchant)
                  setMerchantInUrl(row.merchant)
                }}
                isRowActive={(row) => row.merchant === active?.merchant}
                activeRowClassName="bg-sky-50/80"
                emptyMessage="No merchants match these filters."
              />
            </div>
          </Card>
          <Card className="min-w-0">
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
                      {active.transactionCount}
                      <ArrowRight className="h-4 w-4 text-violet-500" />
                    </p>
                  </button>
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-slate-500">Total amount</p>
                    <p className="text-lg font-semibold">{amountToCurrency(active.totalAmount)}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-slate-500">Avg transaction</p>
                    <p className="text-lg font-semibold">{amountToCurrency(active.averageAmount)}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-slate-500">Primary category</p>
                    <p className="text-lg font-semibold">{active.topCategory}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-slate-500">First seen</p>
                    <p className="font-semibold">{formatIsoDate(active.firstSeen)}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <p className="text-slate-500">Last seen</p>
                    <p className="font-semibold">{formatIsoDate(active.lastSeen)}</p>
                  </div>
                </div>
                <div>
                  <p className="text-slate-500">Raw aliases</p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-slate-600">
                    {active.rawAliases.slice(0, 20).map((alias) => (
                      <li key={alias}>{alias}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-slate-500">Cardholders</p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-slate-600">
                    {active.cardHolders.map((cardHolder) => (
                      <li key={cardHolder}>{cardHolder}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-slate-500">Rename normalized merchant</p>
                  <div className="flex gap-2">
                    <Input value={renameTo} onChange={(event) => setRenameTo(event.target.value)} />
                    <Button
                      onClick={async () => {
                        if (!active || !renameValue) return
                        await workspace.renameMerchant(active.merchant, renameValue)
                        setSelectedMerchant(renameValue)
                        setMerchantInUrl(renameValue)
                      }}
                      disabled={!renameValue || renameValue === active.merchant}
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
                <div>
                  <CardDescription>Recent transactions</CardDescription>
                  <div className="mt-1 max-h-72 space-y-1 overflow-auto">
                    {activeTransactions.slice(0, 20).map((transaction) => (
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
                <Button className="w-full" onClick={() => navigate(`/transactions?merchant=${encodeURIComponent(active.merchant)}`)}>
                  Open in transactions
                </Button>
              </div>
            ) : (
              <CardDescription className="mt-3">No merchant data yet.</CardDescription>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
