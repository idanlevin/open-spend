import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={cn(
        'h-4 w-4 rounded border-violet-300 text-violet-500 focus:ring-[var(--focus-ring)]',
        className,
      )}
      {...props}
    />
  )
}
