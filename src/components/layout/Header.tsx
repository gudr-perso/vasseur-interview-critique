import type { ModelId } from '../../types'
import { libelleCourt } from '../../lib/modeles'

interface HeaderProps {
  subject?: string
  currentQ?: number
  totalQ?: number
  model?: ModelId
  showProgress?: boolean
}

export function Header({ subject, currentQ = 0, totalQ = 0, model, showProgress }: HeaderProps) {
  const pct = totalQ > 0 ? Math.round((currentQ / totalQ) * 100) : 0
  const title = subject
    ? (subject.length > 48 ? subject.substring(0, 48) + '…' : subject)
    : 'Vasseur — Interview Critique'

  return (
    <header className="bg-ink text-paper px-6 py-3.5 flex items-center justify-between border-b-[3px] border-red sticky top-0 z-50">
      <div>
        <div className="font-display text-[0.95rem] tracking-[0.04em]">{title}</div>
        <div className="font-mono text-[0.6rem] text-[#aaa] mt-0.5">
          {showProgress
            ? `VASSEUR · ${subject ? subject.toUpperCase().substring(0, 30) : 'INTERVIEW'}`
            : 'MÉTHODE VASSEUR · GÉNÉRIQUE'}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        {showProgress && (
          <>
            <div className="font-mono text-[0.6rem] text-[#aaa]">
              {currentQ} / {totalQ}
            </div>
            <div className="w-36 h-[3px] bg-[#444] rounded-full overflow-hidden">
              <div
                className="h-full bg-red rounded-full transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            {model && (
              <div className="font-mono text-[0.58rem] bg-red text-white px-1.5 py-0.5 uppercase tracking-wider">
                {libelleCourt(model)}
              </div>
            )}
          </>
        )}
      </div>
    </header>
  )
}
