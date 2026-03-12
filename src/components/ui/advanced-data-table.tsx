import { useEffect, useMemo, useRef, useState, type UIEvent } from 'react'
import {
  type ColumnSizingState,
  type ColumnDef,
  type ColumnFiltersState,
  type GroupingState,
  type OnChangeFn,
  type Row,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, RotateCcw, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

const TABLE_VIEW_STORAGE_PREFIX = 'open-spend.table-view.'
const DEFAULT_PAGE_SIZE = 150
const SELECTION_COLUMN_ID = '__select'
const EMPTY_GROUPING: GroupingState = []

interface PersistedTableView {
  sorting: SortingState
  columnFilters: ColumnFiltersState
  columnVisibility: VisibilityState
  columnOrder: string[]
  columnSizing: ColumnSizingState
  globalFilter: string
}

interface AdvancedDataTableProps<TData extends object> {
  tableId: string
  data: TData[]
  columns: ColumnDef<TData, unknown>[]
  getRowId?: (originalRow: TData, index: number, parent?: Row<TData>) => string
  onRowClick?: (row: TData) => void
  isRowActive?: (row: TData) => boolean
  emptyMessage?: string
  className?: string
  pageSize?: number
  defaultSorting?: SortingState
  enableRowSelection?: boolean
  onSelectedRowsChange?: (rows: TData[]) => void
  selectionResetToken?: number
  grouping?: GroupingState
  onGroupingChange?: OnChangeFn<GroupingState>
  enableGrouping?: boolean
}

function getStorageKey(tableId: string): string {
  return `${TABLE_VIEW_STORAGE_PREFIX}${tableId}`
}

function collectColumnIds<TData extends object>(columns: ColumnDef<TData, unknown>[]): string[] {
  const ids: string[] = []

  const walk = (defs: ColumnDef<TData, unknown>[]) => {
    defs.forEach((def) => {
      if ('columns' in def && Array.isArray(def.columns)) {
        walk(def.columns)
        return
      }
      if (typeof def.id === 'string') {
        ids.push(def.id)
        return
      }
      if ('accessorKey' in def && typeof def.accessorKey === 'string') {
        ids.push(def.accessorKey)
      }
    })
  }

  walk(columns)
  return Array.from(new Set(ids))
}

function normalizePersistedView(
  raw: unknown,
  knownColumnIds: string[],
  fallback: PersistedTableView,
): PersistedTableView {
  if (!raw || typeof raw !== 'object') return fallback

  const candidate = raw as Partial<PersistedTableView>
  const sorting = Array.isArray(candidate.sorting)
    ? candidate.sorting.filter(
      (entry): entry is SortingState[number] =>
        Boolean(entry) &&
          typeof entry.id === 'string' &&
          knownColumnIds.includes(entry.id) &&
          typeof entry.desc === 'boolean',
    )
    : fallback.sorting

  const columnFilters = Array.isArray(candidate.columnFilters)
    ? candidate.columnFilters.filter(
      (entry): entry is ColumnFiltersState[number] =>
        Boolean(entry) &&
          typeof entry === 'object' &&
          typeof entry.id === 'string' &&
          knownColumnIds.includes(entry.id) &&
          'value' in entry,
    )
    : fallback.columnFilters

  const columnVisibilityEntries =
    candidate.columnVisibility && typeof candidate.columnVisibility === 'object'
      ? Object.entries(candidate.columnVisibility).filter(
        ([id, value]) => knownColumnIds.includes(id) && typeof value === 'boolean',
      )
      : []
  const columnVisibility: VisibilityState =
    columnVisibilityEntries.length > 0
      ? Object.fromEntries(columnVisibilityEntries)
      : fallback.columnVisibility

  const normalizedOrderCandidate = Array.isArray(candidate.columnOrder)
    ? candidate.columnOrder.filter((id): id is string => typeof id === 'string' && knownColumnIds.includes(id))
    : []
  const missingIds = knownColumnIds.filter((id) => !normalizedOrderCandidate.includes(id))
  const columnOrder =
    normalizedOrderCandidate.length > 0
      ? [...normalizedOrderCandidate, ...missingIds]
      : fallback.columnOrder

  const columnSizingEntries =
    candidate.columnSizing && typeof candidate.columnSizing === 'object'
      ? Object.entries(candidate.columnSizing).filter(
        ([id, value]) => knownColumnIds.includes(id) && typeof value === 'number' && Number.isFinite(value) && value > 0,
      )
      : []
  const columnSizing: ColumnSizingState =
    columnSizingEntries.length > 0
      ? Object.fromEntries(columnSizingEntries)
      : fallback.columnSizing

  const globalFilter = typeof candidate.globalFilter === 'string' ? candidate.globalFilter : fallback.globalFilter

  return {
    sorting,
    columnFilters,
    columnVisibility,
    columnOrder,
    columnSizing,
    globalFilter,
  }
}

function clonePersistedView(view: PersistedTableView): PersistedTableView {
  return {
    sorting: [...view.sorting],
    columnFilters: [...view.columnFilters],
    columnVisibility: { ...view.columnVisibility },
    columnOrder: [...view.columnOrder],
    columnSizing: { ...view.columnSizing },
    globalFilter: view.globalFilter,
  }
}

function createViewSignature(view: PersistedTableView): string {
  return JSON.stringify(view)
}

function textContainsFilterValue(value: unknown, search: string): boolean {
  return String(value ?? '')
    .toLowerCase()
    .includes(search.toLowerCase())
}

function columnLabel(column: { id: string; columnDef: { header?: unknown } }): string {
  if (typeof column.columnDef.header === 'string') return column.columnDef.header
  return column.id
}

type AccessorMap<TData extends object> = Record<string, (row: TData) => unknown>

function buildAccessorMap<TData extends object>(
  definitions: ColumnDef<TData, unknown>[],
): AccessorMap<TData> {
  const accessors: AccessorMap<TData> = {}

  const walk = (defs: ColumnDef<TData, unknown>[]) => {
    defs.forEach((def) => {
      if ('columns' in def && Array.isArray(def.columns)) {
        walk(def.columns)
        return
      }

      const accessorId =
        typeof def.id === 'string'
          ? def.id
          : 'accessorKey' in def && typeof def.accessorKey === 'string'
            ? def.accessorKey
            : undefined
      if (!accessorId || accessorId === SELECTION_COLUMN_ID) return

      if ('accessorFn' in def && typeof def.accessorFn === 'function') {
        accessors[accessorId] = (row) => def.accessorFn(row, 0)
        return
      }
      if ('accessorKey' in def && typeof def.accessorKey === 'string') {
        const key = def.accessorKey
        accessors[accessorId] = (row) => (row as Record<string, unknown>)[key]
      }
    })
  }

  walk(definitions)
  return accessors
}

function compareUnknownValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1

  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()

  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

export function AdvancedDataTable<TData extends object>({
  tableId,
  data,
  columns,
  getRowId,
  onRowClick,
  isRowActive,
  emptyMessage = 'No rows to display.',
  className,
  pageSize = DEFAULT_PAGE_SIZE,
  defaultSorting = [],
  enableRowSelection = false,
  onSelectedRowsChange,
  selectionResetToken,
  grouping,
  onGroupingChange,
  enableGrouping = false,
}: AdvancedDataTableProps<TData>) {
  const selectionColumn = useMemo<ColumnDef<TData, unknown>>(
    () => ({
      id: SELECTION_COLUMN_ID,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onChange={(event) => table.toggleAllPageRowsSelected(event.target.checked)}
          aria-label="Select all visible rows"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onChange={(event) => row.toggleSelected(event.target.checked)}
          onClick={(event) => event.stopPropagation()}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableColumnFilter: false,
      enableHiding: false,
      enableResizing: false,
      size: 42,
      minSize: 42,
      maxSize: 42,
    }),
    [],
  )

  const effectiveColumns = useMemo(
    () => (enableRowSelection ? [selectionColumn, ...columns] : columns),
    [columns, enableRowSelection, selectionColumn],
  )
  const defaultColumnOrder = useMemo(() => collectColumnIds(effectiveColumns), [effectiveColumns])

  const defaultView = useMemo<PersistedTableView>(
    () => ({
      sorting: [...defaultSorting],
      columnFilters: [],
      columnVisibility: {},
      columnOrder: [...defaultColumnOrder],
      columnSizing: {},
      globalFilter: '',
    }),
    [defaultColumnOrder, defaultSorting],
  )

  const initialView = useMemo(() => {
    if (typeof window === 'undefined') return defaultView
    const raw = window.localStorage.getItem(getStorageKey(tableId))
    if (!raw) return defaultView
    try {
      return normalizePersistedView(JSON.parse(raw), defaultColumnOrder, defaultView)
    } catch {
      return defaultView
    }
  }, [defaultColumnOrder, defaultView, tableId])

  const [sorting, setSorting] = useState<SortingState>(() => initialView.sorting)
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() => initialView.columnFilters)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => initialView.columnVisibility)
  const [columnOrder, setColumnOrder] = useState<string[]>(() => initialView.columnOrder)
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => initialView.columnSizing)
  const [globalFilter, setGlobalFilter] = useState<string>(() => initialView.globalFilter)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const [showSettings, setShowSettings] = useState(false)
  const [viewFeedback, setViewFeedback] = useState<string>('')
  const [savedSignature, setSavedSignature] = useState<string>(() =>
    createViewSignature(clonePersistedView(initialView)),
  )
  const normalizedGlobalFilter = globalFilter.trim()
  const effectiveGrouping = grouping ?? EMPTY_GROUPING
  const useManualDataPipeline = !enableGrouping
  const shouldApplyFiltering = normalizedGlobalFilter.length > 0 || columnFilters.length > 0
  const accessorMap = useMemo(() => buildAccessorMap(effectiveColumns), [effectiveColumns])
  const manuallyProcessedData = useMemo(() => {
    if (!useManualDataPipeline) return data

    let output = data
    const accessorEntries = Object.entries(accessorMap)
    const activeColumnFilters = columnFilters.filter((filter) => {
      const value = String(filter.value ?? '').trim()
      return value.length > 0
    })

    if (normalizedGlobalFilter.length > 0 && accessorEntries.length > 0) {
      output = output.filter((row) =>
        accessorEntries.some(([, read]) => textContainsFilterValue(read(row), normalizedGlobalFilter)),
      )
    }

    if (activeColumnFilters.length > 0) {
      output = output.filter((row) =>
        activeColumnFilters.every((filter) => {
          const read = accessorMap[filter.id]
          if (!read) return true
          return textContainsFilterValue(read(row), String(filter.value ?? ''))
        }),
      )
    }

    if (sorting.length > 0) {
      output = [...output].sort((left, right) => {
        for (const sortEntry of sorting) {
          const read = accessorMap[sortEntry.id]
          if (!read) continue
          const comparison = compareUnknownValues(read(left), read(right))
          if (comparison !== 0) return sortEntry.desc ? -comparison : comparison
        }
        return 0
      })
    }

    return output
  }, [accessorMap, columnFilters, data, normalizedGlobalFilter, sorting, useManualDataPipeline])
  const tableData = useMemo(
    () => (useManualDataPipeline ? manuallyProcessedData.slice(0, visibleCount) : data),
    [data, manuallyProcessedData, useManualDataPipeline, visibleCount],
  )

  const currentView = useMemo<PersistedTableView>(
    () => ({
      sorting,
      columnFilters,
      columnVisibility,
      columnOrder,
      columnSizing,
      globalFilter,
    }),
    [columnFilters, columnOrder, columnSizing, columnVisibility, globalFilter, sorting],
  )
  const currentSignature = useMemo(() => createViewSignature(currentView), [currentView])
  const hasUnsavedChanges = currentSignature !== savedSignature

  useEffect(() => {
    if (!viewFeedback) return
    const timeoutId = window.setTimeout(() => setViewFeedback(''), 1800)
    return () => window.clearTimeout(timeoutId)
  }, [viewFeedback])

  useEffect(() => {
    setRowSelection({})
  }, [selectionResetToken])

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: tableData,
    columns: effectiveColumns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnOrder,
      columnSizing,
      globalFilter: normalizedGlobalFilter.length > 0 ? normalizedGlobalFilter : undefined,
      rowSelection,
      grouping: enableGrouping ? effectiveGrouping : EMPTY_GROUPING,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onGroupingChange: enableGrouping ? onGroupingChange : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: useManualDataPipeline ? undefined : getSortedRowModel(),
    getFilteredRowModel:
      useManualDataPipeline || !shouldApplyFiltering ? undefined : getFilteredRowModel(),
    getGroupedRowModel: enableGrouping ? getGroupedRowModel() : undefined,
    getRowId,
    enableRowSelection,
    manualSorting: useManualDataPipeline,
    manualFiltering: useManualDataPipeline || !shouldApplyFiltering,
    manualGrouping: !enableGrouping,
    enableColumnResizing: true,
    columnResizeMode: 'onEnd',
    defaultColumn: {
      size: 180,
      minSize: 80,
      maxSize: 700,
      filterFn: (row, columnId, filterValue) =>
        textContainsFilterValue(row.getValue(columnId), String(filterValue ?? '')),
    },
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = String(filterValue ?? '').trim().toLowerCase()
      if (!search) return true
      return row.getAllCells().some((cell) => textContainsFilterValue(cell.getValue(), search))
    },
  })

  useEffect(() => {
    if (!onSelectedRowsChange) return
    const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original)
    onSelectedRowsChange(selectedRows)
  }, [onSelectedRowsChange, rowSelection, table])

  const tableRows = table.getRowModel().rows
  const fullRowCount = useManualDataPipeline ? manuallyProcessedData.length : tableRows.length
  const visibleRows = useMemo(
    () => (useManualDataPipeline ? tableRows : tableRows.slice(0, visibleCount)),
    [tableRows, useManualDataPipeline, visibleCount],
  )
  const hasMoreRows = visibleRows.length < fullRowCount
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setVisibleCount(pageSize)
  }, [columnFilters, columnOrder, columnVisibility, data.length, effectiveGrouping, pageSize, sorting, globalFilter])

  const handleTableScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!hasMoreRows) return
    const target = event.currentTarget
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight
    if (remaining > 220) return
    setVisibleCount((current) => Math.min(current + pageSize, fullRowCount))
  }

  const saveView = () => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(getStorageKey(tableId), currentSignature)
    setSavedSignature(currentSignature)
    setViewFeedback('View saved')
  }

  const resetView = () => {
    const next = clonePersistedView(defaultView)
    setSorting(next.sorting)
    setColumnFilters(next.columnFilters)
    setColumnVisibility(next.columnVisibility)
    setColumnOrder(next.columnOrder)
    setColumnSizing(next.columnSizing)
    setGlobalFilter(next.globalFilter)
    setRowSelection({})
    setVisibleCount(pageSize)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(getStorageKey(tableId))
    }
    setSavedSignature(createViewSignature(next))
    setViewFeedback('View reset to default')
  }

  const leafColumns = table.getAllLeafColumns()
  const filterableColumns = leafColumns.filter(
    (column) => column.getCanFilter() && column.id !== SELECTION_COLUMN_ID,
  )
  const reorderableColumns = leafColumns.filter((column) => column.id !== SELECTION_COLUMN_ID)

  const moveColumn = (columnId: string, direction: 'up' | 'down') => {
    setColumnOrder((current) => {
      const base = current.length > 0 ? [...current] : defaultColumnOrder
      const index = base.indexOf(columnId)
      if (index < 0) return base
      const swapIndex = direction === 'up' ? index - 1 : index + 1
      if (swapIndex < 0 || swapIndex >= base.length) return base
      const [moved] = base.splice(index, 1)
      base.splice(swapIndex, 0, moved)
      return base
    })
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="min-w-[260px] flex-1"
          placeholder="Search all columns..."
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
        />
        <Button type="button" variant="secondary" size="sm" onClick={() => setShowSettings((current) => !current)}>
          <Columns3 className="mr-2 h-4 w-4" />
          Columns & filters
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={saveView} disabled={!hasUnsavedChanges}>
          <Save className="mr-2 h-4 w-4" />
          Save view
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={resetView}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset view
        </Button>
      </div>

      {showSettings ? (
        <div className="grid gap-3 rounded-2xl border border-violet-100 bg-violet-50/40 p-3 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">Filter any column</p>
            {filterableColumns.length === 0 ? (
              <p className="text-sm text-slate-600">No filterable columns available.</p>
            ) : (
              filterableColumns.map((column) => (
                <label key={column.id} className="block">
                  <span className="mb-1 block text-xs text-slate-700">{columnLabel(column)}</span>
                  <Input
                    value={String(column.getFilterValue() ?? '')}
                    onChange={(event) => column.setFilterValue(event.target.value)}
                    placeholder={`Filter ${columnLabel(column)}`}
                  />
                </label>
              ))
            )}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">
              Reorder and show/hide columns
            </p>
            <div className="space-y-1">
              {reorderableColumns.map((column, index) => (
                <div
                  key={column.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-violet-100 bg-white/80 px-2 py-1.5"
                >
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={column.getIsVisible()}
                      disabled={!column.getCanHide()}
                      onChange={(event) => column.toggleVisibility(event.target.checked)}
                    />
                    <span>{columnLabel(column)}</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => moveColumn(column.id, 'up')}
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => moveColumn(column.id, 'down')}
                      disabled={index === reorderableColumns.length - 1}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-(--text-muted)">
          Loaded {visibleRows.length.toLocaleString()} / {fullRowCount.toLocaleString()} rows
        </p>
        {viewFeedback ? <p className="text-xs font-medium text-violet-700">{viewFeedback}</p> : null}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleTableScroll}
        className="max-h-[70vh] overflow-auto rounded-2xl border border-(--card-border)"
      >
        <table className="min-w-full border-collapse table-fixed text-sm" style={{ width: table.getTotalSize() }}>
          <thead className="sticky top-0 z-10 bg-linear-to-r from-violet-100/90 to-sky-100/90 backdrop-blur">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sortedState = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      className="relative border-b border-slate-200 px-2 py-2 text-left"
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <div className="group relative">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-left font-semibold text-slate-700 hover:text-violet-800"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sortedState === 'asc' ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : sortedState === 'desc' ? (
                              <ArrowDown className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
                            )}
                          </button>
                          {header.column.getCanResize() ? (
                            <div
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              onDoubleClick={() => header.column.resetSize()}
                              onClick={(event) => event.stopPropagation()}
                              className={cn(
                                'absolute top-[-8px] right-[-8px] h-[calc(100%+16px)] w-2 cursor-col-resize touch-none select-none',
                                header.column.getIsResizing() ? 'bg-violet-300/70' : 'group-hover:bg-violet-200/70',
                              )}
                            />
                          ) : null}
                        </div>
                      ) : (
                        <div className="group relative">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanResize() ? (
                            <div
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              onDoubleClick={() => header.column.resetSize()}
                              onClick={(event) => event.stopPropagation()}
                              className={cn(
                                'absolute top-[-8px] right-[-8px] h-[calc(100%+16px)] w-2 cursor-col-resize touch-none select-none',
                                header.column.getIsResizing() ? 'bg-violet-300/70' : 'group-hover:bg-violet-200/70',
                              )}
                            />
                          ) : null}
                        </div>
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-sm text-slate-500" colSpan={leafColumns.length || 1}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(
                    'border-b border-slate-100',
                    onRowClick ? 'cursor-pointer hover:bg-slate-50' : '',
                    isRowActive?.(row.original) ? 'bg-violet-50/70' : '',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-2 py-1.5 align-top" style={{ width: cell.column.getSize() }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        {hasMoreRows ? (
          <div className="border-t border-violet-100 bg-violet-50/60 px-3 py-2 text-center text-xs text-violet-700">
            Scroll to load more rows
          </div>
        ) : null}
      </div>
    </div>
  )
}
