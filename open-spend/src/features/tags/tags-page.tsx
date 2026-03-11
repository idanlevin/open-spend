import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useWorkspace } from '@/hooks/use-workspace'

export function TagsPage() {
  const workspace = useWorkspace()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#2563eb')

  const usage = useMemo(() => {
    const map = new Map<string, number>()
    workspace.transactions.forEach((tx) => {
      tx.tags.forEach((tag) => {
        map.set(tag.tagId, (map.get(tag.tagId) ?? 0) + 1)
      })
    })
    return map
  }, [workspace.transactions])

  return (
    <div>
      <PageHeader title="Tags" subtitle="Create, organize, and track flexible metadata labels." />
      <div className="grid gap-4 p-6 xl:grid-cols-2">
        <Card>
          <CardTitle>Create tag</CardTitle>
          <div className="mt-3 flex gap-2">
            <Input placeholder="Tag name" value={name} onChange={(event) => setName(event.target.value)} />
            <Input type="color" className="w-16 px-1" value={color} onChange={(event) => setColor(event.target.value)} />
            <Button
              onClick={async () => {
                if (!name.trim()) return
                await workspace.createTag(name.trim(), color)
                setName('')
              }}
            >
              Add
            </Button>
          </div>
        </Card>
        <Card>
          <CardTitle>Tag directory</CardTitle>
          <CardDescription>Usage count across enriched transactions.</CardDescription>
          <div className="mt-3 space-y-2">
            {workspace.tags.map((tag) => (
              <div key={tag.tagId} className="flex items-center justify-between rounded-md border border-slate-200 p-2">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: tag.colorToken }}
                  />
                  <span>{tag.name}</span>
                </div>
                <Badge>{usage.get(tag.tagId) ?? 0} transactions</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
