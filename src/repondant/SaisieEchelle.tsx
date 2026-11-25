import { clsx } from 'clsx'
import { TEXTES } from './textes'

const NOTES = [1, 2, 3, 4, 5] as const

interface SaisieEchelleProps {
  nom: string
  libelle: string
  note: number | null
  onChange: (note: number) => void
  disabled?: boolean
}

/** Note de 1 à 5 : cinq boutons radio présentés en cases, les extrêmes nommés en dessous. */
export function SaisieEchelle({ nom, libelle, note, onChange, disabled }: SaisieEchelleProps) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="sr-only">{libelle}</legend>
      <div className="grid grid-cols-5 gap-2">
        {NOTES.map(n => {
          const coche = note === n
          return (
            <label
              key={n}
              htmlFor={`${nom}-${n}`}
              className={clsx(
                'flex items-center justify-center h-14 border cursor-pointer transition-colors',
                'font-mono text-[1.1rem]',
                'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ink',
                coche ? 'border-red bg-red text-white' : 'border-border bg-paper hover:border-ink',
              )}
            >
              <input
                id={`${nom}-${n}`}
                type="radio"
                name={nom}
                value={n}
                checked={coche}
                onChange={() => onChange(n)}
                className="sr-only"
              />
              {n}
              {n === 1 && <span className="sr-only"> ({TEXTES.question.echelleMin})</span>}
              {n === 5 && <span className="sr-only"> ({TEXTES.question.echelleMax})</span>}
            </label>
          )
        })}
      </div>
      <div aria-hidden="true" className="flex justify-between mt-2 text-[0.85rem] text-muted">
        <span>{TEXTES.question.echelleMin}</span>
        <span>{TEXTES.question.echelleMax}</span>
      </div>
    </fieldset>
  )
}
