import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EtatRepondant } from '../../shared/repondants'
import { useAction } from '../admin/commun'
import { ErreurApi, exigeRelecture, repondantApi } from './api'
import { effacerBrouillons, oublierJeton } from './stockage'
import { TEXTES } from './textes'
import { AlerteR, Bouton, Carte, TitreEtape } from './ui'

/** Écran d'un état final ou bloquant : un titre et un message. */
function Message({ titre, texte, ton = 'neutre' }: { titre: string; texte: string; ton?: 'neutre' | 'merci' }) {
  return (
    <Carte className={ton === 'merci' ? 'border-t-[3px] border-t-gold' : undefined}>
      <TitreEtape className="text-[1.5rem] mb-3">{titre}</TitreEtape>
      <p className="text-[1rem] leading-relaxed text-ink/85">{texte}</p>
    </Carte>
  )
}

export function LienInvalide() {
  return <Message titre={TEXTES.etats.invalideTitre} texte={TEXTES.etats.invalide} />
}

export function Clos() {
  return <Message titre={TEXTES.etats.closTitre} texte={TEXTES.etats.clos} />
}

export function Termine() {
  return <Message titre={TEXTES.etats.termineTitre} texte={TEXTES.etats.termine} ton="merci" />
}

interface InterrompuProps {
  jeton: string
  /** Faux une fois les nouveaux essais épuisés : il ne reste que « Terminer l'entretien ». */
  reessaiPossible: boolean
  onEtat: (etat: EtatRepondant) => void
}

/** L'IA n'a pas pu poser la question suivante : reprendre, ou terminer avec les réponses déjà données. */
export function Interrompu({ jeton, reessaiPossible, onEtat }: InterrompuProps) {
  const reprise = useAction()
  const fin = useAction()
  // Le serveur a refusé un nouvel essai (429) : on relit l'état pour savoir s'il en reste.
  const [epuise, setEpuise] = useState(false)
  const peutReessayer = reessaiPossible && !epuise
  const occupe = reprise.enCours || fin.enCours

  const reessayer = () => reprise.lancer(async () => {
    try {
      const etat = await repondantApi.suivant(jeton)
      onEtat(etat)
      // Toujours interrompu : l'écran reste le même, il faut le dire.
      if (etat.etape.type === 'interrompu') {
        throw new Error(etat.etape.reessai_possible ? TEXTES.etats.persiste : TEXTES.etats.epuise)
      }
    } catch (e) {
      if (!(e instanceof ErreurApi && e.statut === 429)) throw e
      const etat = await repondantApi.etat(jeton).catch(() => null)
      if (etat && etat.etape.type !== 'interrompu') { onEtat(etat); return }
      if (etat?.etape.type === 'interrompu' && !etat.etape.reessai_possible) setEpuise(true)
      throw e
    }
  })
  const terminer = () => {
    if (!window.confirm(TEXTES.etats.confirmerTerminer)) return
    void fin.lancer(async () => {
      try {
        onEtat(await repondantApi.terminer(jeton))
      } catch (e) {
        // 409 : la question suivante arrive finalement ; on affiche l'état réel.
        if (!(e instanceof ErreurApi && e.statut === 409)) throw e
        onEtat(await repondantApi.etat(jeton))
      }
    })
  }

  return (
    <Carte>
      <TitreEtape className="text-[1.5rem] mb-3">{TEXTES.etats.interrompuTitre}</TitreEtape>
      <p className="text-[1rem] leading-relaxed text-ink/85 mb-6">
        {peutReessayer ? TEXTES.etats.interrompu : TEXTES.etats.epuise}
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        {peutReessayer && (
          <Bouton enCours={reprise.enCours} disabled={occupe} onClick={() => void reessayer()}>
            {reprise.enCours ? TEXTES.question.patienter : TEXTES.etats.reessayer}
          </Bouton>
        )}
        <Bouton
          variante={peutReessayer ? 'secondaire' : 'principal'} enCours={fin.enCours} disabled={occupe} onClick={terminer}
        >
          {TEXTES.etats.terminer}
        </Bouton>
      </div>
      <div className="mt-4">
        <AlerteR>{peutReessayer ? reprise.erreur || fin.erreur : fin.erreur}</AlerteR>
      </div>
    </Carte>
  )
}

/** Intervalle de relecture de l'état pendant la préparation de la question suivante. */
const RELECTURE_MS = 2000

interface AttenteProps {
  jeton: string
  onEtat: (etat: EtatRepondant) => void
  /** Lien invalide, questionnaire clos… : relire l'état complet. */
  onRelire: () => void
}

/** La question suivante est en préparation (par exemple après un double envoi) : on relit l'état toutes les 2 s. */
export function Attente({ jeton, onEtat, onRelire }: AttenteProps) {
  const rappels = useRef({ onEtat, onRelire })
  rappels.current = { onEtat, onRelire }

  useEffect(() => {
    let actif = true
    let minuterie = 0
    const relire = async () => {
      try {
        const etat = await repondantApi.etat(jeton)
        if (!actif) return
        if (etat.etape.type !== 'attente') { rappels.current.onEtat(etat); return }
      } catch (e) {
        if (!actif) return
        if (exigeRelecture(e)) { rappels.current.onRelire(); return }
        // Réseau ou erreur passagère : on réessaie au prochain tour.
      }
      minuterie = window.setTimeout(() => void relire(), RELECTURE_MS)
    }
    minuterie = window.setTimeout(() => void relire(), RELECTURE_MS)
    return () => { actif = false; window.clearTimeout(minuterie) }
  }, [jeton])

  return (
    <Carte>
      <TitreEtape className="text-[1.5rem] mb-3">{TEXTES.etats.attenteTitre}</TitreEtape>
      <p role="status" className="flex items-center gap-3 text-[1rem] leading-relaxed text-ink/85">
        <span aria-hidden="true" className="w-4 h-4 rounded-full border-2 border-ink/25 border-t-ink animate-spin flex-shrink-0" />
        {TEXTES.question.patienterLong}
      </p>
    </Carte>
  )
}

interface AutreParticipationProps {
  prenom: string
  /** Code du lien générique d'où vient ce jeton. */
  code: string
  jeton: string
}

/**
 * Poste partagé : la personne devant l'écran n'est peut-être pas celle qui a commencé. On oublie le jeton
 * (l'entretien commencé reste enregistré tel quel) et on revient à l'accueil du lien générique.
 */
export function AutreParticipation({ prenom, code, jeton }: AutreParticipationProps) {
  const naviguer = useNavigate()
  const recommencer = () => {
    oublierJeton(jeton)
    effacerBrouillons(jeton)
    naviguer(`/q/${encodeURIComponent(code)}`, { replace: true })
  }
  return (
    <p className="mt-6 text-center text-[0.88rem] text-muted">
      {TEXTES.partage.pasVous(prenom)}{' '}
      <button
        type="button" onClick={recommencer}
        className="min-h-[44px] underline underline-offset-4 decoration-border hover:decoration-ink hover:text-ink"
      >
        {TEXTES.partage.nouvelle}
      </button>
    </p>
  )
}
