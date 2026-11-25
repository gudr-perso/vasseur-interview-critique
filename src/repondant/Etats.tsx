import type { EtatRepondant } from '../../shared/repondants'
import { useAction } from '../admin/commun'
import { repondantApi } from './api'
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
  onEtat: (etat: EtatRepondant) => void
}

/** L'IA n'a pas pu poser la question suivante : reprendre, ou terminer avec les réponses déjà données. */
export function Interrompu({ jeton, onEtat }: InterrompuProps) {
  const reprise = useAction()
  const fin = useAction()
  const occupe = reprise.enCours || fin.enCours

  const reessayer = () => reprise.lancer(async () => {
    const etat = await repondantApi.suivant(jeton)
    // Toujours interrompu : l'écran reste le même, il faut le dire.
    if (etat.etape.type === 'interrompu') throw new Error(TEXTES.etats.persiste)
    onEtat(etat)
  })
  const terminer = () => {
    if (!window.confirm(TEXTES.etats.confirmerTerminer)) return
    void fin.lancer(async () => { onEtat(await repondantApi.terminer(jeton)) })
  }

  return (
    <Carte>
      <TitreEtape className="text-[1.5rem] mb-3">{TEXTES.etats.interrompuTitre}</TitreEtape>
      <p className="text-[1rem] leading-relaxed text-ink/85 mb-6">{TEXTES.etats.interrompu}</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Bouton enCours={reprise.enCours} disabled={occupe} onClick={() => void reessayer()}>
          {reprise.enCours ? TEXTES.question.patienter : TEXTES.etats.reessayer}
        </Bouton>
        <Bouton variante="secondaire" enCours={fin.enCours} disabled={occupe} onClick={terminer}>
          {TEXTES.etats.terminer}
        </Bouton>
      </div>
      <div className="mt-4">
        <AlerteR>{reprise.erreur || fin.erreur}</AlerteR>
      </div>
    </Carte>
  )
}
