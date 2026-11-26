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
// 1. Une ligne d'en-tête JSON : {"nb_entretiens":n,"controle":"<séparateur>"}, envoyée dès que le corpus est prêt.
//    Le séparateur est tiré au hasard à chaque génération et n'est jamais montré au modèle.
// 2. Le texte de l'analyse, au fil de l'eau, tel que le modèle l'écrit.
// 3. Des lignes de contrôle, intercalées : "\n<séparateur> <JSON>\n". Le client les retire du texte, saut de ligne
//    initial et final compris. Un signal de vie ({"type":"vie"}) part après 15 s sans aucun envoi ; le flux se
//    termine toujours par une ligne de succès ({"type":"succes","analyse_id":"…"}) ou d'erreur
//    ({"type":"erreur","message":"…"}). Un flux qui s'arrête sans l'une d'elles a été coupé.

export interface EnteteFluxAnalyse {
  nb_entretiens: number
  /** Séparateur des lignes de contrôle. */
  controle: string
}

export type ControleFluxAnalyse =
  | { type: 'vie' }
  | { type: 'succes'; analyse_id: string }
  | { type: 'erreur'; message: string }

/** Forme d'un séparateur : 32 chiffres hexadécimaux. */
export const FORME_SEPARATEUR = /^[0-9a-f]{32}$/

/** Ligne de contrôle complète, sauts de ligne compris. */
export function ligneDeControle(separateur: string, controle: ControleFluxAnalyse): string {
  return `\n${separateur} ${JSON.stringify(controle)}\n`
}
