import Anthropic from '@anthropic-ai/sdk'
import {
  LIMITES_ANALYSE, ligneDeControle, type ControleFluxAnalyse, type EnteteFluxAnalyse, type TypeAnalyse,
} from '../../shared/analyses'
import { lireCorps, parametre } from '../api'
import type { Env } from '../env'
import { ErreurMetier } from '../erreurs'
import { lireGuide } from '../guides'
import { erreur } from '../http'
import { schemaDemandeAnalyse } from '../schemas'
import { enregistrerAnalyse } from '../services/analyses'
import { construireCorpus, enteteAnalyse } from '../services/corpus'
import { lireProjet } from '../services/projets'
import { caracteres } from '../texte'
import { ErreurIa } from './types'

// ─── Génération par l'API ────────────────────────────────────────────────────

/** Une synthèse d'un projet entier tient largement dans cette borne ; au-delà, la réponse est enregistrée tronquée. */
export const JETONS_MAX_ANALYSE = 32_000
/**
 * Délai laissé à l'API pour commencer à répondre. Le SDK ne l'applique que jusqu'à l'arrivée des en-têtes :
 * une fois le flux ouvert, seule la durée maximale ci-dessous le borne.
 */
const DELAI_REPONSE_MS = 5 * 60_000
/** Une analyse prend une à trois minutes ; au-delà de cette durée, le flux est abandonné. */
const DUREE_MAX_MS = 10 * 60_000
/** Le SDK ne refait un essai qu'avant le début du flux (erreur de connexion, 429, 5xx) ; jamais en cours de texte. */
const NOUVEAUX_ESSAIS_AVANT_FLUX = 1

export interface OptionsAnalyse {
  cleApi: string
  /** Modèle d'analyse du projet ; transmis tel quel. */
  modele: string
  consigne: string
  message: string
  /** Pour les tests : remplace l'accès réseau. */
  fetch?: typeof globalThis.fetch
}

export interface FinAnalyse {
  texte: string
  /** Longueur maximale atteinte : le texte s'arrête en cours de route. */
  tronquee: boolean
  /** Le modèle a refusé de produire l'analyse. */
  refusee: boolean
}

/** Morceaux de texte au fil de l'eau ; `fin()` se lit une fois le parcours terminé. */
export interface GenerationAnalyse extends AsyncIterable<string> {
  fin(): Promise<FinAnalyse>
}

export type GenerateurAnalyse = (options: OptionsAnalyse) => GenerationAnalyse

function refusEffort(e: unknown): boolean {
  return e instanceof Anthropic.BadRequestError && /effort/i.test(e.message)
}

function versErreurIa(e: unknown, dureeDepassee: boolean): ErreurIa {
  if (e instanceof ErreurIa) return e
  if (dureeDepassee) return new ErreurIa(`Analyse abandonnée : la génération a dépassé ${DUREE_MAX_MS / 60_000} minutes.`, e)
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return new ErreurIa(`L'API Anthropic n'a pas commencé à répondre en ${DELAI_REPONSE_MS / 60_000} minutes.`, e)
  }
  if (e instanceof Anthropic.APIError && e.status) {
    return new ErreurIa(`Appel à l'API Anthropic impossible (erreur ${e.status}).`, e)
  }
  if (e instanceof Anthropic.APIError) {
    return new ErreurIa("L'API Anthropic a interrompu la génération. Réessayez dans quelques minutes.", e)
  }
  return new ErreurIa("Génération de l'analyse impossible.", e)
}

/**
 * Analyse produite par l'API Messages, en flux (`messages.stream`). Effort élevé, sans paramètre `thinking`.
 * Une erreur en cours de route est levée pendant le parcours (ErreurIa) ; le texte déjà transmis n'est pas repris.
 */
