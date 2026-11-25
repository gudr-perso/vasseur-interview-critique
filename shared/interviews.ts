// Types et constantes métier communs au serveur et au navigateur.
// Ce fichier n'importe rien de `server/` et n'utilise aucun type Workers.

/** Plafonds de longueur, en caractères, des textes saisis. */
export const LIMITES = {
  titre_projet: 200,
  description: 20_000,
  note_cadrage: 50_000,
  resume_contexte: 20_000,
  nom_logiciel: 200,
  contexte_logiciel: 20_000,
  public_vise: 200,
  introduction: 2_000,
  nom_document: 200,
  contenu_document: 200_000,
  libelle: 500,
  objectif: 500,
  option: 200,
  question_ouverture: 500,
  titre_theme: 200,
} as const

export interface Logiciel {
  id: string
  nom: string
  contexte: string
  cree_le: string
  maj_le: string
}

export const TYPES_DEMANDE = ['evolution_simple', 'amelioration', 'nouvelle_fonctionnalite'] as const
export type TypeDemande = (typeof TYPES_DEMANDE)[number]

export const STATUTS_PROJET = ['brouillon', 'cadre', 'en_cours', 'clos'] as const
export type StatutProjet = (typeof STATUTS_PROJET)[number]

export interface Projet {
  id: string
  titre: string
  type_demande: TypeDemande
  description: string
  note_cadrage: string
  resume_contexte: string
  modele_cadrage: string
  modele_interview: string
  modele_analyse: string
  statut: StatutProjet
  cree_le: string
  maj_le: string
}

export interface DocumentProjet {
  id: string
  nom: string
  contenu: string
  cree_le: string
}

export interface QuestionnaireResume {
  id: string
  public_vise: string
  mode: string
  statut: string
  code: string
}

export interface ProjetComplet extends Projet {
  logiciels: Logiciel[]
  documents: DocumentProjet[]
  questionnaires: QuestionnaireResume[]
}

export interface ProjetResume {
  id: string
  titre: string
  type_demande: TypeDemande
  statut: StatutProjet
  /** Noms des logiciels, séparés par des virgules ; vide si aucun. */
  logiciels: string
  maj_le: string
}

export const MODES = ['hybride', 'entretien'] as const
export type Mode = (typeof MODES)[number]

export const TYPES_QUESTION = ['choix_unique', 'choix_multiple', 'echelle', 'texte'] as const
export type TypeQuestion = (typeof TYPES_QUESTION)[number]

export interface Question {
  id: string
  type: TypeQuestion
  libelle: string
  /** Présent uniquement pour les deux types « choix ». */
  options?: string[]
  /** Ce qu'on cherche à apprendre ; jamais montré au répondant, sert à décider d'une relance. */
  objectif: string
}

export interface Theme {
  id: string
  titre: string
  objectif: string
}

export interface ContenuHybride {
  questions: Question[]
}

export interface ContenuEntretien {
  question_ouverture: string
  themes: Theme[]
}

export type Contenu = ContenuHybride | ContenuEntretien

export const STATUTS_QUESTIONNAIRE = ['brouillon', 'ouvert', 'clos'] as const
export type StatutQuestionnaire = (typeof STATUTS_QUESTIONNAIRE)[number]

export interface Questionnaire {
  id: string
  projet_id: string
  public_vise: string
  mode: Mode
  introduction: string
  duree_estimee_min: number
  contenu: Contenu
  relances_max_par_question: number
  tours_max: number
  code: string
  statut: StatutQuestionnaire
  cree_le: string
  maj_le: string
}
