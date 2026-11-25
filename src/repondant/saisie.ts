import type { Identite, Progression, QuestionPublique, Reponse } from '../../shared/repondants'
import { TEXTES } from './textes'

// Logique pure des écrans du répondant : sans React ni navigateur, donc testable.

/** Saisie en cours pour une question, quel qu'en soit le type. */
export interface Brouillon {
  /** Option choisie (choix unique : au plus une), ou options cochées. */
  choix: string[]
  note: number | null
  texte: string
  commentaire: string
}

export const BROUILLON_VIDE: Brouillon = { choix: [], note: null, texte: '', commentaire: '' }

/** Types dont la saisie est une option ou une note, et qui acceptent un commentaire. */
export function aCommentaire(type: QuestionPublique['type']): boolean {
  return type === 'choix_unique' || type === 'choix_multiple' || type === 'echelle'
}

/** Réponse à envoyer, ou null tant que la saisie est vide. */
export function versReponse(question: QuestionPublique, brouillon: Brouillon): Reponse | null {
  const commentaire = brouillon.commentaire.trim()
  const avecCommentaire = (reponse: Reponse): Reponse => (commentaire ? { ...reponse, commentaire } : reponse)
  switch (question.type) {
    case 'choix_unique': {
      const choisie = brouillon.choix[0]
      return choisie !== undefined && (question.options ?? []).includes(choisie) ? avecCommentaire({ valeur: choisie }) : null
    }
    case 'choix_multiple': {
      // Dans l'ordre des options, comme le serveur les enregistre.
      const choisies = (question.options ?? []).filter(o => brouillon.choix.includes(o))
      return choisies.length > 0 ? avecCommentaire({ valeur: choisies }) : null
    }
    case 'echelle':
      return brouillon.note !== null ? avecCommentaire({ valeur: brouillon.note }) : null
    case 'texte':
    case 'relance':
    case 'ouverte': {
      const texte = brouillon.texte.trim()
      return texte ? { texte } : null
    }
  }
}

/** Relit un brouillon conservé ; un contenu illisible ou d'une autre forme donne un brouillon vide. */
export function lireBrouillonBrut(brut: string | null): Brouillon {
  if (!brut) return BROUILLON_VIDE
  let donnees: unknown
  try {
    donnees = JSON.parse(brut)
  } catch {
    return BROUILLON_VIDE
  }
  if (typeof donnees !== 'object' || donnees === null) return BROUILLON_VIDE
  const choix: unknown = Reflect.get(donnees, 'choix')
  const note: unknown = Reflect.get(donnees, 'note')
  const texte: unknown = Reflect.get(donnees, 'texte')
  const commentaire: unknown = Reflect.get(donnees, 'commentaire')
  return {
    choix: Array.isArray(choix) ? choix.filter((c): c is string => typeof c === 'string') : [],
    note: typeof note === 'number' && Number.isInteger(note) && note >= 1 && note <= 5 ? note : null,
    texte: typeof texte === 'string' ? texte : '',
    commentaire: typeof commentaire === 'string' ? commentaire : '',
  }
}

export function estVide(brouillon: Brouillon): boolean {
  return brouillon.choix.length === 0 && brouillon.note === null && !brouillon.texte && !brouillon.commentaire
}

/**
 * « Question 2 sur 8 » et la part accomplie, en mode hybride ; null en mode entretien.
 * Une relance porte le numéro de la question qu'elle prolonge, déjà comptée comme faite.
 */
export function libelleProgression(
  question: QuestionPublique, progression: Progression,
): { libelle: string; part: number } | null {
  const { faites, total } = progression
  if (faites === undefined || total === undefined || total <= 0) return null
  const numero = Math.min(question.type === 'relance' ? Math.max(faites, 1) : faites + 1, total)
  return { libelle: TEXTES.question.progression(numero, total), part: Math.min(faites / total, 1) }
}

export const IDENTITE_VIDE: Identite = { nom: '', prenom: '', poste: '', entreprise: '', mail: '' }

/** Champs obligatoires, dans l'ordre où le serveur les contrôle et avec ses messages. */
const OBLIGATOIRES: { champ: keyof Identite; message: string }[] = [
  { champ: 'nom', message: TEXTES.identite.nomObligatoire },
  { champ: 'prenom', message: TEXTES.identite.prenomObligatoire },
  { champ: 'entreprise', message: TEXTES.identite.entrepriseObligatoire },
]

/** Premier champ obligatoire vide et son message, ou null si l'identité peut partir. */
export function controlerIdentite(identite: Identite): { champ: keyof Identite; message: string } | null {
  return OBLIGATOIRES.find(o => !identite[o.champ].trim()) ?? null
}

/** Identité nettoyée des espaces de bord, telle qu'envoyée au serveur. */
export function identiteNettoyee(identite: Identite): Identite {
  return {
    nom: identite.nom.trim(), prenom: identite.prenom.trim(), poste: identite.poste.trim(),
    entreprise: identite.entreprise.trim(), mail: identite.mail.trim(),
  }
}
