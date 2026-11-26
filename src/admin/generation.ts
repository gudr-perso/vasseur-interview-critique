import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type DemandeAnalyse } from './api'
import { messageErreur } from './commun'
import { ERREUR_SANS_MESSAGE } from './fluxAnalyse'

export type EtatGeneration =
  | { phase: 'repos' }
  | { phase: 'en_cours'; debut: number; texte: string; nb_entretiens: number | null }
  /** `analyseId` : identifiant de l'analyse enregistrée, donné par la dernière ligne du flux. */
  | { phase: 'terminee'; texte: string; nb_entretiens: number; analyseId: string }
  | { phase: 'erreur'; texte: string; message: string }

/** Montré pendant une génération, et posé en question avant de quitter la page. */
export const AVERTISSEMENT_SORTIE = "Gardez cette page ouverte jusqu'à la fin : une analyse interrompue n'est pas enregistrée."

/** Intervalle minimal entre deux rendus de l'aperçu : le Markdown est remis en forme en entier à chaque fois. */
const INTERVALLE_RENDU_MS = 100

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
      const resultat = await api.analyses.generer(projetId, demande, pousser, suivi.signal)
      annuler()
      if (resultat.erreur || !resultat.analyse_id) {
        setEtat({ phase: 'erreur', texte: resultat.texte, message: resultat.erreur ?? ERREUR_SANS_MESSAGE })
        return
      }
      setEtat({ phase: 'terminee', texte: resultat.texte, nb_entretiens: resultat.nb_entretiens, analyseId: resultat.analyse_id })
      surFin.current()
    } catch (e) {
      annuler()
      if (suivi.signal.aborted) return
      setEtat(actuel => ({ phase: 'erreur', texte: 'texte' in actuel ? actuel.texte : '', message: messageErreur(e) }))
    }
  }

  return { etat, lancer }
}
