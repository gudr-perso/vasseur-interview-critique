import { clsx } from 'clsx'
import { useLayoutEffect, useRef, useState } from 'react'
import { LIMITES_REPONDANT } from '../../shared/repondants'
import { etatLongueur } from '../admin/champs'
import { TEXTES } from './textes'
import { CLASSE_AIDE_R, CLASSE_CHAMP_R } from './ui'

const MAX = LIMITES_REPONDANT.reponse

interface ZoneProps {
  id: string
  valeur: string
  onChange: (valeur: string) => void
  lignes: number
  disabled?: boolean
  /** Nom de la zone pour les lecteurs d'écran : un texte, ou l'identifiant de l'élément qui la nomme. */
  libelleMasque?: string
  libellePar?: string
}

/** Zone de texte qui grandit avec son contenu, avec un compteur près de la limite. */
export function ZoneTexte({ id, valeur, onChange, lignes, disabled, libelleMasque, libellePar }: ZoneProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const { compteur, atteinte } = etatLongueur(valeur.length, MAX)

  useLayoutEffect(() => {
    const zone = ref.current
    if (!zone) return
    zone.style.height = 'auto'
    zone.style.height = `${zone.scrollHeight + 2}px`
  }, [valeur])

  return (
    <div>
      <textarea
        id={id}
        ref={ref}
        rows={lignes}
        value={valeur}
        maxLength={MAX}
        disabled={disabled}
        aria-label={libellePar ? undefined : libelleMasque}
        aria-labelledby={libellePar}
        aria-describedby={compteur ? `${id}-compteur` : undefined}
        onChange={e => onChange(e.target.value)}
        className={clsx(CLASSE_CHAMP_R, 'block leading-relaxed resize-none overflow-hidden')}
      />
      {compteur && (
        <p id={`${id}-compteur`} aria-live="polite" className={clsx(CLASSE_AIDE_R, 'font-mono', atteinte && 'text-red')}>
          {compteur}
        </p>
      )}
    </div>
  )
}

interface CommentaireProps {
  id: string
  valeur: string
  onChange: (valeur: string) => void
  disabled?: boolean
}

/** Commentaire facultatif, replié tant qu'il est vide. */
export function Commentaire({ id, valeur, onChange, disabled }: CommentaireProps) {
  const [ouvert, setOuvert] = useState(valeur !== '')
  return (
    <div className="mt-5">
      <button
        type="button"
        aria-expanded={ouvert}
        aria-controls={id}
        disabled={disabled}
        onClick={() => setOuvert(o => !o)}
        className="min-h-[44px] inline-flex items-center gap-2 text-[0.95rem] text-ink underline underline-offset-4 decoration-border hover:decoration-ink"
      >
        <span aria-hidden="true" className="font-mono w-3">{ouvert ? '−' : '+'}</span>
        {TEXTES.question.commentaire}
      </button>
      {ouvert && (
        <div className="mt-2">
          <ZoneTexte id={id} valeur={valeur} onChange={onChange} lignes={3} disabled={disabled} libelleMasque={TEXTES.question.commentaire} />
        </div>
      )}
    </div>
  )
}
