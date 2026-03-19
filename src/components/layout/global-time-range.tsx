import { useEffect, useMemo } from 'react'
import { CalendarRange } from 'lucide-react'
import { useWorkspace } from '@/hooks/use-workspace'
import { resolveTimeRange, sortStatementsNewestFirst } from '@/lib/analytics/time-range'
import { useTimeRangeStore } from '@/stores/time-range-store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

const YEAR_MIN = 2000
const YEAR_MAX = 2100

function clampYear(value: number): number {
  if (!Number.isFinite(value)) return new Date().getFullYear()
  return Math.max(YEAR_MIN, Math.min(YEAR_MAX, Math.trunc(value)))
}

export function GlobalTimeRangeBar() {
  const workspace = useWorkspace()
  const statements = useMemo(() => sortStatementsNewestFirst(workspace.statements), [workspace.statements])
  const {
    mode,
    statementId,
    customStartDate,
    customEndDate,
    month,
    year,
    quarter,
    lastNStatements,
    setMode,
    patch,
    reset,
  } = useTimeRangeStore()

  const resolved = useMemo(
    () =>
      resolveTimeRange(
        {
          mode,
          statementId,
          customStartDate,
          customEndDate,
          month,
          year,
          quarter,
          lastNStatements,
        },
        statements,
      ),
    [customEndDate, customStartDate, lastNStatements, mode, month, quarter, statementId, statements, year],
  )

  useEffect(() => {
    if (mode !== 'statement') return
    if (statementId) return
    if (statements.length === 0) return
    patch({ statementId: statements[0].statementId })
  }, [mode, patch, statementId, statements])

  return (
    <div className="px-6 pt-4">
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
          <CalendarRange className="h-4 w-4" />
        </span>
        <Select className="w-[220px]" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
          <option value="all">All time</option>
          <option value="statement">Specific statement</option>
          <option value="lastStatements">Last N statements</option>
          <option value="custom">Custom date range</option>
          <option value="month">Month preset</option>
          <option value="quarter">Quarter preset</option>
          <option value="year">Year preset</option>
          <option value="ytd">Year-to-date</option>
        </Select>

        {mode === 'statement' ? (
          <Select
            className="min-w-[260px]"
            value={statementId}
            onChange={(event) => patch({ statementId: event.target.value })}
          >
            <option value="">Select statement</option>
            {statements.map((statement) => (
              <option key={statement.statementId} value={statement.statementId}>
                {statement.statementStartDate} - {statement.statementEndDate}
              </option>
            ))}
          </Select>
        ) : null}

        {mode === 'lastStatements' ? (
          <Input
            className="w-[150px]"
            type="number"
            min={1}
            max={36}
            value={String(lastNStatements)}
            onChange={(event) =>
              patch({
                lastNStatements: Math.max(1, Math.min(36, Number(event.target.value || 1))),
              })
            }
          />
        ) : null}

        {mode === 'custom' ? (
          <>
            <Input
              className="w-[160px]"
              type="date"
              value={customStartDate}
              onChange={(event) => patch({ customStartDate: event.target.value })}
            />
            <Input
              className="w-[160px]"
              type="date"
              value={customEndDate}
              onChange={(event) => patch({ customEndDate: event.target.value })}
            />
          </>
        ) : null}

        {mode === 'month' ? (
          <Input
            className="w-[160px]"
            type="month"
            value={month}
            onChange={(event) => patch({ month: event.target.value })}
          />
        ) : null}

        {mode === 'quarter' ? (
          <>
            <Select
              className="w-[140px]"
              value={String(quarter)}
              onChange={(event) =>
                patch({
                  quarter: Number(event.target.value) as 1 | 2 | 3 | 4,
                })
              }
            >
              <option value="1">Q1</option>
              <option value="2">Q2</option>
              <option value="3">Q3</option>
              <option value="4">Q4</option>
            </Select>
            <Input
              className="w-[120px]"
              type="number"
              min={YEAR_MIN}
              max={YEAR_MAX}
              value={String(year)}
              onChange={(event) => patch({ year: clampYear(Number(event.target.value)) })}
            />
          </>
        ) : null}

        {mode === 'year' || mode === 'ytd' ? (
          <Input
            className="w-[120px]"
            type="number"
            min={YEAR_MIN}
            max={YEAR_MAX}
            value={String(year)}
            onChange={(event) => patch({ year: clampYear(Number(event.target.value)) })}
          />
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <p className="text-xs text-slate-600">Active: {resolved.label}</p>
          <Button size="sm" variant="ghost" onClick={reset}>
            Reset
          </Button>
        </div>
      </Card>
    </div>
  )
}
