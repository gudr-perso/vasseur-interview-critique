// Suivi d'un appel à l'IA dont la réponse arrive en flux (`./flux`) : état, texte au fil de l'eau, interruption
// quand l'écran est quitté. Commun aux analyses, au cadrage et à la génération des questionnaires.

import { useCallback, useEffect, useRef, useState } from 'react'
import { messageErreur } from './commun'
import { finDuFlux, type FinFlux, type ResultatFlux } from './flux'

export type EtatAppel<C, S> =
  | { phase: 'repos' }
  /** `entete` : `null` tant que le serveur n'a pas répondu. */
  | { phase: 'en_cours'; debut: number; texte: string; entete: C | null }
  | FinFlux<C, S>

export type FinAppel<C, S> = FinFlux<C, S>

/** L'appel lui-même : `surTexte` reçoit le texte cumulé et l'en-tête ; `signal` coupe la connexion. */
export type Appel<C, S> = (surTexte: (texte: string, entete: C) => void, signal: AbortSignal) => Promise<ResultatFlux<C, S>>

/** Intervalle minimal entre deux rendus du texte reçu : un aperçu Markdown est remis en forme en entier à chaque fois. */
const INTERVALLE_RENDU_MS = 100

/**
 * Regroupe les mises à jour : au plus une par image et par `INTERVALLE_RENDU_MS`.
 * `annuler` abandonne la mise à jour en attente.
 */
export function useRenduRegroupe<T>(appliquer: (valeur: T) => void) {
  const enAttente = useRef<{ valeur: T } | null>(null)
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
      if (maj) fonction.current(maj.valeur)
    })
  }, [])

  const pousser = useCallback((valeur: T) => {
    enAttente.current = { valeur }
    if (image.current === null) planifier()
  }, [planifier])

  return { pousser, annuler }
}

/**
 * Lance un appel en flux et en suit l'état. Quitter l'écran coupe la connexion. Un seul appel à la fois :
 * un second lancement pendant le premier est ignoré.
 */
export function useAppelFlux<C, S>() {
  const [etat, setEtat] = useState<EtatAppel<C, S>>({ phase: 'repos' })
  const controleur = useRef<AbortController | null>(null)
  const actif = useRef(false)
  const { pousser, annuler } = useRenduRegroupe<{ texte: string; entete: C }>(({ texte, entete }) =>
    setEtat(actuel => (actuel.phase === 'en_cours' ? { ...actuel, texte, entete } : actuel)))

  useEffect(() => () => {
    controleur.current?.abort()
    annuler()
  }, [annuler])

  /** La fin de l'appel, aussi rendue dans `etat` ; `null` si l'appel a été ignoré ou interrompu par la sortie. */
  const lancer = async (appel: Appel<C, S>): Promise<FinAppel<C, S> | null> => {
    if (actif.current) return null
    actif.current = true
    const suivi = new AbortController()
    controleur.current = suivi
    // Le dernier état reçu, sans le délai du rendu : c'est lui qui reste affiché si la lecture échoue.
    let recu: { texte: string; entete: C | null } = { texte: '', entete: null }
    setEtat({ phase: 'en_cours', debut: Date.now(), texte: '', entete: null })
    let fin: FinAppel<C, S>
    try {
      fin = finDuFlux(await appel((texte, entete) => {
        recu = { texte, entete }
        pousser({ texte, entete })
      }, suivi.signal))
    } catch (e) {
      if (suivi.signal.aborted) return null
      fin = { phase: 'erreur', texte: recu.texte, entete: recu.entete, message: messageErreur(e) }
    } finally {
      annuler()
      actif.current = false
    }
    setEtat(fin)
    return fin
  }

  const effacer = useCallback(() => setEtat({ phase: 'repos' }), [])

  return { etat, enCours: etat.phase === 'en_cours', lancer, effacer }
}
