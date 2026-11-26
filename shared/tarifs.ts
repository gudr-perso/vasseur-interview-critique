// Coût de l'IA : postes et grille de tarifs. Prix en dollars par million de jetons, API Anthropic directe,
// relevés le 26/11/2026 sur platform.claude.com/docs/en/about-claude/pricing. À mettre à jour ici quand ils changent.
// Jetons × dollars par million = micro-dollars.

export const POSTES = ['cadrage', 'interview', 'analyse', 'interview_critique'] as const
export type Poste = (typeof POSTES)[number]

export const LIBELLES_POSTE: Record<Poste, string> = {
  cadrage: 'Cadrage',
  interview: 'Interviews',
  analyse: 'Analyse',
  interview_critique: 'Interview critique',
}

export const DATE_RELEVE_TARIFS = '2026-11-26'

interface Prix { entree: number; ecriture: number; lecture: number; sortie: number }
interface Tarif extends Prix {
  /** Au-delà de ce nombre de jetons d'entrée (cache compris), toute la requête passe aux prix `long`. */
  long?: { seuil: number } & Prix
}

const p = (entree: number, ecriture: number, lecture: number, sortie: number): Prix => ({ entree, ecriture, lecture, sortie })

const TARIFS: Record<string, Tarif> = {
  'claude-fable-5-2': p(8, 10, 0.20, 40),
  'claude-mythos-5-2': p(8, 10, 0.20, 40),
  'claude-fable-5-1': p(10, 12.5, 0.25, 50),
  'claude-mythos-5-1': p(10, 12.5, 0.25, 50),
  'claude-fable-5': p(10, 12.5, 1, 50),
  'claude-mythos-5': p(10, 12.5, 1, 50),
  'claude-opus-5-5': p(4, 5, 0.20, 20),
  'claude-opus-5': p(5, 6.25, 0.50, 25),
  'claude-opus-4-8': p(5, 6.25, 0.50, 25),
  'claude-opus-4-7': p(5, 6.25, 0.50, 25),
  'claude-opus-4-6': p(5, 6.25, 0.50, 25),
  'claude-opus-4-5': p(5, 6.25, 0.50, 25),
  'claude-sonnet-5-5': p(2, 2.5, 0.10, 10),
  'claude-sonnet-5': p(2, 2.5, 0.20, 10),
  'claude-sonnet-4-6': p(3, 3.75, 0.30, 15),
  'claude-sonnet-4-5': p(3, 3.75, 0.30, 15),
  'claude-haiku-5-5': { ...p(0.10, 0.125, 0.01, 0.50), long: { seuil: 100_000, ...p(0.50, 0.625, 0.05, 2.50) } },
  'claude-haiku-4-5': p(1, 1.25, 0.10, 5),
}

export interface Jetons { entree: number; sortie: number; cache_lecture: number; cache_ecriture: number }

/** Identifiant exact, sinon le même suivi d'une date (`claude-haiku-4-5-20251001`). */
export function tarifDe(modele: string): Tarif | null {
  if (Object.prototype.hasOwnProperty.call(TARIFS, modele)) return TARIFS[modele]
  const famille = modele.replace(/-\d{8}$/, '')
  return famille !== modele && Object.prototype.hasOwnProperty.call(TARIFS, famille) ? TARIFS[famille] : null
}

/** Coût en micro-dollars entiers, ou null si le modèle n'a pas de tarif. */
export function calculerCout(modele: string, j: Jetons): number | null {
  const tarif = tarifDe(modele)
  if (!tarif) return null
  const total = j.entree + j.cache_lecture + j.cache_ecriture
  const prix = tarif.long && total > tarif.long.seuil ? tarif.long : tarif
  return Math.round(j.entree * prix.entree + j.cache_lecture * prix.lecture + j.cache_ecriture * prix.ecriture + j.sortie * prix.sortie)
}
