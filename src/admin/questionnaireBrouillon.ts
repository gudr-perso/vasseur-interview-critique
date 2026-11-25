import type { Contenu, Mode, Questionnaire } from '../../shared/interviews'
import type { SaisieQuestionnaire } from './api'
import { estHybride, pretPourEnvoi } from './contenu'

// Mêmes plafonds que le serveur (`server/services/questionnaires.ts`), qui reste seul juge.
export const QUESTIONS_MAX = 40
export const THEMES_MAX = 12
export const OPTIONS_MIN = 2
export const OPTIONS_MAX = 10
/** Plafond de tours proposé quand on change de mode : relances au total en hybride, questions en entretien. */
export const TOURS_PAR_DEFAUT: Record<Mode, number> = { hybride: 12, entretien: 15 }

export const BORNES = {
  duree: { min: 1, max: 120 },
  relances: { min: 0, max: 3 },
  tours: { min: 1, max: 30 },
} as const

/** État de l'éditeur. Les nombres restent du texte le temps de la saisie (un champ peut être vide). */
export interface Brouillon {
  public_vise: string
  mode: Mode
  introduction: string
  duree: string
  relances: string
  tours: string
  contenu: Contenu
}

export function versBrouillon(q: Questionnaire): Brouillon {
  return {
    public_vise: q.public_vise,
    mode: q.mode,
    introduction: q.introduction,
    duree: String(q.duree_estimee_min),
    relances: String(q.relances_max_par_question),
    tours: String(q.tours_max),
    contenu: q.contenu,
  }
}

/** Représentation stable d'un brouillon, pour savoir s'il diffère de la version enregistrée. */
export function empreinte(b: Brouillon): string {
  const contenu = estHybride(b.contenu)
    ? b.contenu.questions.map(q => [q.id, q.type, q.libelle, q.objectif, q.options ?? null])
    : [b.contenu.question_ouverture, b.contenu.themes.map(t => [t.id, t.titre, t.objectif])]
  return JSON.stringify([b.public_vise, b.mode, b.introduction, b.duree, b.relances, b.tours, contenu])
}

function entier(texte: string, bornes: { min: number; max: number }, libelle: string): number {
  const n = Number(texte)
  if (texte.trim() === '' || !Number.isInteger(n) || n < bornes.min || n > bornes.max) {
    throw new Error(`${libelle} : un entier entre ${bornes.min} et ${bornes.max}.`)
  }
  return n
}

/** Corps de l'enregistrement. Lève une erreur au message affichable si un réglage est hors bornes. */
export function versSaisie(b: Brouillon): SaisieQuestionnaire {
  if (!b.public_vise.trim()) throw new Error('Le public visé est obligatoire.')
  const hybride = b.mode === 'hybride'
  return {
    public_vise: b.public_vise,
    mode: b.mode,
    introduction: b.introduction,
    duree_estimee_min: entier(b.duree, BORNES.duree, 'Durée estimée en minutes'),
    // Le champ n'est affiché qu'en mode hybride ; en entretien, la valeur enregistrée repart telle quelle.
    relances_max_par_question: entier(b.relances, BORNES.relances, 'Relances par question'),
    tours_max: entier(b.tours, BORNES.tours, hybride ? 'Plafond de relances au total' : 'Plafond de questions'),
    contenu: pretPourEnvoi(b.contenu),
  }
}
