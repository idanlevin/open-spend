import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={cn('h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500', className)}
      {...props}
    />
  )
}
