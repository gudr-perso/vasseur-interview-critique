import { clsx } from 'clsx'
import { TEXTES } from './textes'

interface SaisieChoixProps {
  /** Identifiant de la question, qui nomme le groupe de boutons. */
  nom: string
  libelle: string
  options: string[]
  multiple: boolean
  choix: string[]
  onChange: (choix: string[]) => void
  disabled?: boolean
}

/** Options en liste verticale : vrais boutons radio ou cases à cocher, sur toute la largeur d'une ligne. */
export function SaisieChoix({ nom, libelle, options, multiple, choix, onChange, disabled }: SaisieChoixProps) {
  const basculer = (option: string, coche: boolean) => {
    if (!multiple) onChange([option])
    else onChange(coche ? [...choix, option] : choix.filter(c => c !== option))
  }

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="sr-only">{libelle}</legend>
      {multiple && <p className="text-[0.88rem] text-muted mb-3">{TEXTES.question.plusieurs}</p>}
      <div className="space-y-2.5">
        {options.map((option, i) => {
          const coche = choix.includes(option)
          return (
            <label
              key={option}
              htmlFor={`${nom}-${i}`}
              className={clsx(
                'flex items-start gap-3.5 min-h-[52px] px-4 py-3 border cursor-pointer transition-colors',
                'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-ink',
                coche ? 'border-red bg-flag-bg' : 'border-border bg-paper hover:border-ink',
              )}
            >
              <input
                id={`${nom}-${i}`}
                type={multiple ? 'checkbox' : 'radio'}
                name={nom}
                value={option}
                checked={coche}
                onChange={e => basculer(option, e.target.checked)}
                className="mt-0.5 w-5 h-5 flex-shrink-0 accent-red cursor-pointer focus:outline-none"
              />
              <span className="text-base leading-snug break-words min-w-0">{option}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
