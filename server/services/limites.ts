import { LIMITES } from '../../shared/interviews'
import { ErreurMetier } from '../erreurs'

export { LIMITES }

/** Refuse un texte trop long ; `champ` est une formule du type « Titre du projet trop long ». */
export function verifierLongueur(valeur: string, max: number, champ: string): void {
  if (valeur.length > max) {
    throw new ErreurMetier(`${champ} (${max} caractères au plus, reçu ${valeur.length}).`)
  }
}

// Espaces de toute sorte, caractères de format (largeur nulle, BOM, trait d'union conditionnel…)
// et quelques « blancs » qui ne sont ni l'un ni l'autre (braille vide, remplisseurs hangul).
const INVISIBLES = /[\s\p{Cc}\p{Cf}⠀ㅤᅟᅠ᠎]/gu

/** Vrai si le texte ne contient rien de visible. */
export function estInvisible(valeur: string): boolean {
  return valeur.replace(INVISIBLES, '') === ''
}
