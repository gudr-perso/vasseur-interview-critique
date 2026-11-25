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

// Déroulé d'un entretien. L'état vit en base : chaque question posée est une ligne de `tours`, dont la
// réponse reste vide tant que le répondant n'a pas répondu, et le calcul de la suite (question suivante,
// relance ou fin) est suivi par les colonnes `suite_*` du répondant. Il y a au plus un tour en attente.
// Sans tour en attente, un entretien en cours prépare sa suite (`suite_debut` récent) ou l'a ratée.
//
// Le calcul de la suite se fait sous « la main » : un horodatage posé dans `suite_debut` par une écriture
// conditionnelle, que seul un calcul à la fois obtient. Un second envoi, une reprise ou une fin demandée
// pendant ce temps voient l'étape « attente » au lieu de lancer un second appel à l'IA.

/** Au-delà, un calcul est tenu pour abandonné (l'appel à l'IA dure une trentaine de secondes au plus). */
const CALCUL_EXPIRE_MS = 60_000
/** Nouveaux essais permis pour une même étape, après l'échec du premier calcul. */
const REESSAIS_MAX = 3
/** Écart minimal entre le début de deux essais. */
const REESSAI_ECART_MS = 10_000

const MSG_TROP_TOT = 'Patientez quelques secondes avant de réessayer.'
const MSG_REESSAIS_EPUISES = "Le problème persiste. Vos réponses sont enregistrées : vous pouvez terminer l'entretien."
const MSG_EN_PREPARATION = 'La question suivante est en préparation : patientez un instant.'

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

/** Calcul de la suite, d'après les colonnes `suite_*` du répondant. */
interface Suite {
  debut: string | null
  essais: number
  essai_le: string | null
}

/** Tours et calcul de la suite, lus ensemble pour être cohérents entre eux. */
interface Situation {
  tours: Tour[]
  suite: Suite
}

/** Horodatage ISO d'il y a `ms` millisecondes, comparable aux colonnes `*_le` et `suite_*`. */
function ilYa(ms: number): string {
  return new Date(Date.now() - ms).toISOString()
}

function calculEnCours(suite: Suite): boolean {
  return suite.debut !== null && suite.debut >= ilYa(CALCUL_EXPIRE_MS)
}

/** Le premier calcul compte pour un essai : `essais` vaut au plus REESSAIS_MAX + 1. */
function reessaiPossible(suite: Suite): boolean {
  return suite.essais <= REESSAIS_MAX
}

/** Fragment SQL : aucun calcul de la suite en cours (ou un calcul abandonné). Un paramètre : `ilYa(CALCUL_EXPIRE_MS)`. */
const SANS_CALCUL = '(suite_debut IS NULL OR suite_debut < ?)'

// --- Lecture --------------------------------------------------------------------------------------

async function lireDossier(db: D1Database, jeton: string): Promise<Dossier> {
  return lireRepondantParJeton(db, jeton)
}

type LigneTour = Omit<Tour, 'reponse'> & { reponse: string | null }

const SQL_TOURS = 'SELECT ordre, type, question_id, question, reponse FROM tours WHERE repondant_id = ? ORDER BY ordre'

function versTours(lignes: LigneTour[]): Tour[] {
  return lignes.map(t => ({ ...t, reponse: t.reponse === null ? null : (JSON.parse(t.reponse) as Reponse) }))
}

async function lireTours(db: D1Database, repondantId: string): Promise<Tour[]> {
  const { results } = await db.prepare(SQL_TOURS).bind(repondantId).all<LigneTour>()
  return versTours(results)
}

