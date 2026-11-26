import { useState } from 'react'
import type { EnteteTourCadrage, EtatDialogue, MessageCadrage, SuccesTourCadrage } from '../../shared/cadrage'
import { LIMITES } from '../../shared/interviews'
import { Button } from '../components/ui/Button'
import { useCatalogue } from '../lib/modeles'
import { api } from './api'
import { useAppelFlux } from './appelFlux'
import { CLASSE_AIDE, ChampZone } from './champs'
import { Alerte, messageErreur, useAction, useChargement } from './commun'
import {
  boutonPropose, consigneDialogue, libelleCompteur, peutTerminer, phaseDialogue, reponseEnregistree,
  type BoutonDialogue, type PhaseDialogue,
} from './dialogueCadrage'
import { AppelEnCours, CLASSE_ETAT, ContexteTronque } from './EtatAppel'
import { libelleSource } from './libelles'
import { useSaisieNonEnregistree } from './saisies'

const AVERTISSEMENT_TOUR = "Gardez cette page ouverte jusqu'à la réponse de l'IA : sinon, elle risque d'être perdue."

/** Rappel du modèle, près du bouton qui appelle l'IA. */
export function RappelModele({ modele }: { modele: string }) {
  const { modeles } = useCatalogue()
  return (
    <p className={CLASSE_AIDE}>
      Modèle : <span className="font-medium text-ink">{libelleSource(modele, modeles)}</span> (modèle de cadrage du projet).
    </p>
  )
}

function Message({ message }: { message: MessageCadrage }) {
  const ia = message.role === 'ia'
  return (
    <li className={ia ? 'mr-8 border-l-2 border-ink bg-paper px-3 py-2' : 'ml-8 bg-paper2 px-3 py-2'}>
      <span className={`${CLASSE_ETAT} block text-muted mb-1`}>
        {ia ? (message.type === 'conclusion' ? 'IA — conclusion' : 'IA') : 'Vous'}
      </span>
      <span className="block text-[0.86rem] whitespace-pre-wrap break-words">{message.contenu}</span>
    </li>
  )
}

const LIBELLES_BOUTON: Record<BoutonDialogue, string> = {
  commencer: "Être interrogé par l'IA",
  envoyer: 'Envoyer',
  relancer: "Relancer l'IA",
  rediger_note: 'Rédiger la note de cadrage',
}

function Accueil({ plafond, modele, onCommencer }: { plafond: number; modele: string; onCommencer: () => void }) {
  return (
    <div className="border border-border p-4 mb-5">
      <p className="text-[0.84rem] leading-snug mb-3">
        L'IA vous pose des questions, une à la fois, à partir de la description et des documents du projet
        ({plafond} au plus pour ce type de demande). Elle rédige ensuite la note de cadrage, que vous relisez avant d'enregistrer.
      </p>
      <Button type="button" variant="primary" onClick={onCommencer}>{LIBELLES_BOUTON.commencer}</Button>
      <RappelModele modele={modele} />
    </div>
  )
}

interface BoutonsProps {
  phase: PhaseDialogue
  bouton: BoutonDialogue
  occupe: boolean
  /** L'action du bouton principal est en cours. */
  enCours: boolean
  recommencerEnCours: boolean
  avecMessages: boolean
  onPrincipal: () => void
  onTerminer: () => void
  onReprendre: () => void
  onRecommencer: () => void
}

function BoutonsDialogue(props: BoutonsProps) {
  const { phase, bouton, occupe, enCours, recommencerEnCours, avecMessages } = props
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="primary" onClick={props.onPrincipal} disabled={occupe} loading={enCours}>
        {LIBELLES_BOUTON[bouton]}
      </Button>
      {peutTerminer(phase) && (
        <Button type="button" variant="ghost" onClick={props.onTerminer} disabled={occupe}>Terminer le cadrage</Button>
      )}
      {phase === 'termine' && (
        <Button type="button" variant="ghost" onClick={props.onReprendre} disabled={occupe}>Reprendre le dialogue</Button>
      )}
      {avecMessages && (
        <Button type="button" variant="ghost" size="sm" onClick={props.onRecommencer} disabled={occupe} loading={recommencerEnCours}>
          Recommencer le dialogue
        </Button>
      )}
    </div>
  )
}

interface Props {
  projetId: string
  modele: string
  /** La note est en cours de rédaction : le dialogue attend. */
  noteEnCours: boolean
  onRedigerNote: () => void
}

/** Dialogue de cadrage avec l'IA, au-dessus de la note : une question à la fois, puis la rédaction de la note. */
export function CadrageIa({ projetId, modele, noteEnCours, onRedigerNote }: Props) {
  const { etat, recharger, remplacer } = useChargement(() => api.cadrage.lire(projetId), projetId)

  if (etat.phase === 'chargement') return <p className={`${CLASSE_AIDE} mb-4`}>Chargement du dialogue de cadrage…</p>
  if (etat.phase === 'erreur') {
    return (
      <div className="mb-4">
        <Alerte>{`Dialogue de cadrage indisponible : ${etat.message}`}</Alerte>
        <Button type="button" size="sm" className="mt-2" onClick={recharger}>Réessayer</Button>
      </div>
    )
  }
  return (
    <Dialogue
      projetId={projetId} modele={modele} dialogue={etat.donnees} noteEnCours={noteEnCours}
      onRedigerNote={onRedigerNote} onMaj={maj => remplacer(() => maj)}
    />
  )
}

