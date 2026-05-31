import { clsx } from 'clsx'

interface SpinnerProps {
  size?: 'sm' | 'lg'
  className?: string
}

export function Spinner({ size = 'sm', className }: SpinnerProps) {
  return (
    <div
      className={clsx(
        'rounded-full border-2 border-border border-t-red animate-spin flex-shrink-0',
        size === 'sm' ? 'w-3.5 h-3.5' : 'w-7 h-7 border-[3px]',
        className,
      )}
    />
  )
}