export function genererAnalyse(options: OptionsAnalyse): GenerationAnalyse {
  const client = new Anthropic({
    apiKey: options.cleApi, timeout: DELAI_REPONSE_MS, maxRetries: NOUVEAUX_ESSAIS_AVANT_FLUX, fetch: options.fetch,
  })
  let tenir!: (fin: FinAnalyse) => void
  let rompre!: (e: ErreurIa) => void
  let reglee = false
  const fin = new Promise<FinAnalyse>((resoudre, rejeter) => {
    tenir = f => { reglee = true; resoudre(f) }
    rompre = e => { reglee = true; rejeter(e) }
  })
  // Le rejet est aussi levé pendant le parcours : qui ne demande pas fin() n'a pas à le traiter une seconde fois.
  fin.catch(() => {})

  const ouvrir = (avecEffort: boolean) => client.messages.stream({
    model: options.modele,
    max_tokens: JETONS_MAX_ANALYSE,
    system: options.consigne,
    messages: [{ role: 'user', content: options.message }],
    ...(avecEffort ? { output_config: { effort: 'high' as const } } : {}),
  })

  async function* morceaux(): AsyncGenerator<string> {
    let texte = ''
    let flux: ReturnType<typeof ouvrir> | undefined
    let dureeDepassee = false
    const limite = setTimeout(() => { dureeDepassee = true; flux?.abort() }, DUREE_MAX_MS)
    try {
      for (const avecEffort of [true, false]) {
        flux = ouvrir(avecEffort)
        try {
          for await (const evenement of flux) {
            if (evenement.type === 'content_block_delta' && evenement.delta.type === 'text_delta') {
              texte += evenement.delta.text
              yield evenement.delta.text
            }
          }
          // Une erreur survenue après le dernier événement lu n'est pas levée par le parcours : finalMessage la lève.
          const message = await flux.finalMessage()
          tenir({ texte, tronquee: message.stop_reason === 'max_tokens', refusee: message.stop_reason === 'refusal' })
          return
        } catch (e) {
          // Un modèle plus ancien choisi dans l'admin peut refuser le réglage d'effort : l'appel est refait, rien n'a été transmis.
          if (avecEffort && texte === '' && refusEffort(e)) continue
          throw e
        }
      }
    } catch (e) {
      const erreurIa = versErreurIa(e, dureeDepassee)
      rompre(erreurIa)
      throw erreurIa
    } finally {
      clearTimeout(limite)
      if (!reglee) rompre(new ErreurIa('Génération abandonnée avant la fin.'))
    }
  }

  return {
    [Symbol.asyncIterator]: () => morceaux(),
    fin: () => fin,
  }
}

// ─── Consigne et message ─────────────────────────────────────────────────────

const SECTION_OUTILS = '\n## Avec les outils'

