// Contrat du dialogue de cadrage avec l'IA dans l'admin (routes `/api/admin/projets/:id/cadrage…`).
// Les réponses en flux suivent le contrat commun de `shared/flux.ts`.

export type RoleCadrage = 'ia' | 'admin'

/** Nature d'un message : question ou conclusion de l'IA, réponse de l'admin. */
export type TypeMessageCadrage = 'question' | 'reponse' | 'conclusion'

export interface MessageCadrage {
  id: string
  role: RoleCadrage
  type: TypeMessageCadrage
  contenu: string
  cree_le: string
}

/** `GET …/cadrage` : le dialogue enregistré et où il en est. */
export interface EtatDialogue {
  messages: MessageCadrage[]
  /** Questions que l'IA peut poser pour ce type de demande. */
  plafond: number
  questions_posees: number
  /** L'IA a conclu (dernier message de type `conclusion`) : il reste à rédiger la note. */
  conclu: boolean
}

/** Champs communs de l'en-tête des flux du cadrage. */
export interface EnteteCadrage {
  /** Au moins un document a été tronqué pour tenir dans le contexte de l'IA. */
  contexte_tronque: boolean
}

/** En-tête du flux de `POST …/cadrage/tour` : l'état avant ce tour. */
export interface EnteteTourCadrage extends EnteteCadrage {
  plafond: number
  questions_posees: number
}

/**
 * Corps de `POST …/cadrage/tour`. `apres` : identifiant du dernier message que le client a vu (`null` : dialogue
 * vide). Le tour est refusé (409) si ce n'est plus le dernier message enregistré.
 */
export interface DemandeTourCadrage {
  /** Réponse de l'admin ; absente pour la première question ou pour relancer l'IA après un échec. */
  texte?: string
  apres: string | null
}

/** Message d'erreur d'un tour refusé ou abandonné parce qu'un autre tour a écrit dans le dialogue entre-temps. */
export const DIALOGUE_CHANGE = 'Le dialogue a changé entre-temps : il a été rechargé.'

/** Succès d'un tour : la question suivante, ou (`fin`) la phrase qui conclut. Aucun texte au fil de l'eau. */
export interface SuccesTourCadrage {
  fin: boolean
  message: string
  /** Messages écrits pendant ce tour, dans l'ordre : la réponse de l'admin s'il y en a une, puis celui de l'IA. */
  messages: MessageCadrage[]
}

/** Succès de `POST …/cadrage/note` et `…/cadrage/resume` : le texte est passé au fil de l'eau, rien n'est enregistré. */
export interface SuccesTexteCadrage {
  /** Longueur maximale atteinte : le texte s'arrête en cours de route. */
  tronquee: boolean
}
