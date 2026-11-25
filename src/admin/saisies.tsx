import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useBlocker } from 'react-router-dom'

// Garde contre la perte d'une saisie : un écran ou une section déclare qu'il porte des modifications
// non enregistrées ; tant qu'il en reste, quitter la page (lien, retour arrière, fermeture) demande confirmation.

const Registre = createContext<Set<symbol> | null>(null)

/** À placer une fois, autour des écrans : porte le registre et l'unique bloqueur de navigation. */
export function GardeSaisies({ children }: { children: ReactNode }) {
  const [registre] = useState(() => new Set<symbol>())
  const bloqueur = useBlocker(({ currentLocation, nextLocation }) =>
    registre.size > 0 && currentLocation.pathname !== nextLocation.pathname)

  useEffect(() => {
    if (bloqueur.state !== 'blocked') return
    if (window.confirm('Des modifications ne sont pas enregistrées. Quitter cette page et les perdre ?')) {
      registre.clear()
      bloqueur.proceed()
    } else {
      bloqueur.reset()
    }
  }, [bloqueur, registre])

  return <Registre.Provider value={registre}>{children}</Registre.Provider>
}

/**
 * Déclare une saisie non enregistrée tant que `active` est vrai.
 * Renvoie `liberer`, à appeler juste avant une navigation qui suit un enregistrement réussi.
 */
export function useSaisieNonEnregistree(active: boolean): () => void {
  const registre = useContext(Registre)
  const [jeton] = useState(() => Symbol('saisie'))

  useEffect(() => {
    if (!active || !registre) return
    registre.add(jeton)
    const avertir = (e: BeforeUnloadEvent) => {
      // Tant que le jeton est déclaré : `liberer` l'a peut-être retiré avant une sortie voulue.
      if (!registre.has(jeton)) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', avertir)
    return () => {
      registre.delete(jeton)
      window.removeEventListener('beforeunload', avertir)
    }
  }, [active, registre, jeton])

  return useCallback(() => { registre?.delete(jeton) }, [registre, jeton])
}

/** Oublie toutes les saisies déclarées : à appeler avant de quitter un écran dont le contenu vient d'être supprimé. */
export function useToutLiberer(): () => void {
  const registre = useContext(Registre)
  return useCallback(() => { registre?.clear() }, [registre])
}