interface DialogueProps extends Props {
  dialogue: EtatDialogue
  onMaj: (dialogue: EtatDialogue) => void
}

function Dialogue({ projetId, modele, dialogue, noteEnCours, onRedigerNote, onMaj }: DialogueProps) {
  const [ouvert, setOuvert] = useState(false)
  const [termine, setTermine] = useState(false)
  const [reponse, setReponse] = useState('')
  const [erreurSaisie, setErreurSaisie] = useState('')
  const [erreurMaj, setErreurMaj] = useState('')
  const tour = useAppelFlux<EnteteTourCadrage, SuccesTourCadrage>()
  const recommencer = useAction()
  useSaisieNonEnregistree(reponse.trim() !== '')
  useSaisieNonEnregistree(tour.enCours, AVERTISSEMENT_TOUR)

  const phase = phaseDialogue(dialogue.messages, termine)
  const echec = tour.etat.phase === 'erreur'
  const bouton = boutonPropose(phase, echec)
  const occupe = tour.enCours || recommencer.enCours || noteEnCours

  /** Un tour ; le dialogue est relu ensuite dans tous les cas : c'est le serveur qui dit ce qui a été enregistré. */
  const jouerTour = async (texte?: string) => {
    setErreurSaisie('')
    setErreurMaj('')
    const fin = await tour.lancer((surTexte, signal) => api.cadrage.tour(projetId, texte, surTexte, signal))
    if (!fin) return
    let maj: EtatDialogue | null = null
    try {
      maj = await api.cadrage.lire(projetId)
      onMaj(maj)
    } catch (e) {
      setErreurMaj(`Le dialogue n'a pas pu être actualisé : ${messageErreur(e)}`)
    }
    // L'en-tête du flux part une fois la réponse enregistrée : alors seulement, elle peut quitter la zone.
    if (texte !== undefined && (fin.entete !== null || (maj && reponseEnregistree(maj.messages, texte)))) setReponse('')
  }

  const lancer = () => {
    if (occupe) return
    if (bouton === 'rediger_note') return onRedigerNote()
    if (bouton !== 'envoyer') return void jouerTour()
    if (!reponse.trim()) return setErreurSaisie('Écrivez votre réponse avant de l’envoyer.')
    void jouerTour(reponse)
  }

  const terminer = () => {
    if (reponse.trim() && !window.confirm("Votre réponse n'a pas été envoyée. Terminer le cadrage sans l'envoyer ? Elle sera effacée.")) return
    setReponse('')
    setErreurSaisie('')
    setTermine(true)
  }

  const effacer = () => {
    if (!window.confirm('Recommencer le dialogue de cadrage ? Les questions et réponses seront effacées ; la note de cadrage est conservée.')) return
    void recommencer.lancer(async () => {
      await api.cadrage.recommencer(projetId)
      onMaj({ ...dialogue, messages: [], questions_posees: 0, conclu: false })
      setTermine(false)
      setOuvert(false)
      tour.effacer()
    })
  }

  if (!ouvert && dialogue.messages.length === 0 && !tour.enCours && !echec) {
    return <Accueil plafond={dialogue.plafond} modele={modele} onCommencer={() => { setOuvert(true); void jouerTour() }} />
  }

  const consigne = consigneDialogue(phase, echec)
  return (
    <div className="border border-ink p-4 mb-5" aria-label="Dialogue de cadrage avec l'IA" role="region">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-3">
        <h3 className="font-display text-[0.95rem]">Cadrage avec l'IA</h3>
        <span className={`${CLASSE_ETAT} text-muted`}>{libelleCompteur(dialogue, phase)}</span>
      </div>
      {dialogue.messages.length > 0 && (
        <ol className="grid gap-2 mb-3" aria-label="Échanges">
          {dialogue.messages.map(m => <Message key={m.id} message={m} />)}
        </ol>
      )}
      {tour.etat.phase === 'en_cours' && (
        <div className="mb-3">
          <AppelEnCours libelle="L'IA réfléchit…" debut={tour.etat.debut} avertissement={AVERTISSEMENT_TOUR} />
        </div>
      )}
      {'entete' in tour.etat && <ContexteTronque tronque={tour.etat.entete?.contexte_tronque ?? false} />}
      {phase === 'question' && (
        <ChampZone
          id="cadrage-reponse" libelle="Votre réponse" valeur={reponse} lignes={4} className="mt-3"
          onChange={v => { setReponse(v); setErreurSaisie('') }} maxLength={LIMITES.message_cadrage_admin}
          disabled={tour.enCours} erreur={erreurSaisie || undefined}
        />
      )}
      {consigne && <p className="text-[0.84rem] leading-snug mt-2 mb-3">{consigne}</p>}
      <BoutonsDialogue
        phase={phase} bouton={bouton} occupe={occupe} enCours={bouton === 'rediger_note' ? noteEnCours : tour.enCours}
        recommencerEnCours={recommencer.enCours} avecMessages={dialogue.messages.length > 0}
        onPrincipal={lancer} onTerminer={terminer} onReprendre={() => setTermine(false)} onRecommencer={effacer}
      />
      <RappelModele modele={modele} />
      <Alerte className="mt-3">{tour.etat.phase === 'erreur' ? tour.etat.message : ''}</Alerte>
      <Alerte className="mt-3">{erreurMaj || recommencer.erreur}</Alerte>
    </div>
  )
}
