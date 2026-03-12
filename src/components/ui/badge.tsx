import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-violet-200/70 bg-violet-100/70 px-2 py-0.5 text-xs font-medium text-violet-900',
        className,
      )}
      {...props}
    />
  )
}
