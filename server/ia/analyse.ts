import { LIMITES_ANALYSE, type EnteteFluxAnalyse, type SuccesAnalyse, type TypeAnalyse } from '../../shared/analyses'
import { lireCorps, parametre } from '../api'
import type { Env } from '../env'
import { ErreurMetier } from '../erreurs'
import { consigneSansOutils } from '../guides'
import { erreur } from '../http'
import { schemaDemandeAnalyse } from '../schemas'
import { enregistrerAnalyse } from '../services/analyses'
import { construireCorpus, enteteAnalyse } from '../services/corpus'
import { lireProjet } from '../services/projets'
import { caracteres } from '../texte'
import { genererTexte, type FinTexte, type GenerationTexte } from './appel'
import { repondreEnFlux, type ReglagesFlux } from './flux'
import type { Suivi } from './suivi'
import { ErreurIa } from './types'

// ─── Génération par l'API ────────────────────────────────────────────────────

/** Une synthèse d'un projet entier tient largement dans cette borne ; au-delà, la réponse est enregistrée tronquée. */
export const JETONS_MAX_ANALYSE = 32_000

export interface OptionsAnalyse {
  cleApi: string
  /** Modèle d'analyse du projet ; transmis tel quel. */
  modele: string
  consigne: string
  message: string
  /** Pour les tests : remplace l'accès réseau. */
  fetch?: typeof globalThis.fetch
  /** Coût de l'appel, sous le poste `analyse`. */
  suivi?: Suivi
}

export type FinAnalyse = FinTexte
export type GenerationAnalyse = GenerationTexte
export type GenerateurAnalyse = (options: OptionsAnalyse) => GenerationAnalyse

/**
 * Analyse produite par l'API Messages, en flux (module commun `server/ia/appel.ts`). Effort élevé, sans paramètre
 * `thinking`, consigne en texte simple : les entretiens sont dans le message, rien n'est à mettre en cache.
 * Une erreur en cours de route est levée pendant le parcours (ErreurIa) ; le texte déjà transmis n'est pas repris.
 */
export function genererAnalyse(options: OptionsAnalyse): GenerationAnalyse {
  return genererTexte({
    cleApi: options.cleApi,
    modele: options.modele,
    consigne: options.consigne,
    messages: [{ role: 'user', content: options.message }],
    maxTokens: JETONS_MAX_ANALYSE,
    effort: 'high',
    fetch: options.fetch,
    suivi: options.suivi,
  }, {
    duree: 'Analyse abandonnée : la génération a dépassé 10 minutes.',
    impossible: "Génération de l'analyse impossible.",
  })
}

// ─── Consigne et message ─────────────────────────────────────────────────────

/** Guide de l'étape, sans sa section sur les outils MCP, que l'analyse par l'API n'a pas. */
export function consigneAnalyse(type: TypeAnalyse): string {
  return consigneSansOutils(type)
}

const DEMANDES: Record<TypeAnalyse, string> = {
  fiche_repondant: 'Rédige la fiche de ce répondant',
  synthese: 'Rédige la synthèse de ces entretiens',
  expression_besoin: "Rédige l'expression de besoin tirée de ces entretiens",
}

/** En-tête du projet puis entretiens, chacun sous son titre, et la demande en dernier. */
export function messageAnalyse(type: TypeAnalyse, entete: string, corpus: string, nbEntretiens: number): string {
  return [
    '# Contexte du projet',
    '',
    entete.trimEnd(),
    '',
    `# Entretiens (${nbEntretiens} ${nbEntretiens > 1 ? 'entretiens' : 'entretien'})`,
    '',
    corpus.trimEnd(),
    '',
    '---',
    '',
    `${DEMANDES[type]}, en suivant la consigne. Écris directement le document, en Markdown, sans préambule ni question : il est enregistré tel quel, et l'équipe le relira ensuite.`,
  ].join('\n')
}

// ─── Route : POST /api/admin/projets/:id/analyses ────────────────────────────

export const MENTION_TRONQUEE = '\n\n*(Analyse interrompue : longueur maximale atteinte.)*'

const SANS_CLE = "Analyse par l'API indisponible : clé non configurée. Utilisez Claude avec le connecteur MCP."

