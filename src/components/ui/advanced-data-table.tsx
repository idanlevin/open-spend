import { useEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from 'react'
import { format } from 'date-fns'
import {
  type ColumnSizingState,
  type ColumnDef,
  type GroupingState,
  type OnChangeFn,
  type Row,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getGroupedRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Filter, RotateCcw, Save, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

const TABLE_VIEW_STORAGE_PREFIX = 'open-spend.table-view.'
const DEFAULT_PAGE_SIZE = 150
const SELECTION_COLUMN_ID = '__select'
const EMPTY_GROUPING: GroupingState = []
const BLANK_VALUE_TOKEN = '__open_spend_blank__'

type FilterCondition =
  | 'none'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'isExactly'
  | 'dateIs'
  | 'dateBefore'
  | 'dateAfter'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'isEqualTo'
  | 'isNotEqualTo'
  | 'isBetween'
  | 'isNotBetween'

interface ExcelColumnFilter {
  condition: FilterCondition
  value: string
  secondValue: string
  selectedValues: string[] | null
}

type ExcelFiltersState = Record<string, ExcelColumnFilter>

interface PersistedTableView {
  sorting: SortingState
  columnVisibility: VisibilityState
  columnOrder: string[]
  columnSizing: ColumnSizingState
  globalFilter: string
  excelFilters: ExcelFiltersState
  filterModeEnabled: boolean
}

interface AdvancedDataTableProps<TData extends object> {
  tableId: string
  data: TData[]
  columns: ColumnDef<TData, unknown>[]
  getRowId?: (originalRow: TData, index: number, parent?: Row<TData>) => string
  onRowClick?: (row: TData) => void
  isRowActive?: (row: TData) => boolean
  activeRowClassName?: string
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
  toolbarActions?: ReactNode
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
  const excelFilters =
    candidate.excelFilters && typeof candidate.excelFilters === 'object'
      ? Object.fromEntries(
        Object.entries(candidate.excelFilters).flatMap(([id, value]) => {
          if (!knownColumnIds.includes(id)) return []
          if (!value || typeof value !== 'object') return []
          const next = value as Partial<ExcelColumnFilter>
          const condition = typeof next.condition === 'string' ? next.condition : 'none'
          const allowedConditions: FilterCondition[] = [
            'none',
            'isEmpty',
            'isNotEmpty',
            'contains',
            'notContains',
            'startsWith',
            'endsWith',
            'isExactly',
            'dateIs',
            'dateBefore',
            'dateAfter',
            'greaterThan',
            'greaterThanOrEqual',
            'lessThan',
            'lessThanOrEqual',
            'isEqualTo',
            'isNotEqualTo',
            'isBetween',
            'isNotBetween',
          ]
          if (!allowedConditions.includes(condition as FilterCondition)) return []
          const normalized: ExcelColumnFilter = {
            condition: condition as FilterCondition,
            value: typeof next.value === 'string' ? next.value : '',
            secondValue: typeof next.secondValue === 'string' ? next.secondValue : '',
            selectedValues:
              next.selectedValues == null
                ? null
                : Array.isArray(next.selectedValues)
                  ? next.selectedValues.filter((entry): entry is string => typeof entry === 'string')
                  : null,
          }
          return [[id, normalized]]
        }),
      )
      : fallback.excelFilters
  const filterModeEnabled =
    typeof candidate.filterModeEnabled === 'boolean' ? candidate.filterModeEnabled : fallback.filterModeEnabled

  return {
    sorting,
    columnVisibility,
    columnOrder,
    columnSizing,
    globalFilter,
    excelFilters,
    filterModeEnabled,
  }
}

function clonePersistedView(view: PersistedTableView): PersistedTableView {
  return {
    sorting: [...view.sorting],
    columnVisibility: { ...view.columnVisibility },
    columnOrder: [...view.columnOrder],
    columnSizing: { ...view.columnSizing },
    globalFilter: view.globalFilter,
    excelFilters: Object.fromEntries(
      Object.entries(view.excelFilters).map(([id, value]) => [
        id,
        {
          ...value,
          selectedValues: value.selectedValues ? [...value.selectedValues] : null,
        },
      ]),
    ),
    filterModeEnabled: view.filterModeEnabled,
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

function createDefaultExcelFilter(): ExcelColumnFilter {
  return {
    condition: 'none',
    value: '',
    secondValue: '',
    selectedValues: null,
  }
}

function cloneExcelFilter(filter: ExcelColumnFilter): ExcelColumnFilter {
  return {
    ...filter,
    selectedValues: filter.selectedValues ? [...filter.selectedValues] : null,
  }
}

function normalizeStringValue(value: unknown): string {
  return String(value ?? '').trim()
}

function tokenizeCellValue(value: unknown): string {
  const normalized = normalizeStringValue(value)
  return normalized ? normalized : BLANK_VALUE_TOKEN
}

function isEmptyValue(value: unknown): boolean {
  return normalizeStringValue(value).length === 0
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function parseDateValue(value: unknown): Date | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function compareFilterInputs(left: unknown, right: string): number {
  const leftNumeric = parseNumericValue(left)
  const rightNumeric = parseNumericValue(right)
  if (leftNumeric !== null && rightNumeric !== null) return leftNumeric - rightNumeric

  const leftDate = parseDateValue(left)
  const rightDate = parseDateValue(right)
  if (leftDate && rightDate) return leftDate.getTime() - rightDate.getTime()

  return String(left ?? '').localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
}

function rowMatchesCondition(value: unknown, filter: ExcelColumnFilter): boolean {
  const raw = String(value ?? '')
  const normalized = raw.trim()
  const source = normalized.toLowerCase()
  const search = filter.value.trim().toLowerCase()
  const second = filter.secondValue.trim()

  switch (filter.condition) {
    case 'none':
      return true
    case 'isEmpty':
      return isEmptyValue(value)
    case 'isNotEmpty':
      return !isEmptyValue(value)
    case 'contains':
      return search ? source.includes(search) : true
    case 'notContains':
      return search ? !source.includes(search) : true
    case 'startsWith':
      return search ? source.startsWith(search) : true
    case 'endsWith':
      return search ? source.endsWith(search) : true
    case 'isExactly':
      return search ? source === search : true
    case 'dateIs': {
      if (!search) return true
      const left = parseDateValue(normalized)
      const right = parseDateValue(search)
      if (!left || !right) return false
      return format(left, 'yyyy-MM-dd') === format(right, 'yyyy-MM-dd')
    }
    case 'dateBefore':
      return search ? compareFilterInputs(normalized, search) < 0 : true
    case 'dateAfter':
      return search ? compareFilterInputs(normalized, search) > 0 : true
    case 'greaterThan':
      return search ? compareFilterInputs(normalized, search) > 0 : true
    case 'greaterThanOrEqual':
      return search ? compareFilterInputs(normalized, search) >= 0 : true
    case 'lessThan':
      return search ? compareFilterInputs(normalized, search) < 0 : true
    case 'lessThanOrEqual':
      return search ? compareFilterInputs(normalized, search) <= 0 : true
    case 'isEqualTo':
      return search ? compareFilterInputs(normalized, search) === 0 : true
    case 'isNotEqualTo':
      return search ? compareFilterInputs(normalized, search) !== 0 : true
    case 'isBetween':
      if (!search || !second) return true
      return (
        compareFilterInputs(normalized, search) >= 0 &&
        compareFilterInputs(normalized, second) <= 0
      )
    case 'isNotBetween':
      if (!search || !second) return true
      return (
        compareFilterInputs(normalized, search) < 0 ||
        compareFilterInputs(normalized, second) > 0
      )
    default:
      return true
  }
}

function filterIsActive(filter: ExcelColumnFilter | undefined): boolean {
  if (!filter) return false
  return filter.condition !== 'none' || filter.selectedValues !== null
}

const FILTER_CONDITION_OPTIONS: Array<{ value: FilterCondition; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'isEmpty', label: 'Is empty' },
  { value: 'isNotEmpty', label: 'Is not empty' },
  { value: 'contains', label: 'Text contains' },
  { value: 'notContains', label: 'Text does not contain' },
  { value: 'startsWith', label: 'Text starts with' },
  { value: 'endsWith', label: 'Text ends with' },
  { value: 'isExactly', label: 'Text is exactly' },
  { value: 'dateIs', label: 'Date is' },
  { value: 'dateBefore', label: 'Date is before' },
  { value: 'dateAfter', label: 'Date is after' },
  { value: 'greaterThan', label: 'Greater than' },
  { value: 'greaterThanOrEqual', label: 'Greater than or equal to' },
  { value: 'lessThan', label: 'Less than' },
  { value: 'lessThanOrEqual', label: 'Less than or equal to' },
  { value: 'isEqualTo', label: 'Is equal to' },
  { value: 'isNotEqualTo', label: 'Is not equal to' },
  { value: 'isBetween', label: 'Is between' },
  { value: 'isNotBetween', label: 'Is not between' },
]

export function AdvancedDataTable<TData extends object>({
  tableId,
  data,
  columns,
  getRowId,
  onRowClick,
  isRowActive,
  activeRowClassName,
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
  toolbarActions,
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
      columnVisibility: {},
      columnOrder: [...defaultColumnOrder],
      columnSizing: {},
      globalFilter: '',
      excelFilters: {},
      filterModeEnabled: false,
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
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => initialView.columnVisibility)
  const [columnOrder, setColumnOrder] = useState<string[]>(() => initialView.columnOrder)
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => initialView.columnSizing)
  const [globalFilter, setGlobalFilter] = useState<string>(() => initialView.globalFilter)
  const [excelFilters, setExcelFilters] = useState<ExcelFiltersState>(() => initialView.excelFilters)
  const [filterModeEnabled, setFilterModeEnabled] = useState<boolean>(() => initialView.filterModeEnabled)
  const [activeFilterColumnId, setActiveFilterColumnId] = useState<string | null>(null)
  const [pendingFilterDraft, setPendingFilterDraft] = useState<ExcelColumnFilter>(() => createDefaultExcelFilter())
  const [filterValueSearch, setFilterValueSearch] = useState('')
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const [showSettings, setShowSettings] = useState(false)
  const [viewFeedback, setViewFeedback] = useState<string>('')
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [savedSignature, setSavedSignature] = useState<string>(() =>
    createViewSignature(clonePersistedView(initialView)),
  )
  const normalizedGlobalFilter = globalFilter.trim()
  const effectiveGrouping = grouping ?? EMPTY_GROUPING
  const useManualDataPipeline = !enableGrouping
  const accessorMap = useMemo(() => buildAccessorMap(effectiveColumns), [effectiveColumns])
  const activeFilterEntries = useMemo(
    () =>
      Object.entries(excelFilters).filter(([columnId, filter]) => {
        if (!accessorMap[columnId]) return false
        return filterIsActive(filter)
      }),
    [accessorMap, excelFilters],
  )
  const filteredData = useMemo(() => {
    let output = data
    const accessorEntries = Object.entries(accessorMap)

    if (normalizedGlobalFilter.length > 0 && accessorEntries.length > 0) {
      output = output.filter((row) =>
        accessorEntries.some(([, read]) => textContainsFilterValue(read(row), normalizedGlobalFilter)),
      )
    }

    if (activeFilterEntries.length > 0) {
      output = output.filter((row) =>
        activeFilterEntries.every(([columnId, filter]) => {
          const read = accessorMap[columnId]
          if (!read) return true
          const value = read(row)
          if (!rowMatchesCondition(value, filter)) return false
          if (!filter.selectedValues) return true
          return filter.selectedValues.includes(tokenizeCellValue(value))
        }),
      )
    }

    return output
  }, [accessorMap, activeFilterEntries, data, normalizedGlobalFilter])

  const manuallyProcessedData = useMemo(() => {
    if (!useManualDataPipeline) return filteredData
    let output = filteredData
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
  }, [accessorMap, filteredData, sorting, useManualDataPipeline])
  const tableData = useMemo(
    () =>
      useManualDataPipeline ? manuallyProcessedData.slice(0, visibleCount) : filteredData,
    [filteredData, manuallyProcessedData, useManualDataPipeline, visibleCount],
  )

  const currentView = useMemo<PersistedTableView>(
    () => ({
      sorting,
      columnVisibility,
      columnOrder,
      columnSizing,
      globalFilter,
      excelFilters,
      filterModeEnabled,
    }),
    [columnOrder, columnSizing, columnVisibility, excelFilters, filterModeEnabled, globalFilter, sorting],
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
      columnVisibility,
      columnOrder,
      columnSizing,
      rowSelection,
      grouping: enableGrouping ? effectiveGrouping : EMPTY_GROUPING,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onRowSelectionChange: setRowSelection,
    onGroupingChange: enableGrouping ? onGroupingChange : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: useManualDataPipeline ? undefined : getSortedRowModel(),
    getGroupedRowModel: enableGrouping ? getGroupedRowModel() : undefined,
    getRowId,
    enableRowSelection,
    manualSorting: useManualDataPipeline,
    manualFiltering: true,
    manualGrouping: !enableGrouping,
    enableColumnResizing: true,
    columnResizeMode: 'onEnd',
    defaultColumn: {
      size: 180,
      minSize: 80,
      maxSize: 700,
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
  }, [columnOrder, columnVisibility, data.length, effectiveGrouping, excelFilters, pageSize, sorting, globalFilter])

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
    setColumnVisibility(next.columnVisibility)
    setColumnOrder(next.columnOrder)
    setColumnSizing(next.columnSizing)
    setGlobalFilter(next.globalFilter)
    if (searchInputRef.current) {
      searchInputRef.current.value = next.globalFilter
    }
    setExcelFilters(next.excelFilters)
    setFilterModeEnabled(next.filterModeEnabled)
    setActiveFilterColumnId(null)
    setPendingFilterDraft(createDefaultExcelFilter())
    setFilterValueSearch('')
    setRowSelection({})
    setVisibleCount(pageSize)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(getStorageKey(tableId))
    }
    setSavedSignature(createViewSignature(next))
    setViewFeedback('View reset to default')
  }

  const applyGlobalSearch = () => {
    const nextFilter = searchInputRef.current?.value ?? ''
    if (nextFilter === globalFilter) return
    setGlobalFilter(nextFilter)
  }

  const leafColumns = table.getAllLeafColumns()
  const filterableColumns = leafColumns.filter(
    (column) => column.getCanFilter() && column.id !== SELECTION_COLUMN_ID,
  )
  const reorderableColumns = leafColumns.filter((column) => column.id !== SELECTION_COLUMN_ID)
  const valueOptionsByColumn = useMemo(() => {
    const options: Record<string, Array<{ token: string; label: string; count: number }>> = {}
    filterableColumns.forEach((column) => {
      const read = accessorMap[column.id]
      if (!read) return
      const counts = new Map<string, { label: string; count: number }>()
      data.forEach((row) => {
        const value = read(row)
        const token = tokenizeCellValue(value)
        const label = token === BLANK_VALUE_TOKEN ? '(Blanks)' : String(value ?? '')
        const current = counts.get(token) ?? { label, count: 0 }
        current.count += 1
        counts.set(token, current)
      })
      options[column.id] = [...counts.entries()]
        .map(([token, meta]) => ({ token, ...meta }))
        .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }))
    })
    return options
  }, [accessorMap, data, filterableColumns])

  const updateExcelFilter = (columnId: string, patch: Partial<ExcelColumnFilter>) => {
    setExcelFilters((current) => {
      const next = {
        ...(current[columnId] ?? createDefaultExcelFilter()),
        ...patch,
      }
      if (!filterIsActive(next)) {
        const { [columnId]: _removed, ...rest } = current
        return rest
      }
      return {
        ...current,
        [columnId]: next,
      }
    })
  }

  const closeFilterMenu = () => {
    setActiveFilterColumnId(null)
    setPendingFilterDraft(createDefaultExcelFilter())
    setFilterValueSearch('')
  }

  const applyPendingFilter = (columnId: string, allTokens: string[]) => {
    const normalizedSelectedValues =
      pendingFilterDraft.selectedValues && pendingFilterDraft.selectedValues.length === allTokens.length
        ? null
        : pendingFilterDraft.selectedValues
    updateExcelFilter(columnId, {
      condition: pendingFilterDraft.condition,
      value: pendingFilterDraft.value,
      secondValue: pendingFilterDraft.secondValue,
      selectedValues: normalizedSelectedValues,
    })
    closeFilterMenu()
  }

  useEffect(() => {
    if (filterModeEnabled) return
    setActiveFilterColumnId(null)
    setPendingFilterDraft(createDefaultExcelFilter())
    setFilterValueSearch('')
  }, [filterModeEnabled])

  useEffect(() => {
    if (!activeFilterColumnId) return
    const columnStillVisible = leafColumns.some((column) => column.id === activeFilterColumnId)
    if (columnStillVisible) return
    setActiveFilterColumnId(null)
    setPendingFilterDraft(createDefaultExcelFilter())
    setFilterValueSearch('')
  }, [activeFilterColumnId, leafColumns])

  useEffect(() => {
    if (!activeFilterColumnId) {
      setPendingFilterDraft(createDefaultExcelFilter())
      return
    }
    const committed = excelFilters[activeFilterColumnId] ?? createDefaultExcelFilter()
    setPendingFilterDraft(cloneExcelFilter(committed))
  }, [activeFilterColumnId, excelFilters])

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
          ref={searchInputRef}
          className="min-w-[260px] flex-1"
          placeholder="Search all columns..."
          defaultValue={globalFilter}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            applyGlobalSearch()
          }}
        />
        <Button type="button" size="sm" onClick={applyGlobalSearch}>
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>
        <Button
          type="button"
          variant={filterModeEnabled ? 'default' : 'secondary'}
          size="sm"
          onClick={() => {
            setFilterModeEnabled((current) => {
              const next = !current
              if (!next) {
                setActiveFilterColumnId(null)
                setFilterValueSearch('')
              }
              return next
            })
          }}
        >
          <Filter className="mr-2 h-4 w-4" />
          {filterModeEnabled ? 'Filter mode on' : 'Filter mode off'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setShowSettings((current) => !current)}>
          <Columns3 className="mr-2 h-4 w-4" />
          Columns
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={saveView} disabled={!hasUnsavedChanges}>
          <Save className="mr-2 h-4 w-4" />
          Save view
        </Button>
        {toolbarActions}
        <Button type="button" variant="ghost" size="sm" onClick={resetView}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset view
        </Button>
      </div>

      {showSettings ? (
        <div className="space-y-2 rounded-2xl border border-violet-100 bg-violet-50/40 p-3">
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
        className="min-h-[420px] max-h-[70vh] overflow-auto rounded-2xl border border-(--card-border)"
      >
        <table className="min-w-full border-collapse table-fixed text-sm" style={{ width: table.getTotalSize() }}>
          <thead className="bg-violet-100">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sortedState = header.column.getIsSorted()
                  const isFilterable =
                    filterModeEnabled &&
                    header.column.getCanFilter() &&
                    header.column.id !== SELECTION_COLUMN_ID
                  const committedColumnFilter = excelFilters[header.column.id] ?? createDefaultExcelFilter()
                  const hasActiveFilter = filterIsActive(excelFilters[header.column.id])
                  const valueOptions = valueOptionsByColumn[header.column.id] ?? []
                  const valueOptionTokens = valueOptions.map((option) => option.token)
                  const isMenuOpen = isFilterable && activeFilterColumnId === header.column.id
                  const workingColumnFilter = isMenuOpen ? pendingFilterDraft : committedColumnFilter
                  const filteredValueOptions = filterValueSearch
                    ? valueOptions.filter((option) =>
                      option.label.toLowerCase().includes(filterValueSearch.toLowerCase()),
                    )
                    : valueOptions
                  const selectedValueCount =
                    workingColumnFilter.selectedValues == null
                      ? valueOptions.length
                      : workingColumnFilter.selectedValues.length
                  const conditionNeedsValue = !['none', 'isEmpty', 'isNotEmpty'].includes(workingColumnFilter.condition)
                  const conditionNeedsSecondValue =
                    workingColumnFilter.condition === 'isBetween' || workingColumnFilter.condition === 'isNotBetween'
                  return (
                    <th
                      key={header.id}
                      className="sticky top-0 z-10 border-b border-slate-200 bg-violet-100 px-2 py-2 text-left"
                      style={{ width: header.getSize() }}
                    >
                      {header.isPlaceholder ? null : (
                        <div className="group relative">
                          <div className="flex items-center gap-1">
                            {canSort ? (
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
                            ) : (
                              <div className="font-semibold text-slate-700">
                                {flexRender(header.column.columnDef.header, header.getContext())}
                              </div>
                            )}
                            {isFilterable ? (
                              <button
                                type="button"
                                aria-label={`Filter ${columnLabel(header.column)}`}
                                className={cn(
                                  'inline-flex h-5 w-5 items-center justify-center rounded text-slate-500 transition hover:bg-white/80 hover:text-violet-700',
                                  hasActiveFilter ? 'bg-violet-100 text-violet-700' : '',
                                )}
                                onClick={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  setActiveFilterColumnId((current) => {
                                    if (current === header.column.id) return null
                                    return header.column.id
                                  })
                                  if (activeFilterColumnId === header.column.id) {
                                    setPendingFilterDraft(createDefaultExcelFilter())
                                  }
                                  setFilterValueSearch('')
                                }}
                              >
                                <Filter className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>

                          {isMenuOpen ? (
                            <div
                              className="absolute top-[calc(100%+6px)] right-0 z-30 w-[290px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <p className="mb-1 text-xs font-semibold text-slate-600">Filter by condition</p>
                              <select
                                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm"
                                value={workingColumnFilter.condition}
                                onChange={(event) =>
                                  setPendingFilterDraft((current) => ({
                                    ...current,
                                    condition: event.target.value as FilterCondition,
                                  }))
                                }
                              >
                                {FILTER_CONDITION_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              {conditionNeedsValue ? (
                                <Input
                                  className="mt-2 h-8"
                                  placeholder="Value..."
                                  value={workingColumnFilter.value}
                                  onChange={(event) =>
                                    setPendingFilterDraft((current) => ({
                                      ...current,
                                      value: event.target.value,
                                    }))
                                  }
                                />
                              ) : null}
                              {conditionNeedsSecondValue ? (
                                <Input
                                  className="mt-2 h-8"
                                  placeholder="Second value..."
                                  value={workingColumnFilter.secondValue}
                                  onChange={(event) =>
                                    setPendingFilterDraft((current) => ({
                                      ...current,
                                      secondValue: event.target.value,
                                    }))
                                  }
                                />
                              ) : null}

                              <div className="mt-3 border-t border-slate-200 pt-2">
                                <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      className="underline"
                                      onClick={() =>
                                        setPendingFilterDraft((current) => ({
                                          ...current,
                                          selectedValues: null,
                                        }))
                                      }
                                    >
                                      Select all
                                    </button>
                                    <button
                                      type="button"
                                      className="underline"
                                      onClick={() =>
                                        setPendingFilterDraft((current) => ({
                                          ...current,
                                          selectedValues: [],
                                        }))
                                      }
                                    >
                                      Clear
                                    </button>
                                  </div>
                                  <span>Displaying {selectedValueCount}</span>
                                </div>
                                <Input
                                  className="h-8"
                                  placeholder="Search values..."
                                  value={filterValueSearch}
                                  onChange={(event) => setFilterValueSearch(event.target.value)}
                                />
                                <div className="mt-2 max-h-44 space-y-1 overflow-auto rounded-lg border border-slate-100 p-2">
                                  {filteredValueOptions.length === 0 ? (
                                    <p className="text-xs text-slate-500">No values match.</p>
                                  ) : (
                                    filteredValueOptions.map((option) => {
                                      const checked =
                                        workingColumnFilter.selectedValues == null ||
                                        workingColumnFilter.selectedValues.includes(option.token)
                                      return (
                                        <label key={option.token} className="flex items-center gap-2 text-sm">
                                          <Checkbox
                                            checked={checked}
                                            onChange={(event) => {
                                              const base =
                                                workingColumnFilter.selectedValues == null
                                                  ? [...valueOptionTokens]
                                                  : [...workingColumnFilter.selectedValues]
                                              const next = event.target.checked
                                                ? Array.from(new Set([...base, option.token]))
                                                : base.filter((token) => token !== option.token)
                                              setPendingFilterDraft((current) => ({
                                                ...current,
                                                selectedValues:
                                                  next.length === valueOptionTokens.length ? null : next,
                                              }))
                                            }}
                                          />
                                          <span className="truncate">
                                            {option.label || '(Blanks)'} ({option.count})
                                          </span>
                                        </label>
                                      )
                                    })
                                  )}
                                </div>
                              </div>
                              <div className="mt-3 flex items-center justify-end gap-2 border-t border-slate-200 pt-2">
                                <Button type="button" variant="ghost" size="sm" onClick={closeFilterMenu}>
                                  Cancel
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => applyPendingFilter(header.column.id, valueOptionTokens)}
                                >
                                  Apply
                                </Button>
                              </div>
                            </div>
                          ) : null}

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
                    isRowActive?.(row.original) ? (activeRowClassName ?? 'bg-violet-50/70') : '',
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
