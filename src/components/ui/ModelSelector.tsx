import { clsx } from 'clsx'
import type { ModelId } from '../../types'

interface ModelOption {
  id: ModelId
  badge: string
  name: string
  description: string
}

const MODELS: ModelOption[] = [
  {
    id: 'claude-sonnet-4-6',
    badge: 'Recommandé',
    name: 'Sonnet 4.6',
    description: 'Rapide, efficace. Génère de bonnes questions en ~20s.',
  },
  {
    id: 'claude-opus-4-6',
    badge: 'Premium',
    name: 'Opus 4.6',
    description: 'Plus approfondi, questions plus chirurgicales. ~60–90s.',
  },
]

const OUTPUT_MODELS: ModelOption[] = [
  {
    id: 'claude-sonnet-4-6',
    badge: 'Rapide',
    name: 'Sonnet 4.6',
    description: 'Analyse claire et bien structurée.',
  },
  {
    id: 'claude-opus-4-6',
    badge: 'Premium',
    name: 'Opus 4.6',
    description: 'Analyse plus dense et plus nuancée.',
  },
]

interface ModelSelectorProps {
  value: ModelId
  onChange: (m: ModelId) => void
  variant?: 'gen' | 'out'
}

export function ModelSelector({ value, onChange, variant = 'gen' }: ModelSelectorProps) {
  const options = variant === 'out' ? OUTPUT_MODELS : MODELS
  return (
    <div className="flex flex-col sm:flex-row gap-2 mt-1">
      {options.map(opt => {
        const selected = value === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={clsx(
              'flex-1 border p-3 text-left cursor-pointer transition-all duration-150',
              selected
                ? 'bg-ink border-ink text-paper'
                : 'bg-paper border-border hover:bg-paper2 hover:border-ink',
            )}
          >
            <div className={clsx('font-mono text-[0.58rem] uppercase tracking-wider mb-1', selected ? 'text-[#ff8c7a]' : 'text-red')}>
              {opt.badge}
            </div>
            <div className={clsx('font-medium text-[0.86rem] mb-0.5', selected ? 'text-paper' : 'text-ink')}>
              {opt.name}
            </div>
            <div className={clsx('text-[0.74rem] leading-snug', selected ? 'text-[#aaa]' : 'text-muted')}>
              {opt.description}
            </div>
          </button>
        )
      })}
    </div>
  )
}
