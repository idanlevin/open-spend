import { useRef, useState } from 'react'
import { FolderOpen, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { useWorkspace } from '@/hooks/use-workspace'

export function FolderImporter() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const workspace = useWorkspace()

  const pickFolder = () => {
    fileInputRef.current?.click()
  }

  const importSelected = async () => {
    if (selectedFiles.length === 0) return
    await workspace.importFiles(selectedFiles, selectedFiles[0].webkitRelativePath.split('/')[0] || 'Imported Folder')
    setSelectedFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Folder import</CardTitle>
          <CardDescription>
            Select a local folder of AMEX `.xlsx` statements. Import is local-only and safe to rerun.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={pickFolder}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Choose folder
          </Button>
          <Button onClick={importSelected} disabled={selectedFiles.length === 0 || workspace.loading}>
            <Upload className="mr-2 h-4 w-4" />
            Import {selectedFiles.length > 0 ? `${selectedFiles.length} files` : ''}
          </Button>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = event.target.files ? [...event.target.files] : []
          setSelectedFiles(files.filter((file) => file.name.toLowerCase().endsWith('.xlsx')))
        }}
        {...({
          webkitdirectory: '',
          directory: '',
        } as Record<string, string>)}
      />
      {selectedFiles.length > 0 ? (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {selectedFiles.length} `.xlsx` files ready to import.
        </div>
      ) : null}
      {workspace.latestImport ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-sm">
            Added transactions: <strong>{workspace.latestImport.importBatch.transactionsAdded}</strong>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-sm">
            Duplicates skipped: <strong>{workspace.latestImport.importBatch.duplicatesSkipped}</strong>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-sm">
            Parse warnings: <strong>{workspace.latestImport.importBatch.warningsCount}</strong>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-sm">
            New merchants: <strong>{workspace.latestImport.newMerchants.length}</strong>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-sm">
            Uncategorized: <strong>{workspace.latestImport.uncategorizedCount}</strong>
          </div>
        </div>
      ) : null}
      {workspace.latestImport?.issues.length ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">Import issues</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-amber-800">
            {workspace.latestImport.issues.slice(0, 8).map((issue) => (
              <li key={`${issue.fileName}_${issue.message}`}>
                {issue.fileName}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  )
}
