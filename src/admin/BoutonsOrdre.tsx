import { Button } from '../components/ui/Button'

interface BoutonsOrdreProps {
  /** Désignation lue par les lecteurs d'écran, par exemple « la question 3 ». */
  designation: string
  libelleSuppression: string
  index: number
  total: number
  onDeplacer: (sens: -1 | 1) => void
  onSupprimer: () => void
}

/** Monter, descendre, supprimer un élément d'une liste ordonnée dont il doit rester au moins un élément. */
export function BoutonsOrdre({ designation, libelleSuppression, index, total, onDeplacer, onSupprimer }: BoutonsOrdreProps) {
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      <Button type="button" size="sm" variant="ghost" disabled={index === 0} onClick={() => onDeplacer(-1)} aria-label={`Monter ${designation}`}>
        ↑ Monter
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={index === total - 1} onClick={() => onDeplacer(1)} aria-label={`Descendre ${designation}`}>
        ↓ Descendre
      </Button>
      <Button type="button" size="sm" variant="danger" disabled={total <= 1} onClick={onSupprimer} aria-label={`Supprimer ${designation}`} className="sm:ml-auto">
        {libelleSuppression}
      </Button>
    </div>
  )
}
