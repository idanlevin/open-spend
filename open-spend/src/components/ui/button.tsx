import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400 text-white shadow-md shadow-indigo-200/60 hover:translate-y-[-1px] hover:shadow-lg hover:shadow-violet-200/70',
        secondary:
          'border border-[var(--card-border)] bg-white/80 text-[var(--text-primary)] shadow-sm backdrop-blur hover:bg-white',
        ghost: 'text-[var(--text-primary)] hover:bg-[var(--accent-soft)]',
        destructive: 'bg-gradient-to-r from-rose-400 to-red-400 text-white shadow-md shadow-rose-200/70 hover:brightness-95',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-10 rounded-xl px-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
