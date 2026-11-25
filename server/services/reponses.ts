import type { Question } from '../../shared/interviews'
import { LIMITES_REPONDANT, type Reponse } from '../../shared/repondants'
import { ErreurMetier } from '../erreurs'
import { estInvisible } from './limites'

const MAX = LIMITES_REPONDANT.reponse
// Espace ordinaire comme séparateur de milliers : `toLocaleString('fr-FR')` donne une espace fine insécable, selon l'ICU du runtime.
const MAX_AFFICHE = String(MAX).replace(/\B(?=(\d{3})+$)/g, ' ')

function texteBorne(valeur: unknown): string {
  const texte = typeof valeur === 'string' ? valeur.trim() : ''
  if (texte.length > MAX) throw new ErreurMetier(`Votre réponse est trop longue (${MAX_AFFICHE} caractères au plus).`)
  return estInvisible(texte) ? '' : texte
}

function avecCommentaire(reponse: Reponse, commentaire: unknown): Reponse {
  const texte = texteBorne(commentaire)
  return texte ? { ...reponse, commentaire: texte } : reponse
}

/**
 * Vérifie et normalise une réponse. `'libre'` désigne une relance ou un tour d'entretien,
 * qui attendent un texte.
 */
export function validerReponse(question: Question | 'libre', brute: Reponse): Reponse {
  if (question === 'libre' || question.type === 'texte') {
    const texte = texteBorne(brute.texte)
    if (!texte) throw new ErreurMetier('Écrivez votre réponse.')
    return { texte }
  }
  const options = question.options ?? []
  switch (question.type) {
    case 'choix_unique': {
      if (typeof brute.valeur !== 'string' || !options.includes(brute.valeur)) {
        throw new ErreurMetier('Choisissez une des réponses proposées.')
      }
      return avecCommentaire({ valeur: brute.valeur }, brute.commentaire)
    }
    case 'choix_multiple': {
      const choisies = Array.isArray(brute.valeur) ? brute.valeur : []
      if (choisies.length === 0) throw new ErreurMetier('Choisissez au moins une réponse.')
      if (!choisies.every(v => typeof v === 'string' && options.includes(v))) {
        throw new ErreurMetier('Choisissez parmi les réponses proposées.')
      }
      // Dans l'ordre des options, sans doublon.
      return avecCommentaire({ valeur: options.filter(o => choisies.includes(o)) }, brute.commentaire)
    }
    case 'echelle': {
      const note = brute.valeur
      if (typeof note !== 'number' || !Number.isInteger(note) || note < 1 || note > 5) {
        throw new ErreurMetier('Choisissez une note de 1 à 5.')
      }
      return avecCommentaire({ valeur: note }, brute.commentaire)
    }
  }
}

/** Réponse en une ligne, pour l'IA et pour la lecture d'un entretien. */
export function reponseEnTexte(reponse: Reponse): string {
  const valeur = reponse.valeur
  const principal = Array.isArray(valeur) ? valeur.join(' ; ')
    : typeof valeur === 'number' ? `${valeur} / 5`
    : valeur ?? reponse.texte ?? ''
  return reponse.commentaire ? `${principal} — commentaire : ${reponse.commentaire}` : principal
}
