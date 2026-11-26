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
  modele: 100,
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

/** Document sans son contenu ; `taille` en caractères. */
export interface EnteteDocument {
  id: string
  nom: string
  taille: number
  cree_le: string
}

/** Taille d'un texte en caractères (un emoji compte pour un). */
export function tailleTexte(texte: string): number {
  return Array.from(texte).length
}

export function enteteDocument(document: DocumentProjet): EnteteDocument {
  return { id: document.id, nom: document.nom, taille: tailleTexte(document.contenu), cree_le: document.cree_le }
}

/** Projet tel que le reçoit la fiche de l'admin : ses documents sans leur contenu. */
export type ProjetFiche = Omit<ProjetComplet, 'documents'> & { documents: EnteteDocument[] }

export function versProjetFiche(projet: ProjetComplet): ProjetFiche {
  return { ...projet, documents: projet.documents.map(enteteDocument) }
}

export interface QuestionnaireResume {
  id: string
  public_vise: string
  mode: string
  statut: string
  code: string
  cree_le: string
}

type QuestionnaireADesigner = Pick<QuestionnaireResume, 'id' | 'public_vise' | 'mode' | 'statut' | 'cree_le'>

/** Complète avec `completer` le libellé des questionnaires qui en partagent un avec un autre. */
function departager(
  libelles: Map<string, string>, questionnaires: QuestionnaireADesigner[], completer: (q: QuestionnaireADesigner) => string,
): Map<string, string> {
  const effectifs = new Map<string, number>()
  for (const libelle of libelles.values()) effectifs.set(libelle, (effectifs.get(libelle) ?? 0) + 1)
  return new Map(questionnaires.map(q => {
    const actuel = libelles.get(q.id)!
    return [q.id, effectifs.get(actuel)! > 1 ? completer(q) : actuel]
  }))
}

/**
 * Libellés qui distinguent les questionnaires d'un même projet : « public (mode, statut) », complété de la date
 * de création, puis de l'heure (UTC), tant que deux questionnaires restent indiscernables.
 */
export function libellesQuestionnaires(questionnaires: QuestionnaireADesigner[]): Map<string, string> {
  const base = (q: QuestionnaireADesigner) => `${q.public_vise} (${q.mode}, ${q.statut}`
  const jour = (q: QuestionnaireADesigner) => {
    const [annee, mois, date] = q.cree_le.slice(0, 10).split('-')
    return `${base(q)}, créé le ${date}/${mois}/${annee}`
  }
  const heure = (q: QuestionnaireADesigner) => `${jour(q)} à ${q.cree_le.slice(11, 16)}`
  let libelles = new Map(questionnaires.map(q => [q.id, `${base(q)})`]))
  libelles = departager(libelles, questionnaires, q => `${jour(q)})`)
  libelles = departager(libelles, questionnaires, q => `${heure(q)})`)
  // Créés dans la même minute : leur rang, dans l'ordre de la liste, les départage.
  const rangs = new Map<string, number>()
  return departager(libelles, questionnaires, q => {
    const rang = (rangs.get(heure(q)) ?? 0) + 1
    rangs.set(heure(q), rang)
    return `${heure(q)}, n° ${rang})`
  })
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
