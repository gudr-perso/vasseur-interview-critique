export const TYPES_ANALYSE = ['fiche_repondant', 'synthese', 'expression_besoin'] as const
export type TypeAnalyse = (typeof TYPES_ANALYSE)[number]

export const LIMITES_ANALYSE = {
  /** Texte d'une analyse enregistrée. */
  contenu: 200_000,
  /** Entretiens envoyés en une fois à l'API (décision 4). */
  corpus_api: 400_000,
  /** Morceau de corpus renvoyé par un appel d'outil MCP. */
  morceau_mcp: 20_000,
} as const

export interface Analyse {
  id: string
  projet_id: string
  questionnaire_id: string | null
  repondant_id: string | null
  type: TypeAnalyse
  contenu: string
  /** `mcp`, ou l'identifiant du modèle API utilisé. */
  source: string
  nb_entretiens: number
  cree_le: string
}

/** Pour les listes : sans le contenu, avec un libellé de portée lisible. */
export interface AnalyseResume extends Omit<Analyse, 'contenu'> {
  portee: string
  taille: number
}

export interface PorteeAnalyse {
  projet_id: string
  questionnaire_id?: string
  repondant_id?: string
  /** Décision 2 : par défaut, entretiens terminés seulement. */
  inclure_en_cours?: boolean
}
