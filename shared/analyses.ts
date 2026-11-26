import type { ControleFlux, EnteteFlux } from './flux'

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

// ─── Flux de génération (POST /api/admin/projets/:id/analyses) ───────────────
//
// Contrat commun décrit dans `shared/flux.ts`. L'en-tête porte le nombre d'entretiens analysés :
// {"nb_entretiens":n,"controle":"<séparateur>"}, envoyé dès que le corpus est prêt ; la ligne de succès porte
// l'identifiant de l'analyse enregistrée : {"type":"succes","analyse_id":"…"}.

export { FORME_SEPARATEUR, ligneDeControle } from './flux'

export type EnteteFluxAnalyse = EnteteFlux<{ nb_entretiens: number }>

export interface SuccesAnalyse {
  analyse_id: string
}

export type ControleFluxAnalyse = ControleFlux<SuccesAnalyse>