/** Tours et état du calcul de la suite, dans une même transaction. */
async function lireSituation(db: D1Database, repondantId: string): Promise<Situation> {
  const [tours, suite] = await db.batch([
    db.prepare(SQL_TOURS).bind(repondantId),
    db.prepare('SELECT suite_debut, suite_essais, suite_essai_le FROM repondants WHERE id = ?').bind(repondantId),
  ])
  const ligne = (suite.results as { suite_debut: string | null; suite_essais: number; suite_essai_le: string | null }[])[0]
  if (!ligne) throw lienInvalide()
  return {
    tours: versTours(tours.results as LigneTour[]),
    suite: { debut: ligne.suite_debut, essais: ligne.suite_essais, essai_le: ligne.suite_essai_le },
  }
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

function lienInvalide(): ErreurMetier {
  return new ErreurMetier('Lien invalide.', 404)
}

function estDoublonDeTour(e: unknown): boolean {
  return e instanceof Error && /UNIQUE constraint failed:\s*tours\.repondant_id,\s*tours\.ordre/i.test(e.message)
}

function estCleEtrangere(e: unknown): boolean {
  return e instanceof Error && /FOREIGN KEY constraint failed/i.test(e.message)
}

/** Insertion d'un tour au rang qui suit le dernier tour lu, si le répondant est encore en cours. */
function instructionTour(db: D1Database, repondantId: string, tours: Tour[], tour: NouveauTour): D1PreparedStatement {
  const ordre = (tours.at(-1)?.ordre ?? 0) + 1
  return db.prepare(
    `INSERT INTO tours (id, repondant_id, ordre, question_id, type, question, cree_le)
     SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM repondants WHERE id = ? AND statut = 'commence')`,
  ).bind(nouvelId(), repondantId, ordre, tour.question_id, tour.type, tour.question, maintenantIso(), repondantId)
}

/**
 * Exécute l'insertion d'un tour (et ce qui l'accompagne). Si deux calculs se croisent malgré la main,
 * le second bute sur `UNIQUE (repondant_id, ordre)` : l'autre a déjà posé la question, on s'en tient là.
 * Un répondant supprimé entre-temps donne « Lien invalide », comme à la lecture.
 */
async function executerInsertion(db: D1Database, instructions: D1PreparedStatement[]): Promise<void> {
  try {
    await db.batch(instructions)
  } catch (e) {
    if (estCleEtrangere(e)) throw lienInvalide()
    if (!estDoublonDeTour(e)) throw e
  }
}

/** Pose la question suivante et rend la main, d'un bloc : la question n'est visible qu'une fois la main rendue. */
async function poserEtRendre(db: D1Database, repondantId: string, tours: Tour[], tour: NouveauTour, debut: string): Promise<void> {
  await executerInsertion(db, [
    instructionTour(db, repondantId, tours, tour),
    db.prepare('UPDATE repondants SET suite_debut = NULL, suite_essais = 0 WHERE id = ? AND suite_debut = ?')
      .bind(repondantId, debut),
  ])
}

/** Clôt l'entretien d'un répondant en cours (et rend la main) ; sans effet s'il est déjà terminé. */
async function marquerTermine(db: D1Database, repondantId: string): Promise<void> {
  await db.prepare(
    `UPDATE repondants SET statut = 'termine', termine_le = ?, suite_debut = NULL, suite_essais = 0
     WHERE id = ? AND statut = 'commence'`,
  ).bind(maintenantIso(), repondantId).run()
}

/** Rend la main sans avoir posé de suite ; un échec compte un essai de plus pour l'étape. */
async function rendreLaMain(db: D1Database, repondantId: string, debut: string, echec: boolean): Promise<void> {
  await db.prepare(
    'UPDATE repondants SET suite_debut = NULL, suite_essais = suite_essais + ? WHERE id = ? AND suite_debut = ?',
  ).bind(echec ? 1 : 0, repondantId, debut).run()
}

/**
 * Enregistre la réponse à la question `ordre` et prend la main pour calculer la suite, d'un bloc.
 * Renvoie l'horodatage de la main, ou null si la question avait déjà sa réponse ou qu'un calcul est en cours.
 */
async function repondreEtPrendreLaMain(
  db: D1Database, repondantId: string, ordre: number, reponse: Reponse,
): Promise<string | null> {
  const debut = maintenantIso()
  const [prise] = await db.batch([
    db.prepare(
      `UPDATE repondants SET suite_debut = ?, suite_essai_le = ?, suite_essais = 0
       WHERE id = ? AND statut = 'commence' AND ${SANS_CALCUL}
         AND EXISTS (SELECT 1 FROM tours WHERE repondant_id = ? AND ordre = ? AND reponse IS NULL)`,
    ).bind(debut, debut, repondantId, ilYa(CALCUL_EXPIRE_MS), repondantId, ordre),
    db.prepare(
      `UPDATE tours SET reponse = ? WHERE repondant_id = ? AND ordre = ? AND reponse IS NULL
         AND EXISTS (SELECT 1 FROM repondants WHERE id = ? AND suite_debut = ?)`,
    ).bind(JSON.stringify(reponse), repondantId, ordre, repondantId, debut),
  ])
  return prise.meta.changes > 0 ? debut : null
}

/** Prend la main pour un nouvel essai, dans les limites du nombre d'essais et de leur espacement. */
async function prendreLaMainPourReessai(db: D1Database, repondantId: string): Promise<string | null> {
  const debut = maintenantIso()
  const { meta } = await db.prepare(
    `UPDATE repondants SET suite_debut = ?, suite_essai_le = ?
     WHERE id = ? AND statut = 'commence' AND ${SANS_CALCUL}
       AND suite_essais <= ? AND (suite_essai_le IS NULL OR suite_essai_le <= ?)
       AND NOT EXISTS (SELECT 1 FROM tours WHERE repondant_id = ? AND reponse IS NULL)`,
  ).bind(debut, debut, repondantId, ilYa(CALCUL_EXPIRE_MS), REESSAIS_MAX, ilYa(REESSAI_ECART_MS), repondantId).run()
  return meta.changes > 0 ? debut : null
}

/** Premier tour : première question en hybride, question d'ouverture en entretien. */
function premierTour(questionnaire: Questionnaire): NouveauTour {
  if (questionnaire.mode === 'entretien') {
    return { type: 'question', question_id: null, question: guideDe(questionnaire).question_ouverture }
  }
  const premiere = questionsDe(questionnaire)[0]
  return { type: 'question', question_id: premiere.id, question: premiere.libelle }
}

/** Situation de l'entretien, en posant la première question s'il n'a pas commencé. */
async function situationDemarree(db: D1Database, dossier: Dossier): Promise<Situation> {
  const situation = await lireSituation(db, dossier.repondant.id)
  if (situation.tours.length > 0) return situation
  await executerInsertion(db, [instructionTour(db, dossier.repondant.id, [], premierTour(dossier.questionnaire))])
  return lireSituation(db, dossier.repondant.id)
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

/** Étape d'un entretien en cours, d'après sa situation. */
function etapeEnCours(questionnaire: Questionnaire, { tours, suite }: Situation): Etape {
  const enAttente = tours.find(t => t.reponse === null)
  if (!enAttente) {
    if (calculEnCours(suite)) return { type: 'attente' }
    return { type: 'interrompu', reessai_possible: reessaiPossible(suite) }
  }
  return {
    type: 'question',
    question: questionPublique(questionnaire, tours, enAttente),
    progression: progression(questionnaire, tours),
  }
}

/** Étape du répondant ; démarre l'entretien s'il vient de commencer. */
async function calculerEtape(db: D1Database, dossier: Dossier): Promise<Etape> {
  const { repondant, questionnaire } = dossier
  if (repondant.statut === 'termine') return { type: 'termine' }
  if (questionnaire.statut === 'clos') return { type: 'clos' }
  if (repondant.statut === 'invite') return { type: 'identite' }
  return etapeEnCours(questionnaire, await situationDemarree(db, dossier))
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
async function suiteHybride(db: D1Database, ia: Ia, dossier: Dossier, tours: TourRepondu[], debut: string): Promise<void> {
  const { repondant, questionnaire } = dossier
  const question = questionDeBase(questionnaire, tours.at(-1)!.question_id)
  const relance = await relanceProposee(db, ia, dossier, tours, question)
  if (relance) {
    await poserEtRendre(db, repondant.id, tours, { type: 'relance', question_id: question.id, question: relance }, debut)
    return
  }
  const questions = questionsDe(questionnaire)
  const suivante = questions[questions.findIndex(q => q.id === question.id) + 1]
  if (suivante) await poserEtRendre(db, repondant.id, tours, { type: 'question', question_id: suivante.id, question: suivante.libelle }, debut)
  else await marquerTermine(db, repondant.id)
}

/** Mode entretien : l'IA choisit la question suivante ou la fin. Une panne de l'IA est journalisée puis remontée. */
async function suiteEntretien(db: D1Database, ia: Ia, dossier: Dossier, tours: TourRepondu[], debut: string): Promise<void> {
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
  else await poserEtRendre(db, repondant.id, tours, { type: 'question', question_id: null, question }, debut)
}

/** Pose la question suivante ou termine l'entretien, une fois toutes les questions posées répondues. Rend la main. */
async function calculerSuite(db: D1Database, ia: Ia, dossier: Dossier, debut: string): Promise<void> {
  const tours = await lireTours(db, dossier.repondant.id)
  if (tours.length === 0 || tours.some(t => t.reponse === null)) {
    await rendreLaMain(db, dossier.repondant.id, debut, false)
    return
  }
  const repondus = tours as TourRepondu[]
  if (dossier.questionnaire.mode === 'hybride') await suiteHybride(db, ia, dossier, repondus, debut)
  else await suiteEntretien(db, ia, dossier, repondus, debut)
}

/**
 * Calcule la suite sous la main obtenue à `debut`. Un échec rend la main en comptant un essai :
 * une panne de l'IA laisse l'entretien « interrompu », que l'étape courante montrera ; toute autre erreur remonte.
 */
async function calculerSuiteSousLaMain(db: D1Database, ia: Ia, dossier: Dossier, debut: string): Promise<void> {
  try {
    await calculerSuite(db, ia, dossier, debut)
  } catch (e) {
    await rendreLaMain(db, dossier.repondant.id, debut, true)
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

/**
 * Enregistre la réponse à la question `ordre`, puis pose la suivante. Un second envoi de la même réponse
 * est sans effet : il renvoie l'étape courante, « attente » si le premier calcule encore la suite.
 */
export async function repondre(
  db: D1Database, ia: Ia, jeton: string, ordre: number, reponse: Reponse,
): Promise<EtatRepondant> {
  const dossier = await lireDossier(db, jeton)
  if (dossier.repondant.statut === 'invite') throw new ErreurMetier("Indiquez d'abord vos coordonnées.", 409)
  if (dossier.questionnaire.statut === 'clos') throw new ErreurMetier('Ce questionnaire est clos.', 410)

  const tours = dossier.repondant.statut === 'termine'
    ? await lireTours(db, dossier.repondant.id)
    : (await situationDemarree(db, dossier)).tours
  const tour = tours.find(t => t.ordre === ordre)
  if (tour && tour.reponse !== null) return etapeCourante(db, jeton)
  if (!tour) throw new ErreurMetier("Cette question n'est plus d'actualité.", 409)

  const validee = validerPour(dossier.questionnaire, tour, reponse)
  const debut = await repondreEtPrendreLaMain(db, dossier.repondant.id, ordre, validee)
  // Sans la main, un envoi simultané a déjà enregistré la réponse : c'est lui qui calcule la suite.
  if (debut) await calculerSuiteSousLaMain(db, ia, dossier, debut)
  return etapeCourante(db, jeton)
}

/**
 * Après une interruption, refait le calcul de la suite ; sans effet à une autre étape. Les nouveaux essais
 * sont limités en nombre et espacés : au-delà, 429, et le répondant ne peut plus que terminer.
 */
export async function relancerSuite(db: D1Database, ia: Ia, jeton: string): Promise<EtatRepondant> {
  const dossier = await lireDossier(db, jeton)
  const etape = await calculerEtape(db, dossier)
  if (etape.type !== 'interrompu') return etatRepondant(dossier, etape)
  if (!etape.reessai_possible) throw new ErreurMetier(MSG_REESSAIS_EPUISES, 429)

  const debut = await prendreLaMainPourReessai(db, dossier.repondant.id)
  if (!debut) {
    // Un autre essai vient de commencer ou de finir, ou le précédent est trop récent.
    const etat = await etapeCourante(db, jeton)
    if (etat.etape.type !== 'interrompu') return etat
    throw new ErreurMetier(etat.etape.reessai_possible ? MSG_TROP_TOT : MSG_REESSAIS_EPUISES, 429)
  }
  await calculerSuiteSousLaMain(db, ia, dossier, debut)
  return etapeCourante(db, jeton)
}

/** Termine un entretien interrompu, à la demande du répondant ; refusé pendant le calcul de la suite. */
export async function terminer(db: D1Database, jeton: string): Promise<EtatRepondant> {
  const dossier = await lireDossier(db, jeton)
  const etape = await calculerEtape(db, dossier)
  if (etape.type === 'termine') return etatRepondant(dossier, etape)
  if (etape.type === 'clos') throw new ErreurMetier('Ce questionnaire est clos.', 410)
  if (etape.type === 'attente') throw new ErreurMetier(MSG_EN_PREPARATION, 409)
  if (etape.type !== 'interrompu') throw new ErreurMetier("L'entretien ne peut être terminé qu'après une interruption.", 409)
  // Statut, calcul en cours et question en attente sont contrôlés dans la requête.
  const { meta } = await db.prepare(
    `UPDATE repondants SET statut = 'termine', termine_le = ?, suite_debut = NULL, suite_essais = 0
     WHERE id = ? AND statut = 'commence' AND ${SANS_CALCUL}
       AND NOT EXISTS (SELECT 1 FROM tours WHERE repondant_id = ? AND reponse IS NULL)`,
  ).bind(maintenantIso(), dossier.repondant.id, ilYa(CALCUL_EXPIRE_MS), dossier.repondant.id).run()
  const etat = await etapeCourante(db, jeton)
  if (meta.changes === 0 && etat.etape.type !== 'termine') throw new ErreurMetier(MSG_EN_PREPARATION, 409)
  return etat
}
