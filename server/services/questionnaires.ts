import {
  MODES, STATUTS_QUESTIONNAIRE, TYPES_QUESTION,
  type Contenu, type ContenuEntretien, type ContenuHybride, type Mode, type Question, type Questionnaire,
  type StatutQuestionnaire, type Theme, type TypeQuestion,
} from '../../shared/interviews'
import { ErreurMetier } from '../erreurs'
import { maintenantIso, nouveauCode, nouvelId } from '../ids'
import { LIMITES, estInvisible, verifierLongueur } from './limites'

export { MODES, STATUTS_QUESTIONNAIRE, TYPES_QUESTION }
export type {
  Contenu, ContenuEntretien, ContenuHybride, Mode, Question, Questionnaire, StatutQuestionnaire, Theme, TypeQuestion,
}

const QUESTIONS_MAX = 40
const THEMES_MAX = 12
const FORMAT_ID = /^[A-Za-z0-9_-]{1,40}$/

/** Texte rogné ; vide s'il n'est pas une chaîne ou ne contient rien de visible. */
function texte(valeur: unknown): string {
  if (typeof valeur !== 'string') return ''
  return estInvisible(valeur) ? '' : valeur.trim()
}

/** Identifiant fourni ou, à défaut, `défaut` ; refuse un identifiant mal formé ou déjà pris. */
function identifiant(brut: unknown, defaut: string, vus: Set<string>, repere: string): string {
  let id = defaut
  if (brut !== undefined && brut !== null && !(typeof brut === 'string' && estInvisible(brut))) {
    if (typeof brut !== 'string' || !FORMAT_ID.test(brut.trim())) {
      throw new ErreurMetier(`${repere} : identifiant invalide (1 à 40 caractères parmi lettres, chiffres, tiret et souligné).`)
    }
    id = brut.trim()
  }
  if (vus.has(id)) throw new ErreurMetier(`${repere} : identifiant « ${id} » déjà utilisé.`)
  vus.add(id)
  return id
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
    verifierLongueur(libelle, LIMITES.libelle, `${repere} : libellé trop long`)
    const objectif = texte(q.objectif)
    if (!objectif) throw new ErreurMetier(`${repere} : objectif manquant.`)
    verifierLongueur(objectif, LIMITES.objectif, `${repere} : objectif trop long`)

    const id = identifiant(q.id, `q${index + 1}`, vus, repere)

    if (type === 'choix_unique' || type === 'choix_multiple') {
      const brutes = Array.isArray(q.options) ? q.options : []
      if (brutes.length < 2 || brutes.length > 10) {
        throw new ErreurMetier(`${repere} : entre 2 et 10 options pour une question à choix.`)
      }
      const dejaVues = new Set<string>()
      const options = brutes.map((o, i) => {
        const option = texte(o)
        if (!option) throw new ErreurMetier(`${repere} : option ${i + 1} vide ou qui n'est pas du texte.`)
        verifierLongueur(option, LIMITES.option, `${repere} : option ${i + 1} trop longue`)
        const cle = option.toLowerCase()
        if (dejaVues.has(cle)) throw new ErreurMetier(`${repere} : option « ${option} » en double.`)
        dejaVues.add(cle)
        return option
      })
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
  verifierLongueur(ouverture, LIMITES.question_ouverture, "Question d'ouverture trop longue")
  const liste = Array.isArray(brut.themes) ? brut.themes : []
  if (liste.length === 0) throw new ErreurMetier('Un entretien couvre au moins un thème.')
  if (liste.length > THEMES_MAX) throw new ErreurMetier(`Un entretien couvre ${THEMES_MAX} thèmes au plus.`)

  const vus = new Set<string>()
  const themes = liste.map((element, index): Theme => {
    const t = (element ?? {}) as Record<string, unknown>
    const repere = `Thème ${index + 1}`
    const titre = texte(t.titre)
    if (!titre) throw new ErreurMetier(`${repere} : titre manquant.`)
    verifierLongueur(titre, LIMITES.titre_theme, `${repere} : titre trop long`)
    const objectif = texte(t.objectif)
    if (!objectif) throw new ErreurMetier(`${repere} : objectif manquant.`)
    verifierLongueur(objectif, LIMITES.objectif, `${repere} : objectif trop long`)
    return { id: identifiant(t.id, `t${index + 1}`, vus, repere), titre, objectif }
  })
  return { question_ouverture: ouverture, themes }
}

/** Vérifie et normalise le contenu d'un questionnaire ; les messages d'erreur disent quoi corriger. */
export function validerContenu(mode: Mode, contenu: unknown): Contenu {
  const brut = (contenu && typeof contenu === 'object' ? contenu : {}) as Record<string, unknown>
  return mode === 'hybride' ? validerHybride(brut) : validerEntretien(brut)
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

const ESSAIS_CODE = 3

function estCollisionDeCode(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed:\s*questionnaires\.code/i.test(e.message)
}

function erreurDejaPublie(): ErreurMetier {
  return new ErreurMetier('Ce questionnaire est déjà publié : il ne peut plus être remplacé. Créez-en un nouveau.', 409)
}

export async function enregistrerQuestionnaire(db: D1Database, saisie: SaisieQuestionnaire): Promise<Questionnaire> {
  const projet = await db.prepare('SELECT id FROM projets WHERE id = ?').bind(saisie.projet_id).first()
  if (!projet) throw new ErreurMetier(`Projet introuvable : ${saisie.projet_id}`, 404)

  const existant = saisie.id ? await lireQuestionnaire(db, saisie.id) : undefined
  if (existant) {
    if (existant.projet_id !== saisie.projet_id) {
      throw new ErreurMetier('Ce questionnaire appartient à un autre projet.', 409)
    }
    if (existant.statut !== 'brouillon') throw erreurDejaPublie()
  }

  const publicVise = saisie.public_vise.trim()
  if (!publicVise) throw new ErreurMetier('Le public visé est obligatoire.')
  verifierLongueur(publicVise, LIMITES.public_vise, 'Public visé trop long')
  const contenu = JSON.stringify(validerContenu(saisie.mode, saisie.contenu))
  // Au remplacement, un champ omis garde sa valeur ; seul le plafond de tours suit le mode quand celui-ci change.
  const toursActuels = existant && existant.mode === saisie.mode ? existant.tours_max : undefined
  const duree = borner(saisie.duree_estimee_min, existant?.duree_estimee_min ?? 10, 1, 120, 'Durée estimée en minutes')
  const relances = borner(saisie.relances_max_par_question, existant?.relances_max_par_question ?? 1, 0, 3, 'Relances par question')
  const tours = borner(saisie.tours_max, toursActuels ?? TOURS_MAX_DEFAUT[saisie.mode], 1, 30, 'Plafond de tours')
  const introduction = saisie.introduction ?? existant?.introduction ?? ''
  verifierLongueur(introduction, LIMITES.introduction, 'Introduction trop longue')
  const maintenant = maintenantIso()

  if (existant) {
    // La condition de statut est dans la requête : un brouillon publié entre-temps n'est pas écrasé.
    const { meta } = await db.prepare(
      `UPDATE questionnaires SET public_vise = ?, mode = ?, introduction = ?, duree_estimee_min = ?, contenu = ?,
              relances_max_par_question = ?, tours_max = ?, maj_le = ? WHERE id = ? AND statut = 'brouillon'`,
    ).bind(publicVise, saisie.mode, introduction, duree, contenu, relances, tours, maintenant, existant.id).run()
    if (meta.changes === 0) {
      await lireQuestionnaire(db, existant.id)
      throw erreurDejaPublie()
    }
    return lireQuestionnaire(db, existant.id)
  }

  const id = nouvelId()
  for (let essai = 1; ; essai++) {
    try {
      await db.prepare(
        `INSERT INTO questionnaires (id, projet_id, public_vise, mode, introduction, duree_estimee_min, contenu,
                                     relances_max_par_question, tours_max, code, cree_le, maj_le)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        id, saisie.projet_id, publicVise, saisie.mode, introduction, duree, contenu,
        relances, tours, nouveauCode(), maintenant, maintenant,
      ).run()
      break
    } catch (e) {
      if (!estCollisionDeCode(e)) throw e
      if (essai >= ESSAIS_CODE) {
        throw new ErreurMetier("Impossible d'attribuer une adresse unique au questionnaire. Réessayez.")
      }
    }
  }
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
  if (questionnaire.statut === 'clos') throw erreurClos()
  if (questionnaire.statut === 'brouillon') {
    const maintenant = maintenantIso()
    // Le statut est vérifié par les requêtes elles-mêmes ; le projet n'avance que si le questionnaire est bien ouvert.
    const [ouverture] = await db.batch([
      db.prepare("UPDATE questionnaires SET statut = 'ouvert', maj_le = ? WHERE id = ? AND statut = 'brouillon'")
        .bind(maintenant, id),
      db.prepare(
        `UPDATE projets SET statut = 'en_cours', maj_le = ?
         WHERE id = ? AND statut IN ('brouillon', 'cadre')
           AND EXISTS (SELECT 1 FROM questionnaires WHERE id = ? AND statut = 'ouvert')`,
      ).bind(maintenant, questionnaire.projet_id, id),
    ])
    if (ouverture.meta.changes === 0) {
      // Changé entre-temps : ouvert par un autre appel (résultat normal) ou clos.
      if ((await lireQuestionnaire(db, id)).statut === 'clos') throw erreurClos()
    }
  }
  const publie = await lireQuestionnaire(db, id)
  return { questionnaire: publie, url: urlPublique(origine, publie.code) }
}

function erreurClos(): ErreurMetier {
  return new ErreurMetier('Ce questionnaire est clos : il ne peut pas être rouvert par cet outil.', 409)
}

/** Ferme un questionnaire ouvert : plus aucune réponse n'est acceptée. */
export async function cloreQuestionnaire(db: D1Database, id: string): Promise<Questionnaire> {
  const resultat = await db.prepare(
    "UPDATE questionnaires SET statut = 'clos', maj_le = ? WHERE id = ? AND statut = 'ouvert'",
  ).bind(maintenantIso(), id).run()
  // lireQuestionnaire lève le 404 d'un identifiant inconnu avant le contrôle du nombre de lignes.
  const questionnaire = await lireQuestionnaire(db, id)
  if (resultat.meta.changes === 0) {
    throw new ErreurMetier('Seul un questionnaire ouvert peut être clos.', 409)
  }
  return questionnaire
}

/** Supprime un brouillon. Un questionnaire publié porte des réponses : il se clôt, il ne se supprime pas. */
export async function supprimerQuestionnaire(db: D1Database, id: string): Promise<void> {
  // La condition de statut est dans la requête : un brouillon publié entre-temps n'est pas supprimé.
  const resultat = await db.prepare("DELETE FROM questionnaires WHERE id = ? AND statut = 'brouillon'").bind(id).run()
  if (resultat.meta.changes > 0) return
  await lireQuestionnaire(db, id)
  throw new ErreurMetier('Seul un questionnaire en brouillon peut être supprimé.', 409)
}
