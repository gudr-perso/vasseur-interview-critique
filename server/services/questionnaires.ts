import { ErreurMetier } from '../erreurs'

export const MODES = ['hybride', 'entretien'] as const
export type Mode = (typeof MODES)[number]

export const TYPES_QUESTION = ['choix_unique', 'choix_multiple', 'echelle', 'texte'] as const
export type TypeQuestion = (typeof TYPES_QUESTION)[number]

export interface Question {
  id: string
  type: TypeQuestion
  libelle: string
  /** Présent uniquement pour les deux types « choix ». */
  options?: string[]
  /** Ce qu'on cherche à apprendre ; jamais montré au répondant, sert à décider d'une relance. */
  objectif: string
}

export interface Theme {
  id: string
  titre: string
  objectif: string
}

export interface ContenuHybride {
  questions: Question[]
}

export interface ContenuEntretien {
  question_ouverture: string
  themes: Theme[]
}

export type Contenu = ContenuHybride | ContenuEntretien

const QUESTIONS_MAX = 40
const THEMES_MAX = 12

function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur.trim() : ''
}

function validerHybride(brut: Record<string, unknown>): ContenuHybride {
  const liste = Array.isArray(brut.questions) ? brut.questions : []
  if (liste.length === 0) throw new ErreurMetier('Un questionnaire hybride contient au moins une question.')
  if (liste.length > QUESTIONS_MAX) throw new ErreurMetier(`Un questionnaire contient ${QUESTIONS_MAX} questions au plus.`)

  const vus = new Set<string>()
  const questions = liste.map((element, index): Question => {
    const q = (element ?? {}) as Record<string, unknown>
    const repere = `Question ${index + 1}`
    const type = q.type as TypeQuestion
    if (!TYPES_QUESTION.includes(type)) {
      throw new ErreurMetier(`${repere} : type inconnu (attendu : ${TYPES_QUESTION.join(', ')}).`)
    }
    const libelle = texte(q.libelle)
    if (!libelle) throw new ErreurMetier(`${repere} : libellé manquant.`)
    const objectif = texte(q.objectif)
    if (!objectif) throw new ErreurMetier(`${repere} : objectif manquant.`)

    const id = texte(q.id) || `q${index + 1}`
    if (vus.has(id)) throw new ErreurMetier(`${repere} : identifiant « ${id} » déjà utilisé.`)
    vus.add(id)

    if (type === 'choix_unique' || type === 'choix_multiple') {
      const options = Array.isArray(q.options) ? q.options.map(texte).filter(Boolean) : []
      if (options.length < 2 || options.length > 10) {
        throw new ErreurMetier(`${repere} : entre 2 et 10 options pour une question à choix.`)
      }
      return { id, type, libelle, options, objectif }
    }
    if (q.options !== undefined) throw new ErreurMetier(`${repere} : pas d'options pour une question de type ${type}.`)
    return { id, type, libelle, objectif }
  })
  return { questions }
}

function validerEntretien(brut: Record<string, unknown>): ContenuEntretien {
  const ouverture = texte(brut.question_ouverture)
  if (!ouverture) throw new ErreurMetier("Un entretien commence par une question d'ouverture.")
  const liste = Array.isArray(brut.themes) ? brut.themes : []
  if (liste.length === 0) throw new ErreurMetier('Un entretien couvre au moins un thème.')
  if (liste.length > THEMES_MAX) throw new ErreurMetier(`Un entretien couvre ${THEMES_MAX} thèmes au plus.`)

  const themes = liste.map((element, index): Theme => {
    const t = (element ?? {}) as Record<string, unknown>
    const repere = `Thème ${index + 1}`
    const titre = texte(t.titre)
    if (!titre) throw new ErreurMetier(`${repere} : titre manquant.`)
    const objectif = texte(t.objectif)
    if (!objectif) throw new ErreurMetier(`${repere} : objectif manquant.`)
    return { id: texte(t.id) || `t${index + 1}`, titre, objectif }
  })
  return { question_ouverture: ouverture, themes }
}

/** Vérifie et normalise le contenu d'un questionnaire ; les messages d'erreur disent quoi corriger. */
export function validerContenu(mode: Mode, contenu: unknown): Contenu {
  const brut = (contenu && typeof contenu === 'object' ? contenu : {}) as Record<string, unknown>
  return mode === 'hybride' ? validerHybride(brut) : validerEntretien(brut)
}
