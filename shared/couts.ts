// Types du suivi des coûts de l'IA, partagés entre le serveur et l'admin. Montants en micro-dollars entiers.

export interface CoutProjetLigne {
  projet_id: string
  /** Titre actuel du projet, « Projet supprimé » s'il n'existe plus. */
  titre: string
  /** Le projet n'existe plus : sa dépense reste comptée, sans lien vers sa fiche. */
  supprime: boolean
  cadrage: number
  interview: number
  analyse: number
  total: number
}

export interface CoutsGlobaux {
  /** Tout ce qui a été consommé, projets, projets supprimés et interview critique compris. */
  total: number
  /** Poste `interview_critique` : consommation sans projet. */
  hors_projet: number
  /** Du plus cher au moins cher. */
  projets: CoutProjetLigne[]
  /** Modèles distincts dont des lignes n'ont pas de tarif (comptées 0), triés. */
  tarifs_manquants: string[]
}

export interface CoutsProjet {
  cadrage: number
  interview: number
  analyse: number
  total: number
  tarifs_manquants: string[]
}
