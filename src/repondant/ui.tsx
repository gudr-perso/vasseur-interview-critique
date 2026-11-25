import { clsx } from 'clsx'
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

// Variantes des briques de l'admin pour le répondant : textes à 16 px (pas de zoom forcé sur téléphone),
// cibles tactiles d'au moins 48 px.

export const CLASSE_LIBELLE_R = 'block text-[0.95rem] font-medium text-ink mb-1.5'
export const CLASSE_CHAMP_R =
  'w-full min-h-[48px] border border-border bg-paper px-3.5 py-3 text-base text-ink rounded-none '
  + 'focus:outline-none focus:border-ink focus:ring-1 focus:ring-ink disabled:opacity-60'
export const CLASSE_AIDE_R = 'text-[0.85rem] text-muted mt-1.5 leading-snug'

interface BoutonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: 'principal' | 'secondaire'
  enCours?: boolean
}

export function Bouton({ variante = 'principal', enCours, disabled, className, children, ...reste }: BoutonProps) {
  return (
    <button
      type="button"
      disabled={disabled || enCours}
      className={clsx(
        'min-h-[48px] px-6 py-3 inline-flex items-center justify-center gap-2.5',
        'font-mono uppercase tracking-wider text-[0.78rem] transition-colors duration-150',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        'disabled:cursor-not-allowed',
        // En cours, le bouton reste plein : il attend, il n'est pas indisponible.
        variante === 'principal' && 'bg-red text-white hover:bg-red-dark',
        variante === 'principal' && !enCours && 'disabled:opacity-40 disabled:hover:bg-red',
        variante === 'secondaire' && 'border border-ink text-ink bg-transparent hover:bg-ink hover:text-paper',
        className,
      )}
      {...reste}
    >
      {enCours && (
        <span
          aria-hidden="true"
          className={clsx(
            'w-4 h-4 rounded-full border-2 animate-spin flex-shrink-0',
            variante === 'principal' ? 'border-white/40 border-t-white' : 'border-ink/25 border-t-ink',
          )}
        />
      )}
      {children}
    </button>
  )
}

export function Carte({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('bg-white border border-border px-5 py-6 sm:px-8 sm:py-8', className)}>{children}</div>
}

/**
 * Titre d'une étape, qui reçoit le focus à son affichage : un lecteur d'écran annonce la nouvelle
 * question, et le clavier repart du haut de l'étape.
 */
export function TitreEtape({ children, niveau = 1, className }: { children: ReactNode; niveau?: 1 | 2; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const Balise = niveau === 1 ? 'h1' : 'h2'
  return (
    <Balise
      ref={ref}
      tabIndex={-1}
      className={clsx('font-display font-bold text-ink leading-snug break-words focus:outline-none', className)}
    >
      {children}
    </Balise>
  )
}

export function AlerteR({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="border-l-[3px] border-red bg-flag-bg text-flag-fg px-3.5 py-2.5 text-[0.92rem] leading-snug">
      {children}
    </p>
  )
}
