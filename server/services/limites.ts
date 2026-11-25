import { ErreurMetier } from '../erreurs'

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
} as const

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
