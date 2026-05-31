import { clsx } from 'clsx'
import type { HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'synthesis'
  padding?: 'sm' | 'md' | 'lg' | 'none'
}

export function Card({
  variant = 'default',
  padding = 'md',
  children,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={clsx(
        'bg-white mb-3.5',
        variant === 'default' && 'border border-border',
        variant === 'synthesis' && 'border-2 border-ink',
        padding === 'sm'  && 'p-4',
        padding === 'md'  && 'p-5',
        padding === 'lg'  && 'p-6',
        padding === 'none' && '',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
