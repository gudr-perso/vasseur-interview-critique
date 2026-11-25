import { useEffect, useState } from 'react'
import { CATALOGUE_SECOURS, type Catalogue } from '../../shared/modeles'

let enCours: Promise<Catalogue> | null = null

/** Charge le catalogue une fois par page ; en cas d'échec, la liste de secours. */
export function chargerCatalogue(): Promise<Catalogue> {
  enCours ??= fetch('/api/admin/modeles')
    .then(reponse => (reponse.ok ? (reponse.json() as Promise<Catalogue>) : CATALOGUE_SECOURS))
    .catch(() => CATALOGUE_SECOURS)
  return enCours
}

export function useCatalogue(): Catalogue {
  const [catalogue, setCatalogue] = useState<Catalogue>(CATALOGUE_SECOURS)
  useEffect(() => {
    let actif = true
    chargerCatalogue().then(c => { if (actif) setCatalogue(c) })
    return () => { actif = false }
  }, [])
  return catalogue
}

/** « claude-opus-5-5 » → « OPUS-5-5 », pour les pastilles et les titres. */
export function libelleCourt(id: string): string {
  return id.replace(/^claude-/, '').toUpperCase()
}
