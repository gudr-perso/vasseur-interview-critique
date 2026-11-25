import { clsx } from 'clsx'
import type { InputHTMLAttributes, ReactNode } from 'react'

export const CLASSE_LIBELLE = 'block font-mono text-[0.66rem] uppercase tracking-wider text-muted mb-1.5'
export const CLASSE_CHAMP =
  'w-full border border-border bg-paper px-3 py-2.5 text-[0.86rem] text-ink focus:outline-none focus:border-ink disabled:opacity-60 disabled:cursor-not-allowed'
export const CLASSE_AIDE = 'text-[0.76rem] text-muted mt-1 leading-snug'
export const CLASSE_ERREUR = 'text-red text-[0.8rem] mt-1'

interface ChampProps {
  /** Identifiant du contrôle enfant, auquel le libellé est relié. */
  id: string
  libelle: string
  aide?: string
  erreur?: string
  className?: string
  children: ReactNode
}

/** Libellé relié + contrôle + message d'aide ou d'erreur. */
export function Champ({ id, libelle, aide, erreur, className, children }: ChampProps) {
  return (
    <div className={clsx('mb-4', className)}>
      <label htmlFor={id} className={CLASSE_LIBELLE}>{libelle}</label>
      {children}
      {erreur
        ? <p id={`${id}-message`} role="alert" className={CLASSE_ERREUR}>{erreur}</p>
        : aide && <p id={`${id}-message`} className={CLASSE_AIDE}>{aide}</p>}
    </div>
  )
}

interface ChampCommun {
  id: string
  libelle: string
  aide?: string
  erreur?: string
  className?: string
  disabled?: boolean
}

function decritPar({ id, aide, erreur }: ChampCommun): string | undefined {
  return aide || erreur ? `${id}-message` : undefined
}

interface ChampTexteProps extends ChampCommun {
  valeur: string
  onChange: (valeur: string) => void
  maxLength?: number
  placeholder?: string
  autoFocus?: boolean
  type?: 'text' | 'number'
  min?: number
  max?: number
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode']
}

export function ChampTexte(props: ChampTexteProps) {
  const { id, libelle, aide, erreur, className, valeur, onChange, type = 'text', ...reste } = props
  return (
    <Champ id={id} libelle={libelle} aide={aide} erreur={erreur} className={className}>
      <input
        id={id}
        type={type}
        value={valeur}
        onChange={e => onChange(e.target.value)}
        aria-describedby={decritPar(props)}
        aria-invalid={erreur ? true : undefined}
        className={CLASSE_CHAMP}
        {...reste}
      />
    </Champ>
  )
}

interface ChampZoneProps extends ChampCommun {
  valeur: string
  onChange: (valeur: string) => void
  lignes: number
  maxLength?: number
  placeholder?: string
}

export function ChampZone(props: ChampZoneProps) {
  const { id, libelle, aide, erreur, className, valeur, onChange, lignes, ...reste } = props
  return (
    <Champ id={id} libelle={libelle} aide={aide} erreur={erreur} className={className}>
      <textarea
        id={id}
        rows={lignes}
        value={valeur}
        onChange={e => onChange(e.target.value)}
        aria-describedby={decritPar(props)}
        aria-invalid={erreur ? true : undefined}
        className={clsx(CLASSE_CHAMP, 'leading-relaxed block')}
        {...reste}
      />
    </Champ>
  )
}

interface ChampListeProps<V extends string> extends ChampCommun {
  valeur: V
  onChange: (valeur: V) => void
  options: readonly { valeur: V; libelle: string }[]
}

export function ChampListe<V extends string>(props: ChampListeProps<V>) {
  const { id, libelle, aide, erreur, className, valeur, onChange, options, disabled } = props
  const choisir = (brut: string) => {
    const option = options.find(o => o.valeur === brut)
    if (option) onChange(option.valeur)
  }
  return (
    <Champ id={id} libelle={libelle} aide={aide} erreur={erreur} className={className}>
      <select
        id={id}
        value={valeur}
        disabled={disabled}
        onChange={e => choisir(e.target.value)}
        aria-describedby={decritPar(props)}
        className={CLASSE_CHAMP}
      >
        {options.map(o => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
      </select>
    </Champ>
  )
}
