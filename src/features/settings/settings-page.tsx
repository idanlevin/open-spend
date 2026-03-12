import { useMemo } from 'react'
import { HardDriveDownload, SlidersHorizontal, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { exportWorkspaceBackup } from '@/lib/export/exporters'
import { useWorkspace } from '@/hooks/use-workspace'

export function SettingsPage() {
  const workspace = useWorkspace()
  const storageSummary = useMemo(
    () => ({
      statements: workspace.statements.length,
      transactions: workspace.transactions.length,
      tags: workspace.tags.length,
      categories: workspace.categories.length,
      rules: workspace.rules.length,
    }),
    [workspace],
  )

  return (
    <div>
      <PageHeader
        title="Settings & data"
        subtitle="Manage workspace preferences, backups, and local storage."
        icon={SlidersHorizontal}
      />
      <div className="grid gap-4 p-6 xl:grid-cols-2">
        <Card>
          <CardTitle>Storage summary</CardTitle>
          <CardDescription>IndexedDB tables in current workspace profile.</CardDescription>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Stat label="Statements" value={storageSummary.statements} />
            <Stat label="Transactions" value={storageSummary.transactions} />
            <Stat label="Categories" value={storageSummary.categories} />
            <Stat label="Tags" value={storageSummary.tags} />
            <Stat label="Rules" value={storageSummary.rules} />
          </div>
        </Card>
        <Card>
          <CardTitle>Backup & restore</CardTitle>
          <CardDescription>Export full enriched workspace as local JSON snapshot.</CardDescription>
          <div className="mt-3 space-y-2">
            <Button variant="secondary" onClick={() => exportWorkspaceBackup()}>
              <HardDriveDownload className="mr-2 h-4 w-4" />
              Export workspace backup
            </Button>
            <p className="text-xs text-slate-500">
              Snapshot includes imports, statements, raw rows, normalized rows, overrides, categories, tags,
              mappings, and rules.
            </p>
          </div>
        </Card>
        <Card>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>Clear local data and reset workspace defaults.</CardDescription>
          <div className="mt-3">
            <Button
              variant="destructive"
              onClick={() => {
                const ok = window.confirm('Clear all local workspace data? This cannot be undone.')
                if (ok) void workspace.clearWorkspace()
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear workspace data
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}
