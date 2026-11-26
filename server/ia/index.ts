import type { Env } from '../env'
import type { Questionnaire } from '../services/questionnaires'
import { lireRepondantParJeton } from '../services/repondants'
import { creerIaAnthropic } from './anthropic'
import { ErreurIa, type Ia } from './types'

let cleAbsenteSignalee = false

/** IA de repli sans clé : chaque décision échoue, et le service poursuit sans elle (relance omise, entretien interrompu). */
function iaIndisponible(): Ia {
  if (!cleAbsenteSignalee) {
    cleAbsenteSignalee = true
    console.error("ANTHROPIC_API_KEY absente : l'IA est indisponible pour les entretiens de cette instance.")
  }
  const refus = (): never => { throw new ErreurIa('Clé API Anthropic absente.') }
  return { deciderRelance: refus, prochainTour: refus }
}

/** Pour enregistrer le coût des appels : `context.waitUntil` de la route. */
type Attendre = (promesse: Promise<unknown>) => void

/** IA de l'entretien d'un questionnaire, avec le modèle d'interview de son projet ; coût compté sous `interview`. */
export async function iaPourQuestionnaire(
  env: Env, db: D1Database, questionnaire: Questionnaire, attendre?: Attendre,
): Promise<Ia> {
  if (!env.ANTHROPIC_API_KEY) return iaIndisponible()
  const projet = await db.prepare('SELECT modele_interview FROM projets WHERE id = ?')
    .bind(questionnaire.projet_id).first<{ modele_interview: string }>()
  if (!projet) return iaIndisponible()
  return creerIaAnthropic({
    cleApi: env.ANTHROPIC_API_KEY,
    modele: projet.modele_interview,
    suivi: { db, poste: 'interview', projet_id: questionnaire.projet_id, attendre },
  })
}

/** Même chose à partir du jeton du répondant ; un jeton inconnu donne la 404 « Lien invalide. » du service. */
export async function iaPourJeton(env: Env, jeton: string, attendre?: Attendre): Promise<Ia> {
  const { questionnaire } = await lireRepondantParJeton(env.DB, jeton)
  return iaPourQuestionnaire(env, env.DB, questionnaire, attendre)
}
