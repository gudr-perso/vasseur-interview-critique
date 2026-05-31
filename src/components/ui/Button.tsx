import { clsx } from 'clsx'
import type { ButtonHTMLAttributes } from 'react'
import { Spinner } from './Spinner'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'dark' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  loading?: boolean
}

const variantClasses = {
  primary: 'bg-red text-white hover:bg-red-dark disabled:opacity-40',
  dark:    'bg-ink text-paper hover:opacity-80',
  outline: 'border border-ink text-ink hover:bg-ink hover:text-paper bg-transparent',
  ghost:   'bg-transparent border border-border text-muted hover:bg-paper2',
  danger:  'border border-red text-red hover:bg-red hover:text-white bg-transparent',
}

export function Button({
  variant = 'outline',
  size = 'md',
  loading,
  disabled,
  children,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        'font-mono uppercase tracking-wider cursor-pointer transition-all duration-150 inline-flex items-center gap-2',
        size === 'sm' ? 'text-[0.63rem] px-3 py-1.5' : 'text-[0.68rem] px-4 py-2.5',
        variantClasses[variant],
        'disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  )
}
