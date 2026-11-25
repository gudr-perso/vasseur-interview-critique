import Anthropic from '@anthropic-ai/sdk'
import { CATALOGUE_SECOURS, DEFAUTS, type Catalogue, type Etape } from '../shared/modeles'

export interface ModeleApi {
  id: string
  display_name: string
  created_at: string
}

const DUREE_CACHE_MS = 24 * 60 * 60 * 1000

// Cache en mémoire de l'isolat : au mieux 24 h, perdu au redémarrage, ce qui suffit ici.
let cache: { expire: number; catalogue: Catalogue } | null = null

export function viderCache(): void {
  cache = null
}

export function construireCatalogue(liste: ModeleApi[]): Catalogue {
  const modeles = liste
    .filter(m => m.id.startsWith('claude-'))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(m => ({ id: m.id, nom: m.display_name }))
  if (modeles.length === 0) return CATALOGUE_SECOURS

  const connus = new Set(modeles.map(m => m.id))
  const choisir = (etape: Etape) => (connus.has(DEFAUTS[etape]) ? DEFAUTS[etape] : modeles[0].id)
  return {
    modeles,
    defauts: { cadrage: choisir('cadrage'), interview: choisir('interview'), analyse: choisir('analyse') },
  }
}

export async function obtenirCatalogue(
  lister: () => Promise<ModeleApi[]>, maintenantMs: number = Date.now(),
): Promise<Catalogue> {
  if (cache && cache.expire > maintenantMs) return cache.catalogue
  try {
    const catalogue = construireCatalogue(await lister())
    // Liste de secours (aucun modèle claude-) : on ne la garde pas, pour réessayer à la prochaine requête.
    if (catalogue === CATALOGUE_SECOURS) return catalogue
    cache = { expire: maintenantMs + DUREE_CACHE_MS, catalogue }
    return catalogue
  } catch (e) {
    console.error('Liste des modèles Anthropic indisponible, repli sur la liste de secours', e)
    return CATALOGUE_SECOURS
  }
}

export async function listerDepuisAnthropic(cleApi: string): Promise<ModeleApi[]> {
  const client = new Anthropic({ apiKey: cleApi })
  const modeles: ModeleApi[] = []
  for await (const modele of client.models.list()) {
    modeles.push({ id: modele.id, display_name: modele.display_name, created_at: modele.created_at })
  }
  return modeles
}
