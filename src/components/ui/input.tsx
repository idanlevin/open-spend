import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-xl border border-[var(--card-border)] bg-white/75 px-3 text-sm text-[var(--text-primary)] outline-none ring-offset-transparent placeholder:text-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]',
        className,
      )}
      {...props}
    />
  )
}