function enMilliers(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** Message de la ligne d'erreur (mis sur une ligne par le flux commun). */
function messageLisible(e: unknown): string {
  return e instanceof ErreurIa ? e.message
    : e instanceof ErreurMetier ? `L'analyse a été produite mais n'a pas pu être enregistrée : ${e.message}`
      : "Erreur interne : l'analyse n'a pas été enregistrée."
}

/**
 * Lance une analyse et répond aussitôt avec le flux commun (`server/ia/flux.ts`, contrat dans `shared/flux.ts`) :
 * l'en-tête porte le nombre d'entretiens, la ligne de succès l'identifiant de l'analyse enregistrée.
 *
 * La génération ne dépend pas du navigateur : elle se poursuit si l'onglet est fermé, et l'analyse est
 * enregistrée à la fin.
 */
export async function repondreAnalyse(
  contexte: EventContext<Env, 'id', Record<string, unknown>>,
  generer: GenerateurAnalyse = genererAnalyse,
  reglages: ReglagesFlux = {},
): Promise<Response> {
  const { request, env, params } = contexte
  const projetId = parametre(params.id)
  const demande = await lireCorps(request, schemaDemandeAnalyse)
  if (demande.type === 'fiche_repondant' && !demande.repondant_id) {
    throw new ErreurMetier('Une fiche de répondant se rattache à un répondant.')
  }
  if (demande.type !== 'fiche_repondant' && demande.repondant_id) {
    throw new ErreurMetier('Seule une fiche de répondant se rattache à un répondant.')
  }
  const cleApi = env.ANTHROPIC_API_KEY
  if (!cleApi) return erreur(SANS_CLE, 503)

  const projet = await lireProjet(env.DB, projetId)
  const corpus = await construireCorpus(env.DB, {
    projet_id: projetId,
    questionnaire_id: demande.questionnaire_id,
    repondant_id: demande.repondant_id,
    inclure_en_cours: demande.inclure_en_cours,
  })
  if (corpus.nb_entretiens === 0) throw new ErreurMetier('Aucun entretien à analyser pour cette portée.')
  const taille = caracteres(corpus.texte).length
  if (taille > LIMITES_ANALYSE.corpus_api) {
    throw new ErreurMetier(
      `Trop d'entretiens pour une analyse par l'API : ${enMilliers(taille)} caractères, pour ${enMilliers(LIMITES_ANALYSE.corpus_api)} au plus. `
      + "Analysez questionnaire par questionnaire, ou demandez l'analyse à Claude avec le connecteur MCP, qui lit les entretiens par morceaux.",
      413,
    )
  }
  const modele = projet.modele_analyse
  const options: OptionsAnalyse = {
    cleApi,
    modele,
    consigne: consigneAnalyse(demande.type),
    message: messageAnalyse(demande.type, await enteteAnalyse(env.DB, projetId), corpus.texte, corpus.nb_entretiens),
    suivi: { db: env.DB, poste: 'analyse', projet_id: projetId, attendre: p => contexte.waitUntil(p) },
  }

  const entete: Omit<EnteteFluxAnalyse, 'controle'> = { nb_entretiens: corpus.nb_entretiens }
  return repondreEnFlux(contexte, {
    journal: "Analyse par l'API",
    entete,
    messageErreur: messageLisible,
    reglages,
    produire: async (ecrire): Promise<SuccesAnalyse> => {
      const generation = generer(options)
      for await (const morceau of generation) ecrire(morceau)
      const { texte, tronquee, refusee } = await generation.fin()
      if (refusee) throw new ErreurIa("L'IA a refusé de produire cette analyse ; rien n'a été enregistré.")
      if (!texte.trim()) throw new ErreurIa("L'IA n'a produit aucun texte ; rien n'a été enregistré.")
      let contenu = texte
      if (tronquee) {
        ecrire(MENTION_TRONQUEE)
        contenu += MENTION_TRONQUEE
      }
      const analyse = await enregistrerAnalyse(env.DB, {
        projet_id: projetId,
        type: demande.type,
        contenu,
        source: modele,
        questionnaire_id: demande.questionnaire_id,
        repondant_id: demande.repondant_id,
        nb_entretiens: corpus.nb_entretiens,
      })
      return { analyse_id: analyse.id }
    },
  })
}
