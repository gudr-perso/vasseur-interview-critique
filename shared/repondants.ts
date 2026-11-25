import type { Mode, TypeQuestion } from './interviews'

export const LIMITES_REPONDANT = {
  nom: 100,
  prenom: 100,
  poste: 150,
  entreprise: 150,
  mail: 200,
  /** Texte d'une réponse ou d'un commentaire. */
  reponse: 4_000,
  /** Répondants créés par le lien générique d'un questionnaire. */
  repondants_generiques: 300,
} as const

export const STATUTS_REPONDANT = ['invite', 'commence', 'termine'] as const
export type StatutRepondant = (typeof STATUTS_REPONDANT)[number]

export interface Identite {
  nom: string
  prenom: string
  poste: string
  entreprise: string
  mail: string
}

/** Réponse du répondant. `valeur` : option choisie, options choisies, ou note de 1 à 5. */
export interface Reponse {
  valeur?: string | string[] | number
  texte?: string
  commentaire?: string
}

/** Question telle que la voit le répondant : jamais d'objectif. */
export interface QuestionPublique {
  ordre: number
  type: TypeQuestion | 'relance' | 'ouverte'
  libelle: string
  options?: string[]
  /** Pour une relance : la question et la réponse qui l'ont motivée. */
  rappel?: { question: string; reponse: string }
}

export interface Progression {
  /** Mode hybride : questions de base déjà répondues et total. Absent en mode entretien. */
  faites?: number
  total?: number
}

export type Etape =
  | { type: 'identite' }
  | { type: 'question'; question: QuestionPublique; progression: Progression }
  /** La question suivante est en préparation : relire l'état dans un instant. */
  | { type: 'attente' }
  /** Le calcul de la suite a échoué ; `reessai_possible` est faux une fois les nouveaux essais épuisés. */
  | { type: 'interrompu'; reessai_possible: boolean }
  | { type: 'termine' }
  | { type: 'clos' }

/** Ce que reçoit le navigateur du répondant pour son jeton. */
export interface EtatRepondant {
  questionnaire: {
    public_vise: string
    introduction: string
    duree_estimee_min: number
    mode: Mode
  }
  identite: Identite
  etape: Etape
}

export interface RepondantResume extends Identite {
  id: string
  jeton: string
  origine: 'invitation' | 'lien_generique'
  statut: StatutRepondant
  commence_le: string | null
  termine_le: string | null
  nb_reponses: number
}

export interface TourLu {
  ordre: number
  type: 'question' | 'relance'
  question_id: string | null
  question: string
  reponse: Reponse | null
  cree_le: string
}

export interface EntretienLu {
  repondant: RepondantResume
  questionnaire: { id: string; projet_id: string; public_vise: string; mode: Mode }
  tours: TourLu[]
}

/** Réponse en une ligne, pour l'IA et pour la lecture d'un entretien. */
export function reponseEnTexte(reponse: Reponse): string {
  const valeur = reponse.valeur
  const principal = Array.isArray(valeur) ? valeur.join(' ; ')
    : typeof valeur === 'number' ? `${valeur} / 5`
    : valeur ?? reponse.texte ?? ''
  return reponse.commentaire ? `${principal} — commentaire : ${reponse.commentaire}` : principal
}
