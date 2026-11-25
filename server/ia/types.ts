import type { Question, Theme } from '../../shared/interviews'

/** Contexte du projet transmis à l'IA. Jamais la note de cadrage : elle contient les hypothèses internes. */
export interface ContexteEntretien {
  titre_projet: string
  public_vise: string
  logiciels: string[]
  resume_contexte: string
}

export interface EchangeLu {
  question: string
  reponse: string
}

export interface DemandeRelance {
  contexte: ContexteEntretien
  question: Question
  reponse: string
  /** Relances déjà posées sur cette question, avec leur réponse. */
  relances: EchangeLu[]
  /** Échanges des questions précédentes de cet entretien, relances comprises, dans l'ordre. */
  historique: EchangeLu[]
  /** Libellés des questions du questionnaire qui restent à poser après celle-ci. */
  questions_a_venir: string[]
  /** Relances encore permises sur cette question, celle-ci comprise. Absent : une. */
  relances_restantes?: number
}

export interface DecisionRelance {
  relancer: boolean
  question: string | null
}

export interface DemandeTour {
  contexte: ContexteEntretien
  question_ouverture: string
  themes: Theme[]
  historique: EchangeLu[]
  /** Questions qu'il reste le droit de poser. */
  tours_restants: number
}

export interface DecisionTour {
  fin: boolean
  question: string | null
  themes_couverts: string[]
}

/** Décisions confiées à l'IA. Une erreur levée signifie « pas de décision disponible ». */
export interface Ia {
  deciderRelance(demande: DemandeRelance): Promise<DecisionRelance>
  prochainTour(demande: DemandeTour): Promise<DecisionTour>
}

export class ErreurIa extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'ErreurIa'
  }
}
