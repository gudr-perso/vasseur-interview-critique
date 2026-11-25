import type { ContenuEntretien, ContenuHybride, Question } from '../../shared/interviews'
import type {
  Etape, EtatRepondant, Progression, QuestionPublique, RepondantResume, Reponse,
} from '../../shared/repondants'
import { ErreurMetier } from '../erreurs'
import { maintenantIso, nouvelId } from '../ids'
import { ErreurIa, type ContexteEntretien, type EchangeLu, type Ia } from '../ia/types'
import { lireRepondantParJeton } from './repondants'
import type { Questionnaire } from './questionnaires'
import { reponseEnTexte, validerReponse } from './reponses'

// Déroulé d'un entretien. L'état vit entièrement dans la table `tours` : chaque question posée y est
// une ligne, et sa réponse reste vide tant que le répondant n'a pas répondu. Il y a au plus un tour
// en attente ; s'il n'y en a aucun alors que l'entretien n'est pas terminé, le calcul de la suite a échoué.

interface Dossier {
  repondant: RepondantResume & { questionnaire_id: string }
  questionnaire: Questionnaire
}

interface Tour {
  ordre: number
  type: 'question' | 'relance'
  question_id: string | null
  question: string
  reponse: Reponse | null
}

/** Tour dont la réponse est connue. */
type TourRepondu = Tour & { reponse: Reponse }

type NouveauTour = Pick<Tour, 'type' | 'question_id' | 'question'>

// --- Lecture --------------------------------------------------------------------------------------

async function lireDossier(db: D1Database, jeton: string): Promise<Dossier> {
  return lireRepondantParJeton(db, jeton)
}

async function lireTours(db: D1Database, repondantId: string): Promise<Tour[]> {
  const { results } = await db.prepare(
    'SELECT ordre, type, question_id, question, reponse FROM tours WHERE repondant_id = ? ORDER BY ordre',
  ).bind(repondantId).all<Omit<Tour, 'reponse'> & { reponse: string | null }>()
  return results.map(t => ({ ...t, reponse: t.reponse === null ? null : (JSON.parse(t.reponse) as Reponse) }))
}

function questionsDe(questionnaire: Questionnaire): Question[] {
  return (questionnaire.contenu as ContenuHybride).questions
}

function guideDe(questionnaire: Questionnaire): ContenuEntretien {
  return questionnaire.contenu as ContenuEntretien
}

function questionDeBase(questionnaire: Questionnaire, questionId: string | null): Question {
  const question = questionsDe(questionnaire).find(q => q.id === questionId)
  if (!question) throw new Error(`Question absente du questionnaire : ${questionId}`)
  return question
}

/**
 * Contexte du projet pour l'IA. Les colonnes sont choisies une à une : la note de cadrage,
 * la description et les documents ne sont jamais lus ici.
 */
async function lireContexte(db: D1Database, questionnaire: Questionnaire): Promise<ContexteEntretien> {
  const projet = await db.prepare('SELECT titre, resume_contexte FROM projets WHERE id = ?')
    .bind(questionnaire.projet_id).first<{ titre: string; resume_contexte: string }>()
  const { results } = await db.prepare(
    `SELECT l.nom FROM logiciels l JOIN projet_logiciels pl ON pl.logiciel_id = l.id
     WHERE pl.projet_id = ? ORDER BY l.nom COLLATE NOCASE`,
  ).bind(questionnaire.projet_id).all<{ nom: string }>()
  return {
    titre_projet: projet?.titre ?? '',
    public_vise: questionnaire.public_vise,
    logiciels: results.map(l => l.nom),
    resume_contexte: projet?.resume_contexte ?? '',
  }
}

// --- Écriture -------------------------------------------------------------------------------------

function estDoublonDeTour(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed:\s*tours\.repondant_id,\s*tours\.ordre/i.test(e.message)
}

/**
 * Pose une question au rang qui suit le dernier tour lu. Si deux calculs de la suite se croisent,
 * le second bute sur `UNIQUE (repondant_id, ordre)` : l'autre a déjà posé la question, on s'en tient là.
 */
