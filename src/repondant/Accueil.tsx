import type { ReactNode } from 'react'
import { TEXTES } from './textes'
import { Carte, TitreEtape } from './ui'

interface AccueilProps {
  introduction: string
  dureeMinutes: number
  /** Message propre à une invitation, au-dessus du formulaire. */
  consigne?: string
  /** Le formulaire d'identité. */
  children: ReactNode
}

/** Écran d'accueil : qui parle et pourquoi, combien de temps, l'usage des données, puis l'identité. */
export function Accueil({ introduction, dureeMinutes, consigne, children }: AccueilProps) {
  const texte = introduction.trim() || TEXTES.accueil.introductionParDefaut
  return (
    <Carte>
      <TitreEtape className="text-[1.65rem] sm:text-[1.9rem] mb-4">{TEXTES.accueil.titre}</TitreEtape>
      <p className="text-[1.02rem] leading-relaxed whitespace-pre-line mb-5">{texte}</p>

      <ul className="space-y-2 mb-6 text-[0.95rem]">
        {dureeMinutes > 0 && (
          <li className="flex items-baseline gap-2.5">
            <span aria-hidden="true" className="w-1.5 h-1.5 bg-gold flex-shrink-0 translate-y-[-2px]" />
            <span className="font-medium">{TEXTES.accueil.duree(dureeMinutes)}</span>
          </li>
        )}
        <li className="flex items-baseline gap-2.5">
          <span aria-hidden="true" className="w-1.5 h-1.5 bg-gold flex-shrink-0 translate-y-[-2px]" />
          <span className="text-ink/85">{TEXTES.accueil.reprise}</span>
        </li>
      </ul>

      <p className="text-[0.85rem] leading-relaxed text-muted border-l-2 border-border pl-3.5 mb-8">
        {TEXTES.accueil.donnees}
      </p>

      <h2 className="font-display font-bold text-[1.2rem] mb-1">{TEXTES.identite.titre}</h2>
      {consigne && <p className="text-[0.92rem] text-muted mb-4">{consigne}</p>}
      <div className={consigne ? undefined : 'mt-4'}>{children}</div>
    </Carte>
  )
}
