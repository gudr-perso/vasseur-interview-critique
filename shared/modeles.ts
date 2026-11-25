export interface Modele {
  id: string
  nom: string
}

export type Etape = 'cadrage' | 'interview' | 'analyse'

export interface Catalogue {
  modeles: Modele[]
  defauts: Record<Etape, string>
}

/** Modèles proposés par défaut pour chaque étape d'un projet. */
export const DEFAUTS: Record<Etape, string> = {
  cadrage: 'claude-opus-5-5',
  interview: 'claude-sonnet-5-5',
  analyse: 'claude-opus-5-5',
}

/** Liste utilisée quand l'API de liste des modèles est injoignable. */
export const MODELES_SECOURS: Modele[] = [
  { id: 'claude-fable-5-2', nom: 'Claude Fable 5.2' },
  { id: 'claude-opus-5-5', nom: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', nom: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', nom: 'Claude Haiku 5.5' },
]

export const CATALOGUE_SECOURS: Catalogue = { modeles: MODELES_SECOURS, defauts: DEFAUTS }
