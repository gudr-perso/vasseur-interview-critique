// Contrat de la génération des questionnaires par l'IA dans l'admin (`POST /api/admin/projets/:id/questionnaires/…`).
// Les réponses en flux suivent le contrat commun de `shared/flux.ts` ; aucun texte au fil de l'eau.

import type { Mode } from './interviews'

/** Consignes facultatives de l'admin pour la génération, en caractères. */
export const CONSIGNES_GENERATION_MAX = 4_000

/** En-tête des deux flux. */
export interface EnteteGeneration {
  /** Au moins un document a été tronqué pour tenir dans le contexte de l'IA. */
  contexte_tronque: boolean
}

export interface PublicPropose {
  public_vise: string
  mode: Mode
  justification: string
}

/** Succès de `…/questionnaires/publics` : de 1 à 6 propositions. Rien n'est enregistré. */
export interface SuccesPublics {
  publics: PublicPropose[]
}

/** Succès de `…/questionnaires/generer` : le brouillon créé, à ouvrir dans l'éditeur. */
export interface SuccesGeneration {
  questionnaire_id: string
}
