import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  icon?: LucideIcon
}

export function PageHeader({ title, subtitle, actions, icon: Icon }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/60 bg-white/55 px-6 py-4 backdrop-blur-md">
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-violet-100 to-sky-100 text-violet-700">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div>
          <h2 className="text-xl font-semibold text-(--text-primary)">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-(--text-muted)">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}
