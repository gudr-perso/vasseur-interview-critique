import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnalyseResume } from '../../shared/analyses'
import { api, type DemandeAnalyse, type FiltreAnalyses } from './api'
import { messageErreur } from './commun'

export type EtatGeneration =
  | { phase: 'repos' }
  | { phase: 'en_cours'; debut: number; texte: string; nb_entretiens: number | null }
  /** `recherche` : l'analyse enregistrée est en cours de recherche ; `analyseId` reste nul si elle tarde. */
  | { phase: 'terminee'; texte: string; nb_entretiens: number; recherche: boolean; analyseId: string | null }
  | { phase: 'erreur'; texte: string; message: string }

/** Montré pendant une génération, et posé en question avant de quitter la page. */
export const AVERTISSEMENT_SORTIE = "Gardez cette page ouverte jusqu'à la fin : une analyse interrompue n'est pas enregistrée."

/** Intervalle minimal entre deux rendus de l'aperçu : le Markdown est remis en forme en entier à chaque fois. */
const INTERVALLE_RENDU_MS = 100
/** Attentes successives avant de chercher l'analyse enregistrée : l'enregistrement suit de peu la fin du flux. */
const ATTENTES_ENREGISTREMENT_MS = [300, 1000, 2000, 4000]

const attendre = (ms: number) => new Promise<void>(resoudre => { window.setTimeout(resoudre, ms) })

function filtreDe(demande: DemandeAnalyse): FiltreAnalyses {
  return { type: demande.type, questionnaire_id: demande.questionnaire_id, repondant_id: demande.repondant_id }
}

/** Même type et exactement la même portée (le filtre du serveur ne distingue pas « projet entier »). */
function memePortee(a: AnalyseResume, filtre: FiltreAnalyses): boolean {
  return a.type === filtre.type
    && a.questionnaire_id === (filtre.questionnaire_id ?? null)
    && a.repondant_id === (filtre.repondant_id ?? null)
}

/**
 * Le flux ne donne pas l'identifiant de l'analyse enregistrée : c'est la plus récente de ce type et de cette
 * portée, apparue depuis le lancement. `null` si elle tarde trop.
 */
async function trouverEnregistree(projetId: string, filtre: FiltreAnalyses, connues: Set<string>): Promise<string | null> {
  for (const ms of ATTENTES_ENREGISTREMENT_MS) {
    await attendre(ms)
    const liste = await api.analyses.lister(projetId, filtre).catch(() => [])
    // La liste est triée de la plus récente à la plus ancienne.
    const nouvelle = liste.find(a => memePortee(a, filtre) && !connues.has(a.id))
    if (nouvelle) return nouvelle.id
  }
  return null
}

/**
 * Regroupe les mises à jour du texte : au plus une par image et par `INTERVALLE_RENDU_MS`.
 * `annuler` abandonne la mise à jour en attente.
 */
function useRenduRegroupe(appliquer: (texte: string, nb: number) => void) {
  const enAttente = useRef<{ texte: string; nb: number } | null>(null)
  const image = useRef<number | null>(null)
  const dernier = useRef(0)
  const fonction = useRef(appliquer)
  fonction.current = appliquer

  const annuler = useCallback(() => {
    if (image.current !== null) window.cancelAnimationFrame(image.current)
    image.current = null
    enAttente.current = null
  }, [])

  const planifier = useCallback(function planifier() {
    image.current = window.requestAnimationFrame(instant => {
      image.current = null
      if (instant - dernier.current < INTERVALLE_RENDU_MS) return planifier()
      const maj = enAttente.current
      enAttente.current = null
      dernier.current = instant
      if (maj) fonction.current(maj.texte, maj.nb)
    })
  }, [])

  const pousser = useCallback((texte: string, nb: number) => {
    enAttente.current = { texte, nb }
    if (image.current === null) planifier()
  }, [planifier])

  return { pousser, annuler }
}

/**
 * Lance une génération et en suit l'avancement. Quitter l'écran coupe la connexion : le serveur ne prolonge
 * alors le travail que brièvement, et une analyse interrompue n'est pas enregistrée.
 */
export function useGenerationAnalyse(projetId: string, onEnregistree: () => void) {
  const [etat, setEtat] = useState<EtatGeneration>({ phase: 'repos' })
  const controleur = useRef<AbortController | null>(null)
  const { pousser, annuler } = useRenduRegroupe((texte, nb) =>
    setEtat(actuel => (actuel.phase === 'en_cours' ? { ...actuel, texte, nb_entretiens: nb } : actuel)))
  const surFin = useRef(onEnregistree)
  surFin.current = onEnregistree

  useEffect(() => () => {
    controleur.current?.abort()
    annuler()
  }, [annuler])

  const lancer = async (demande: DemandeAnalyse) => {
    const suivi = new AbortController()
    controleur.current = suivi
    setEtat({ phase: 'en_cours', debut: Date.now(), texte: '', nb_entretiens: null })
    try {
      // Analyses déjà là : celle qui apparaîtra en plus sera la nouvelle. Sans liste, la plus récente fera foi.
      const avant = await api.analyses.lister(projetId, filtreDe(demande)).catch(() => [])
      const connues = new Set(avant.map(a => a.id))
      const resultat = await api.analyses.generer(projetId, demande, pousser, suivi.signal)
      annuler()
      if (resultat.erreur) {
        setEtat({ phase: 'erreur', texte: resultat.texte, message: resultat.erreur })
        return
      }
      setEtat({ phase: 'terminee', texte: resultat.texte, nb_entretiens: resultat.nb_entretiens, recherche: true, analyseId: null })
      const analyseId = await trouverEnregistree(projetId, filtreDe(demande), connues)
      if (suivi.signal.aborted) return
      setEtat(actuel => (actuel.phase === 'terminee' ? { ...actuel, recherche: false, analyseId } : actuel))
      surFin.current()
    } catch (e) {
      annuler()
      if (suivi.signal.aborted) return
      setEtat(actuel => ({ phase: 'erreur', texte: 'texte' in actuel ? actuel.texte : '', message: messageErreur(e) }))
    }
  }

  return { etat, lancer }
}