/** Guide de l'étape, sans sa dernière section : elle décrit les outils MCP, que l'analyse par l'API n'a pas. */
export function consigneAnalyse(type: TypeAnalyse): string {
  const guide = lireGuide(type)
  const position = guide.lastIndexOf(SECTION_OUTILS)
  if (position < 0 || guide.indexOf('\n## ', position + 1) >= 0) {
    throw new Error(`Le guide « ${type} » doit finir par la section « Avec les outils ».`)
  }
  return guide.slice(0, position).trimEnd()
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
/** Sans aucun envoi pendant cette durée, un signal de vie part : Cloudflare coupe une réponse muette vers 100 s. */
export const INTERVALLE_VIE_MS = 15_000
/** Au-delà, l'en-tête non lu est signalé dans les journaux : quelque chose retient le flux en route. */
const DELAI_ENTETE_MS = 10_000

const SANS_CLE = "Analyse par l'API indisponible : clé non configurée. Utilisez Claude avec le connecteur MCP."

function enMilliers(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function messageLisible(e: unknown): string {
  const brut = e instanceof ErreurIa ? e.message
    : e instanceof ErreurMetier ? `L'analyse a été produite mais n'a pas pu être enregistrée : ${e.message}`
      : "Erreur interne : l'analyse n'a pas été enregistrée."
  return brut.replace(/\s+/g, ' ').trim()
}

/** Séparateur des lignes de contrôle : tiré au hasard, jamais montré au modèle, qui ne peut donc pas l'écrire. */
function nouveauSeparateur(): string {
  const octets = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(octets, o => o.toString(16).padStart(2, '0')).join('')
}

export interface ReglagesFlux {
  /** Pour les tests : intervalle du signal de vie. */
  intervalleVieMs?: number
}

/**
 * Lance une analyse et répond aussitôt avec un flux `text/plain` dont le contrat est décrit dans
 * `shared/analyses.ts` : en-tête JSON avec le séparateur, texte au fil de l'eau, lignes de contrôle
 * (signal de vie, puis succès avec l'identifiant de l'analyse enregistrée, ou erreur).
 *
 * La génération ne dépend pas du navigateur : elle est conduite par une tâche confiée à `waitUntil`, qui écrit
 * chaque morceau dans le flux sans jamais attendre qu'il soit lu, et enregistre l'analyse à la fin.
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
  }

  // Flux d'identité : c'est la forme que le moteur des Workers transmet morceau par morceau. Avec les stratégies
  // par défaut, la promesse d'une écriture n'est tenue qu'une fois le morceau lu par le moteur, c'est-à-dire
  // parti vers le navigateur : elle sert à vérifier que l'en-tête est réellement transmis.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const ecrivain = writable.getWriter()
  const encodeur = new TextEncoder()
  const separateur = nouveauSeparateur()
  const intervalleVie = reglages.intervalleVieMs ?? INTERVALLE_VIE_MS
  let navigateurParti = false
  let minuterieVie: ReturnType<typeof setTimeout> | undefined

  // Les écritures ne sont jamais attendues par la génération : sans lecteur, les morceaux s'accumulent en mémoire
  // (32 000 jetons au plus), et la génération continue au rythme de l'API, pas à celui du navigateur.
  const ecrire = (texte: string): Promise<void> => {
    if (navigateurParti) return Promise.resolve()
    armerVie()
    return ecrivain.write(encodeur.encode(texte)).catch(() => { navigateurParti = true })
  }
  const controler = (controle: ControleFluxAnalyse) => ecrire(ligneDeControle(separateur, controle))
  // Après `intervalleVie` sans aucun envoi, un signal de vie ; il se réarme à chaque envoi.
  function armerVie() {
    clearTimeout(minuterieVie)
    minuterieVie = setTimeout(() => { void controler({ type: 'vie' }) }, intervalleVie)
  }

  const entete: EnteteFluxAnalyse = { nb_entretiens: corpus.nb_entretiens, controle: separateur }
  let enteteTransmis = false
  void ecrire(`${JSON.stringify(entete)}\n`).then(() => { enteteTransmis = !navigateurParti })
  // Vérification : l'écriture de l'en-tête n'est tenue qu'une fois l'en-tête parti. S'il est retenu, on le saura.
  const minuterieEntete = setTimeout(() => {
    if (!enteteTransmis && !navigateurParti) {
      console.warn(`Analyse par l'API : l'en-tête du flux n'est toujours pas parti après ${DELAI_ENTETE_MS / 1000} s.`)
    }
  }, DELAI_ENTETE_MS)

  const produire = async (): Promise<void> => {
    try {
      const generation = generer(options)
      for await (const morceau of generation) void ecrire(morceau)
      const { texte, tronquee, refusee } = await generation.fin()
      if (refusee) throw new ErreurIa("L'IA a refusé de produire cette analyse ; rien n'a été enregistré.")
      if (!texte.trim()) throw new ErreurIa("L'IA n'a produit aucun texte ; rien n'a été enregistré.")
      let contenu = texte
      if (tronquee) {
        void ecrire(MENTION_TRONQUEE)
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
      void controler({ type: 'succes', analyse_id: analyse.id })
    } catch (e) {
      console.error("Analyse par l'API :", e instanceof ErreurIa ? e.message : '', e instanceof ErreurIa ? e.cause ?? '' : e)
      void controler({ type: 'erreur', message: messageLisible(e) })
    } finally {
      clearTimeout(minuterieVie)
      clearTimeout(minuterieEntete)
      // La fermeture passe après les écritures en attente ; elle échoue sans gravité si le navigateur est parti.
      ecrivain.close().catch(() => {})
    }
  }

  // Sans waitUntil, la fermeture de l'onglet arrêterait le travail en cours ; l'appel garde son récepteur (pas de déstructuration).
  contexte.waitUntil(produire())

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Ni cache ni recompression qui retiendrait les morceaux.
      'Cache-Control': 'no-store, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
