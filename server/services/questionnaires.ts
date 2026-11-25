import { ErreurMetier } from '../erreurs'
import { maintenantIso, nouveauCode, nouvelId } from '../ids'

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

export const STATUTS_QUESTIONNAIRE = ['brouillon', 'ouvert', 'clos'] as const
export type StatutQuestionnaire = (typeof STATUTS_QUESTIONNAIRE)[number]

export interface Questionnaire {
  id: string
  projet_id: string
  public_vise: string
  mode: Mode
  introduction: string
  duree_estimee_min: number
  contenu: Contenu
  relances_max_par_question: number
  tours_max: number
  code: string
  statut: StatutQuestionnaire
  cree_le: string
  maj_le: string
}

export interface SaisieQuestionnaire {
  /** Fourni : remplace ce brouillon. Absent : crée un nouveau questionnaire. */
  id?: string
  projet_id: string
  public_vise: string
  mode: Mode
  contenu: unknown
  introduction?: string
  duree_estimee_min?: number
  relances_max_par_question?: number
  tours_max?: number
}

/** Plafond de tours par défaut : relances au total en hybride, questions posées en entretien. */
const TOURS_MAX_DEFAUT: Record<Mode, number> = { hybride: 12, entretien: 15 }

type LigneQuestionnaire = Omit<Questionnaire, 'contenu'> & { contenu: string }

function borner(valeur: number | undefined, defaut: number, min: number, max: number, libelle: string): number {
  const n = valeur ?? defaut
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ErreurMetier(`${libelle} : un entier entre ${min} et ${max}.`)
  }
  return n
}

export async function lireQuestionnaire(db: D1Database, id: string): Promise<Questionnaire> {
  const ligne = await db.prepare('SELECT * FROM questionnaires WHERE id = ?').bind(id).first<LigneQuestionnaire>()
  if (!ligne) throw new ErreurMetier(`Questionnaire introuvable : ${id}`, 404)
  return { ...ligne, contenu: JSON.parse(ligne.contenu) as Contenu }
}

export async function enregistrerQuestionnaire(db: D1Database, saisie: SaisieQuestionnaire): Promise<Questionnaire> {
  const projet = await db.prepare('SELECT id FROM projets WHERE id = ?').bind(saisie.projet_id).first()
  if (!projet) throw new ErreurMetier(`Projet introuvable : ${saisie.projet_id}`, 404)

  const publicVise = saisie.public_vise.trim()
  if (!publicVise) throw new ErreurMetier('Le public visé est obligatoire.')
  const contenu = JSON.stringify(validerContenu(saisie.mode, saisie.contenu))
  const duree = borner(saisie.duree_estimee_min, 10, 1, 120, 'Durée estimée en minutes')
  const relances = borner(saisie.relances_max_par_question, 1, 0, 3, 'Relances par question')
  const tours = borner(saisie.tours_max, TOURS_MAX_DEFAUT[saisie.mode], 1, 30, 'Plafond de tours')
  const introduction = saisie.introduction ?? ''
  const maintenant = maintenantIso()

  if (saisie.id) {
    const existant = await lireQuestionnaire(db, saisie.id)
    if (existant.projet_id !== saisie.projet_id) {
      throw new ErreurMetier('Ce questionnaire appartient à un autre projet.', 409)
    }
    if (existant.statut !== 'brouillon') {
      throw new ErreurMetier('Ce questionnaire est déjà publié : il ne peut plus être remplacé. Créez-en un nouveau.', 409)
    }
    await db.prepare(
      `UPDATE questionnaires SET public_vise = ?, mode = ?, introduction = ?, duree_estimee_min = ?, contenu = ?,
              relances_max_par_question = ?, tours_max = ?, maj_le = ? WHERE id = ?`,
    ).bind(publicVise, saisie.mode, introduction, duree, contenu, relances, tours, maintenant, saisie.id).run()
    return lireQuestionnaire(db, saisie.id)
  }

  const id = nouvelId()
  await db.prepare(
    `INSERT INTO questionnaires (id, projet_id, public_vise, mode, introduction, duree_estimee_min, contenu,
                                 relances_max_par_question, tours_max, code, cree_le, maj_le)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id, saisie.projet_id, publicVise, saisie.mode, introduction, duree, contenu,
    relances, tours, nouveauCode(), maintenant, maintenant,
  ).run()
  return lireQuestionnaire(db, id)
}

export function urlPublique(origine: string, code: string): string {
  return `${origine.replace(/\/$/, '')}/q/${code}`
}

/** Ouvre le questionnaire aux répondants. Sans effet s'il est déjà ouvert. */
export async function publierQuestionnaire(
  db: D1Database, id: string, origine: string,
): Promise<{ questionnaire: Questionnaire; url: string }> {
  const questionnaire = await lireQuestionnaire(db, id)
  if (questionnaire.statut === 'clos') {
    throw new ErreurMetier('Ce questionnaire est clos : il ne peut pas être rouvert par cet outil.', 409)
  }
  if (questionnaire.statut === 'brouillon') {
    const maintenant = maintenantIso()
    await db.batch([
      db.prepare("UPDATE questionnaires SET statut = 'ouvert', maj_le = ? WHERE id = ?").bind(maintenant, id),
      db.prepare("UPDATE projets SET statut = 'en_cours', maj_le = ? WHERE id = ? AND statut IN ('brouillon', 'cadre')")
        .bind(maintenant, questionnaire.projet_id),
    ])
  }
  const publie = await lireQuestionnaire(db, id)
  return { questionnaire: publie, url: urlPublique(origine, publie.code) }
}
