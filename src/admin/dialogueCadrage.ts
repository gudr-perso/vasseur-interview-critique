// Où en est le dialogue de cadrage et ce qu'il faut proposer, d'après les messages enregistrés
// (`GET …/cadrage`) : logique pure, sans React. Les règles reflètent celles de la route `…/cadrage/tour`.

import type { EtatDialogue, MessageCadrage } from '../../shared/cadrage'

export type PhaseDialogue =
  /** Aucun message : rien n'a été demandé, ou la première question a échoué. */
  | 'vide'
  /** L'IA a posé une question : on y répond (tour avec texte). */
  | 'question'
  /** La dernière réponse est enregistrée mais l'IA n'y a pas répondu (échec) : tour sans texte. */
  | 'relance'
  /** L'IA, ou le plafond, a conclu : il reste à rédiger la note. */
  | 'conclu'
  /** L'admin a arrêté le dialogue (« Terminer le cadrage ») : il reste à rédiger la note. */
  | 'termine'

type Messages = readonly Pick<MessageCadrage, 'type' | 'contenu'>[]

/** `termine` : l'admin a cliqué « Terminer le cadrage » (ce choix n'est pas enregistré). */
export function phaseDialogue(messages: Messages, termine: boolean): PhaseDialogue {
  const dernier = messages.at(-1)
  if (dernier?.type === 'conclusion') return 'conclu'
  if (termine && dernier) return 'termine'
  if (!dernier) return 'vide'
  return dernier.type === 'question' ? 'question' : 'relance'
}

export type BoutonDialogue =
  /** Tour sans texte : la première question. */
  | 'commencer'
  /** Tour avec la réponse tapée. */
  | 'envoyer'
  /** Tour sans texte : l'IA reprend après un échec. */
  | 'relancer'
  | 'rediger_note'

/** Bouton principal du dialogue ; `echecPrecedent` : le dernier appel a échoué, on propose de reprendre. */
export function boutonPropose(phase: PhaseDialogue, echecPrecedent: boolean): BoutonDialogue {
  switch (phase) {
    case 'vide':
      return echecPrecedent ? 'relancer' : 'commencer'
    case 'question':
      return 'envoyer'
    case 'relance':
      return 'relancer'
    case 'conclu':
    case 'termine':
      return 'rediger_note'
  }
}

/** « Terminer le cadrage » n'a de sens que tant que le dialogue est ouvert et a commencé. */
export function peutTerminer(phase: PhaseDialogue): boolean {
  return phase === 'question' || phase === 'relance'
}

/** Ce qu'il faut faire maintenant, en une phrase ; vide quand le bouton parle de lui-même. */
export function consigneDialogue(phase: PhaseDialogue, echecPrecedent: boolean): string {
  switch (phase) {
    case 'vide':
      return echecPrecedent ? "L'IA n'a pas pu poser sa première question. Relancez-la." : ''
    case 'question':
      return ''
    case 'relance':
      return "Votre dernière réponse est enregistrée, mais l'IA n'y a pas encore répondu. Relancez-la."
    case 'conclu':
      return "L'IA a assez d'éléments. Rédigez maintenant la note de cadrage : elle remplira la zone ci-dessous, à relire avant d'enregistrer."
    case 'termine':
      return "Dialogue arrêté. Rédigez la note de cadrage avec ce qui a été dit : elle remplira la zone ci-dessous, à relire avant d'enregistrer."
  }
}

/** Compteur des questions : la question en cours tant que le dialogue est ouvert, le total ensuite. */
export function libelleCompteur(etat: Pick<EtatDialogue, 'plafond' | 'questions_posees'>, phase: PhaseDialogue): string {
  const { plafond, questions_posees: posees } = etat
  if (phase === 'question') return `Question ${posees} sur ${plafond} au plus`
  return `${posees} question${posees > 1 ? 's' : ''} posée${posees > 1 ? 's' : ''} sur ${plafond} au plus`
}

/**
 * La réponse tapée figure-t-elle déjà dans le dialogue enregistré, sans suite de l'IA ? C'est le cas quand le serveur
 * l'a reçue mais que la réponse s'est perdue : il ne faut ni la renvoyer (409), ni la laisser dans la zone.
 */
export function reponseEnregistree(messages: Messages, texte: string): boolean {
  const dernier = messages.at(-1)
  return dernier?.type === 'reponse' && dernier.contenu === texte.trim()
}
