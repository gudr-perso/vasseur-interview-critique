import { clsx } from 'clsx'
import type { FeedbackType } from '../../types'
import { Chip } from './Chip'

interface FeedbackCardProps {
  type: FeedbackType
  text: string
  flags?: string[]
  show: boolean
}

const typeConfig = {
  ok: {
    bg: 'bg-ok-bg',
    border: 'border-l-[#27ae60]',
    color: 'text-ok-fg',
    label: 'Acté.',
  },
  warn: {
    bg: 'bg-warn-bg',
    border: 'border-l-[#e67e22]',
    color: 'text-warn-fg',
    label: 'Note',
  },
  flag: {
    bg: 'bg-flag-bg',
    border: 'border-l-[#e74c3c]',
    color: 'text-flag-fg',
    label: 'Risque détecté',
  },
}

export function FeedbackCard({ type, text, flags = [], show }: FeedbackCardProps) {
  const cfg = typeConfig[type]
  return (
    <div
      className={clsx(
        'mt-3 border-l-[3px] p-3 text-sm leading-relaxed transition-all duration-200',
        cfg.bg, cfg.border, cfg.color,
        show ? 'opacity-100 visible' : 'opacity-0 invisible h-0 overflow-hidden mt-0 p-0',
      )}
    >
      <div className="font-mono text-[0.57rem] uppercase tracking-widest opacity-70 mb-1">
        {cfg.label}
      </div>
      <div>{text}</div>
      {flags.length > 0 && (
        <div className="mt-1.5">
          {flags.map(f => <Chip key={f} label={f} />)}
        </div>
      )}
    </div>
  )
}
