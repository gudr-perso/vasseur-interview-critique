import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { ErreurApi } from './api'

export function messageErreur(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Erreur inattendue.'
}

export type EtatChargement<T> =
  | { phase: 'chargement' }
  | { phase: 'erreur'; message: string; statut: number }
  | { phase: 'pret'; donnees: T }

/**
 * Charge des données à l'affichage, puis à chaque changement de `cle` ou appel de `recharger`.
 * `remplacer` met à jour les données chargées après une action réussie.
 */
export function useChargement<T>(charger: () => Promise<T>, cle: string) {
  const [etat, setEtat] = useState<EtatChargement<T>>({ phase: 'chargement' })
  const [essai, setEssai] = useState(0)
  const fonction = useRef(charger)
  fonction.current = charger

  useEffect(() => {
    let actif = true
    setEtat({ phase: 'chargement' })
    fonction.current().then(
      donnees => { if (actif) setEtat({ phase: 'pret', donnees }) },
      (e: unknown) => {
        if (actif) setEtat({ phase: 'erreur', message: messageErreur(e), statut: e instanceof ErreurApi ? e.statut : 0 })
      },
    )
    return () => { actif = false }
  }, [cle, essai])

  return {
    etat,
    recharger: () => setEssai(n => n + 1),
    remplacer: (maj: (donnees: T) => T) =>
      setEtat(actuel => (actuel.phase === 'pret' ? { phase: 'pret', donnees: maj(actuel.donnees) } : actuel)),
  }
}

export function Chargement() {
  return (
    <div className="flex justify-center py-16" role="status" aria-label="Chargement">
      <Spinner size="lg" />
    </div>
  )
}

export function ErreurChargement({ message, onReessayer }: { message: string; onReessayer: () => void }) {
  return (
    <div className="py-10 text-center">
      <p role="alert" className="text-red text-[0.86rem] mb-4">{message}</p>
      <Button onClick={onReessayer}>Réessayer</Button>
    </div>
  )
}

/** Suivi d'une action déclenchée par un bouton : en cours, message d'erreur, réussite. */
export function useAction() {
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState('')
  const [reussie, setReussie] = useState(false)

  /** Exécute l'action ; `true` si elle a réussi. Une erreur est retenue pour affichage, jamais relancée. */
  const lancer = async (action: () => Promise<void>): Promise<boolean> => {
    setEnCours(true)
    setErreur('')
    setReussie(false)
    try {
      await action()
      setReussie(true)
      return true
    } catch (e) {
      setErreur(messageErreur(e))
      return false
    } finally {
      setEnCours(false)
    }
  }

  return { enCours, erreur, reussie, lancer, signaler: setErreur }
}

export type Action = ReturnType<typeof useAction>

export function Alerte({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null
  return <p role="alert" className={`text-red text-[0.8rem] ${className ?? ''}`}>{children}</p>
}

export function Confirmation({ children }: { children: ReactNode }) {
  return <span role="status" className="font-mono text-[0.66rem] uppercase tracking-wider text-ok-fg">{children}</span>
}

export function TitreEcran({ titre, children }: { titre: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <h1 className="font-display font-bold text-[1.35rem] break-words min-w-0">{titre}</h1>
      {children}
    </div>
  )
}

/** Lien présenté comme le bouton principal : mêmes classes que `Button`, sémantique de lien. */
export const CLASSE_LIEN_BOUTON =
  'font-mono uppercase tracking-wider text-[0.68rem] px-4 py-2.5 inline-flex items-center gap-2 transition-all duration-150 bg-red text-white hover:bg-red-dark'
export const CLASSE_LIEN = 'font-mono text-[0.68rem] uppercase tracking-wider text-red underline'