async function insererTour(db: D1Database, repondantId: string, tours: Tour[], tour: NouveauTour): Promise<void> {
  const ordre = (tours.at(-1)?.ordre ?? 0) + 1
  try {
    await db.prepare(
      'INSERT INTO tours (id, repondant_id, ordre, question_id, type, question, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).bind(nouvelId(), repondantId, ordre, tour.question_id, tour.type, tour.question, maintenantIso()).run()
  } catch (e) {
    if (!estDoublonDeTour(e)) throw e
  }
}

/** Enregistre une réponse si la question attend encore la sienne ; faux si elle en avait déjà une. */
async function enregistrerReponse(db: D1Database, repondantId: string, ordre: number, reponse: Reponse): Promise<boolean> {
  const { meta } = await db.prepare(
    'UPDATE tours SET reponse = ? WHERE repondant_id = ? AND ordre = ? AND reponse IS NULL',
  ).bind(JSON.stringify(reponse), repondantId, ordre).run()
  return meta.changes > 0
}

/** Clôt l'entretien d'un répondant en cours ; sans effet s'il est déjà terminé. */
async function marquerTermine(db: D1Database, repondantId: string): Promise<void> {
  await db.prepare(
    "UPDATE repondants SET statut = 'termine', termine_le = ? WHERE id = ? AND statut = 'commence'",
  ).bind(maintenantIso(), repondantId).run()
}

/** Premier tour : première question en hybride, question d'ouverture en entretien. */
function premierTour(questionnaire: Questionnaire): NouveauTour {
  if (questionnaire.mode === 'entretien') {
    return { type: 'question', question_id: null, question: guideDe(questionnaire).question_ouverture }
  }
  const premiere = questionsDe(questionnaire)[0]
  return { type: 'question', question_id: premiere.id, question: premiere.libelle }
}

/** Tours de l'entretien, en posant la première question s'il n'a pas commencé. */
async function toursDemarres(db: D1Database, dossier: Dossier): Promise<Tour[]> {
  const tours = await lireTours(db, dossier.repondant.id)
  if (tours.length > 0) return tours
  await insererTour(db, dossier.repondant.id, tours, premierTour(dossier.questionnaire))
  return lireTours(db, dossier.repondant.id)
}

// --- Ce que voit le répondant ---------------------------------------------------------------------

function questionPublique(questionnaire: Questionnaire, tours: Tour[], tour: Tour): QuestionPublique {
  if (questionnaire.mode === 'entretien') return { ordre: tour.ordre, type: 'ouverte', libelle: tour.question }
  if (tour.type === 'relance') {
    const base = tours.find(t => t.type === 'question' && t.question_id === tour.question_id)
    return {
      ordre: tour.ordre, type: 'relance', libelle: tour.question,
      rappel: { question: base?.question ?? '', reponse: base?.reponse ? reponseEnTexte(base.reponse) : '' },
    }
  }
  const question = questionDeBase(questionnaire, tour.question_id)
  return {
    ordre: tour.ordre, type: question.type, libelle: tour.question,
    ...(question.options ? { options: question.options } : {}),
  }
}

function progression(questionnaire: Questionnaire, tours: Tour[]): Progression {
  if (questionnaire.mode === 'entretien') return {}
  const faites = tours.filter(t => t.type === 'question' && t.reponse !== null).length
  return { faites, total: questionsDe(questionnaire).length }
}

/** Étape du répondant ; démarre l'entretien s'il vient de commencer. */
async function calculerEtape(db: D1Database, dossier: Dossier): Promise<Etape> {
  const { repondant, questionnaire } = dossier
  if (repondant.statut === 'termine') return { type: 'termine' }
  if (questionnaire.statut === 'clos') return { type: 'clos' }
  if (repondant.statut === 'invite') return { type: 'identite' }
  const tours = await toursDemarres(db, dossier)
  const enAttente = tours.find(t => t.reponse === null)
  if (!enAttente) return { type: 'interrompu' }
  return {
    type: 'question',
    question: questionPublique(questionnaire, tours, enAttente),
    progression: progression(questionnaire, tours),
  }
}

function etatRepondant(dossier: Dossier, etape: Etape): EtatRepondant {
  const { repondant: r, questionnaire: q } = dossier
  return {
    questionnaire: { public_vise: q.public_vise, introduction: q.introduction, duree_estimee_min: q.duree_estimee_min, mode: q.mode },
    identite: { nom: r.nom, prenom: r.prenom, poste: r.poste, entreprise: r.entreprise, mail: r.mail },
    etape,
  }
}

// --- Calcul de la suite ---------------------------------------------------------------------------

/** Journalise une panne de l'IA sans rien du répondant : ni identité, ni texte de réponse. */
function journaliserErreurIa(e: ErreurIa, decision: 'relance' | 'tour', dossier: Dossier): void {
  const cause = e.cause as { name?: unknown; status?: unknown } | undefined
  console.error(`IA indisponible (${decision})`, {
    questionnaire_id: dossier.questionnaire.id,
    repondant_id: dossier.repondant.id,
    erreur: e.message,
    cause: typeof cause?.name === 'string' ? cause.name : undefined,
    statut: typeof cause?.status === 'number' ? cause.status : undefined,
  })
}

function echange(tour: TourRepondu): EchangeLu {
  return { question: tour.question, reponse: reponseEnTexte(tour.reponse) }
}

/** Relance proposée par l'IA, ou null : plafond atteint, refus de relancer, ou IA en panne. */
async function relanceProposee(
  db: D1Database, ia: Ia, dossier: Dossier, tours: TourRepondu[], question: Question,
): Promise<string | null> {
  const { questionnaire } = dossier
  const relancesTotal = tours.filter(t => t.type === 'relance').length
  const relancesIci = tours.filter(t => t.type === 'relance' && t.question_id === question.id)
  const restantes = Math.min(
    questionnaire.relances_max_par_question - relancesIci.length, questionnaire.tours_max - relancesTotal,
  )
  if (restantes <= 0) return null
  const base = tours.find(t => t.type === 'question' && t.question_id === question.id)!
  try {
    const decision = await ia.deciderRelance({
      contexte: await lireContexte(db, questionnaire),
      question,
      reponse: reponseEnTexte(base.reponse),
      relances: relancesIci.map(echange),
      relances_restantes: restantes,
    })
    return decision.relancer ? decision.question?.trim() || null : null
  } catch (e) {
    if (!(e instanceof ErreurIa)) throw e
    journaliserErreurIa(e, 'relance', dossier)
    return null
  }
}

/** Mode hybride : une relance si l'IA la juge utile, sinon la question suivante, sinon la fin. Ne lève pas sur panne de l'IA. */
async function suiteHybride(db: D1Database, ia: Ia, dossier: Dossier, tours: TourRepondu[]): Promise<void> {
  const { repondant, questionnaire } = dossier
  const question = questionDeBase(questionnaire, tours.at(-1)!.question_id)
  const relance = await relanceProposee(db, ia, dossier, tours, question)
  if (relance) {
    await insererTour(db, repondant.id, tours, { type: 'relance', question_id: question.id, question: relance })
    return
  }
  const questions = questionsDe(questionnaire)
  const suivante = questions[questions.findIndex(q => q.id === question.id) + 1]
  if (suivante) await insererTour(db, repondant.id, tours, { type: 'question', question_id: suivante.id, question: suivante.libelle })
  else await marquerTermine(db, repondant.id)
}

/** Mode entretien : l'IA choisit la question suivante ou la fin. Une panne de l'IA est journalisée puis remontée. */
async function suiteEntretien(db: D1Database, ia: Ia, dossier: Dossier, tours: TourRepondu[]): Promise<void> {
  const { repondant, questionnaire } = dossier
  if (tours.length >= questionnaire.tours_max) {
    await marquerTermine(db, repondant.id)
    return
  }
  const guide = guideDe(questionnaire)
  let decision
  try {
    decision = await ia.prochainTour({
      contexte: await lireContexte(db, questionnaire),
      question_ouverture: guide.question_ouverture,
      themes: guide.themes,
      historique: tours.map(echange),
      tours_restants: questionnaire.tours_max - tours.length,
    })
  } catch (e) {
    if (e instanceof ErreurIa) journaliserErreurIa(e, 'tour', dossier)
    throw e
  }
  const question = decision.question?.trim()
  if (decision.fin || !question) await marquerTermine(db, repondant.id)
  else await insererTour(db, repondant.id, tours, { type: 'question', question_id: null, question })
}

/** Pose la question suivante ou termine l'entretien, une fois toutes les questions posées répondues. */
async function calculerSuite(db: D1Database, ia: Ia, dossier: Dossier): Promise<void> {
  const tours = await lireTours(db, dossier.repondant.id)
  if (tours.length === 0 || tours.some(t => t.reponse === null)) return
  const repondus = tours as TourRepondu[]
  if (dossier.questionnaire.mode === 'hybride') await suiteHybride(db, ia, dossier, repondus)
  else await suiteEntretien(db, ia, dossier, repondus)
}

/** Calcule la suite ; une panne de l'IA laisse l'entretien « interrompu », que l'étape courante montrera. */
async function calculerSuiteSansPanne(db: D1Database, ia: Ia, dossier: Dossier): Promise<void> {
  try {
    await calculerSuite(db, ia, dossier)
  } catch (e) {
    if (!(e instanceof ErreurIa)) throw e
  }
}

// --- Points d'entrée ------------------------------------------------------------------------------

/** État du répondant et question à lui montrer. */
export async function etapeCourante(db: D1Database, jeton: string): Promise<EtatRepondant> {
  const dossier = await lireDossier(db, jeton)
  return etatRepondant(dossier, await calculerEtape(db, dossier))
}

function validerPour(questionnaire: Questionnaire, tour: Tour, reponse: Reponse): Reponse {
  const libre = questionnaire.mode === 'entretien' || tour.type === 'relance'
  return validerReponse(libre ? 'libre' : questionDeBase(questionnaire, tour.question_id), reponse)
}

/** Enregistre la réponse à la question `ordre`, puis pose la suivante. Un second envoi de la même réponse est sans effet. */
export async function repondre(
  db: D1Database, ia: Ia, jeton: string, ordre: number, reponse: Reponse,
): Promise<EtatRepondant> {
  const dossier = await lireDossier(db, jeton)
  if (dossier.repondant.statut === 'invite') throw new ErreurMetier("Indiquez d'abord vos coordonnées.", 409)
  if (dossier.questionnaire.statut === 'clos') throw new ErreurMetier('Ce questionnaire est clos.', 410)

  const tours = dossier.repondant.statut === 'termine'
    ? await lireTours(db, dossier.repondant.id)
    : await toursDemarres(db, dossier)
  const tour = tours.find(t => t.ordre === ordre)
  if (tour && tour.reponse !== null) return etapeCourante(db, jeton)
  if (!tour) throw new ErreurMetier("Cette question n'est plus d'actualité.", 409)

  const validee = validerPour(dossier.questionnaire, tour, reponse)
  // Si un envoi simultané a déjà enregistré la réponse, c'est lui qui calcule la suite.
  if (await enregistrerReponse(db, dossier.repondant.id, ordre, validee)) {
    await calculerSuiteSansPanne(db, ia, dossier)
  }
  return etapeCourante(db, jeton)
}

/** Après une interruption, refait le calcul de la suite ; sans effet à une autre étape. */
export async function relancerSuite(db: D1Database, ia: Ia, jeton: string): Promise<EtatRepondant> {
  const dossier = await lireDossier(db, jeton)
  const etape = await calculerEtape(db, dossier)
  if (etape.type !== 'interrompu') return etatRepondant(dossier, etape)
  await calculerSuiteSansPanne(db, ia, dossier)
  return etapeCourante(db, jeton)
}

/** Termine un entretien interrompu, à la demande du répondant. */
export async function terminer(db: D1Database, jeton: string): Promise<EtatRepondant> {
  const dossier = await lireDossier(db, jeton)
  const etape = await calculerEtape(db, dossier)
  if (etape.type === 'termine') return etatRepondant(dossier, etape)
  if (etape.type === 'clos') throw new ErreurMetier('Ce questionnaire est clos.', 410)
  if (etape.type !== 'interrompu') throw new ErreurMetier("L'entretien ne peut être terminé qu'après une interruption.", 409)
  // Le statut est contrôlé dans la requête, et aucune question ne doit attendre de réponse.
  await db.prepare(
    `UPDATE repondants SET statut = 'termine', termine_le = ?
     WHERE id = ? AND statut = 'commence' AND NOT EXISTS (SELECT 1 FROM tours WHERE repondant_id = ? AND reponse IS NULL)`,
  ).bind(maintenantIso(), dossier.repondant.id, dossier.repondant.id).run()
  return etapeCourante(db, jeton)
}
