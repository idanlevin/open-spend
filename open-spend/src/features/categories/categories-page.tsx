import { useMemo, useState } from 'react'
import { FolderTree } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { useWorkspace } from '@/hooks/use-workspace'
import { amountToCurrency } from '@/lib/utils'

export function CategoriesPage() {
  const workspace = useWorkspace()
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [rawCategory, setRawCategory] = useState('')
  const [targetCategory, setTargetCategory] = useState('')

  const usageByCategory = useMemo(() => {
    const map = new Map<string, { count: number; spend: number }>()
    workspace.transactions.forEach((tx) => {
      const entry = map.get(tx.categoryFinalId) ?? { count: 0, spend: 0 }
      entry.count += 1
      entry.spend += tx.amount
      map.set(tx.categoryFinalId, entry)
    })
    return map
  }, [workspace.transactions])

  const rawCategories = useMemo(
    () =>
      [...new Set(workspace.transactions.map((tx) => tx.amexCategoryRaw))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [workspace.transactions],
  )

  return (
    <div>
      <PageHeader
        title="Categories"
        subtitle="Rename categories and remap raw AMEX category strings."
        icon={FolderTree}
      />
      <div className="grid gap-4 p-6 xl:grid-cols-2">
        <Card>
          <CardTitle>Category directory</CardTitle>
          <CardDescription>System and custom categories with usage stats.</CardDescription>
          <div className="mt-3 space-y-2">
            {workspace.categories.map((category) => {
              const usage = usageByCategory.get(category.categoryId) ?? { count: 0, spend: 0 }
              const nextName = editing[category.categoryId] ?? category.name
              return (
                <div key={category.categoryId} className="rounded-md border border-slate-200 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <Input
                      value={nextName}
                      onChange={(event) =>
                        setEditing((current) => ({
                          ...current,
                          [category.categoryId]: event.target.value,
                        }))
                      }
                    />
                    <Button
                      size="sm"
                      onClick={() => workspace.renameCategory(category.categoryId, nextName)}
                    >
                      Save
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                    <Badge>{usage.count} txns</Badge>
                    <Badge>{amountToCurrency(usage.spend)}</Badge>
                    {category.isSystem ? <Badge>System</Badge> : null}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
        <Card>
          <CardTitle>Raw category remapping</CardTitle>
          <CardDescription>Map AMEX raw labels to your normalized categories.</CardDescription>
          <div className="mt-3 space-y-2">
            <Select value={rawCategory} onChange={(event) => setRawCategory(event.target.value)}>
              <option value="">Select raw AMEX category</option>
              {rawCategories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
            <Select value={targetCategory} onChange={(event) => setTargetCategory(event.target.value)}>
              <option value="">Select normalized category</option>
              {workspace.categories.map((category) => (
                <option key={category.categoryId} value={category.categoryId}>
                  {category.name}
                </option>
              ))}
            </Select>
            <Button
              onClick={async () => {
                if (!rawCategory || !targetCategory) return
                await workspace.remapRawCategory(rawCategory, targetCategory)
                setRawCategory('')
                setTargetCategory('')
              }}
              disabled={!rawCategory || !targetCategory}
            >
              Save mapping
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
