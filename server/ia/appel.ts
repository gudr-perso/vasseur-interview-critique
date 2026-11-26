// Appel en flux à l'API Messages, commun aux travaux de l'IA dans l'admin (analyses, cadrage, questionnaires) :
// texte transmis au fil de l'eau (`genererTexte`), ou sortie structurée lue à la fin (`genererStructure`).
// Effort fixé par l'appelant, sans paramètre `thinking`. Le contexte du projet, quand il y en a un, est un second
// bloc système mis en cache : consigne puis contexte forment un préfixe identique d'un appel à l'autre, et seuls
// les messages, qui viennent après, changent.

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from '../zod'
import { ErreurIa } from './types'

/**
 * Délai laissé à l'API pour commencer à répondre. Le SDK ne l'applique que jusqu'à l'arrivée des en-têtes :
 * une fois le flux ouvert, seule la durée maximale ci-dessous le borne.
 */
const DELAI_REPONSE_MS = 5 * 60_000
/** Au-delà de cette durée, le flux est abandonné. */
const DUREE_MAX_MS = 10 * 60_000
/** Le SDK ne refait un essai qu'avant le début du flux (erreur de connexion, 429, 5xx) ; jamais en cours de texte. */
const NOUVEAUX_ESSAIS_AVANT_FLUX = 1

export type Effort = 'low' | 'medium' | 'high'

export interface DemandeIa {
  cleApi: string
  /** Modèle du projet ; transmis tel quel. */
  modele: string
  /** Méthode : premier bloc système. */
  consigne: string
  /** Contexte du projet : second bloc système, mis en cache. Absent : la consigne seule, en texte simple. */
  contexte?: string
  messages: Anthropic.MessageParam[]
  maxTokens: number
  effort: Effort
  /** Pour les tests : remplace l'accès réseau. */
  fetch?: typeof globalThis.fetch
}

/** Messages d'erreur propres au travail demandé ; des formules neutres par défaut. */
export interface LibellesErreur {
  /** Durée maximale dépassée. */
  duree?: string
  /** Erreur sans autre précision. */
  impossible?: string
}

/** Blocs système : la consigne, puis le contexte marqué pour le cache (le préfixe mis en cache s'arrête à lui). */
export function systeme(consigne: string, contexte?: string): string | Anthropic.TextBlockParam[] {
  if (contexte === undefined) return consigne
  return [
    { type: 'text', text: consigne },
    { type: 'text', text: contexte, cache_control: { type: 'ephemeral' } },
  ]
}

function refusEffort(e: unknown): boolean {
  return e instanceof Anthropic.BadRequestError && /effort/i.test(e.message)
}

function versErreurIa(e: unknown, dureeDepassee: boolean, libelles: LibellesErreur): ErreurIa {
  if (e instanceof ErreurIa) return e
  if (dureeDepassee) {
    return new ErreurIa(libelles.duree ?? `Génération abandonnée : elle a dépassé ${DUREE_MAX_MS / 60_000} minutes.`, e)
  }
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return new ErreurIa(`L'API Anthropic n'a pas commencé à répondre en ${DELAI_REPONSE_MS / 60_000} minutes.`, e)
  }
  if (e instanceof Anthropic.APIError && e.status) {
    return new ErreurIa(`Appel à l'API Anthropic impossible (erreur ${e.status}).`, e)
  }
  if (e instanceof Anthropic.APIError) {
    return new ErreurIa("L'API Anthropic a interrompu la génération. Réessayez dans quelques minutes.", e)
  }
  return new ErreurIa(libelles.impossible ?? 'Génération impossible.', e)
}

type FormatJson = Anthropic.JSONOutputFormat

/**
 * Ouvre le flux, avec l'effort demandé puis, si le modèle le refuse avant tout texte, sans effort. `lire` reçoit
 * chaque morceau de texte et dit s'il en a déjà transmis (un nouvel essai serait alors un doublon).
 * Renvoie le message final ; toute erreur sort en ErreurIa.
 */
async function* parcourir(
  demande: DemandeIa, format: FormatJson | undefined, libelles: LibellesErreur,
): AsyncGenerator<string, Anthropic.Message> {
  const client = new Anthropic({
    apiKey: demande.cleApi, timeout: DELAI_REPONSE_MS, maxRetries: NOUVEAUX_ESSAIS_AVANT_FLUX, fetch: demande.fetch,
  })
  const ouvrir = (avecEffort: boolean) => {
    const sortie = { ...(format ? { format } : {}), ...(avecEffort ? { effort: demande.effort } : {}) }
    return client.messages.stream({
      model: demande.modele,
      max_tokens: demande.maxTokens,
      system: systeme(demande.consigne, demande.contexte),
      messages: demande.messages,
      ...(Object.keys(sortie).length > 0 ? { output_config: sortie } : {}),
    })
  }

  let transmis = false
  let flux: ReturnType<typeof ouvrir> | undefined
  let dureeDepassee = false
  const limite = setTimeout(() => { dureeDepassee = true; flux?.abort() }, DUREE_MAX_MS)
  try {
    for (const avecEffort of [true, false]) {
      flux = ouvrir(avecEffort)
      try {
        for await (const evenement of flux) {
          if (evenement.type === 'content_block_delta' && evenement.delta.type === 'text_delta') {
            transmis = true
            yield evenement.delta.text
          }
        }
        // Une erreur survenue après le dernier événement lu n'est pas levée par le parcours : finalMessage la lève.
        return await flux.finalMessage()
      } catch (e) {
        // Un modèle plus ancien choisi dans l'admin peut refuser le réglage d'effort : l'appel est refait, rien n'a été transmis.
        if (avecEffort && !transmis && refusEffort(e)) continue
        throw e
      }
    }
    throw new ErreurIa(libelles.impossible ?? 'Génération impossible.')
  } catch (e) {
    throw versErreurIa(e, dureeDepassee, libelles)
  } finally {
    clearTimeout(limite)
  }
}

// ─── Texte au fil de l'eau ───────────────────────────────────────────────────

export interface FinTexte {
  texte: string
  /** Longueur maximale atteinte : le texte s'arrête en cours de route. */
  tronquee: boolean
  /** Le modèle a refusé de produire le texte. */
  refusee: boolean
}

/** Morceaux de texte au fil de l'eau ; `fin()` se lit une fois le parcours terminé. */
export interface GenerationTexte extends AsyncIterable<string> {
  fin(): Promise<FinTexte>
}

/**
 * Texte produit en flux (`messages.stream`). Une erreur en cours de route est levée pendant le parcours (ErreurIa) ;
 * le texte déjà transmis n'est pas repris, et aucun nouvel essai n'est fait.
 */
export function genererTexte(demande: DemandeIa, libelles: LibellesErreur = {}): GenerationTexte {
  let tenir!: (fin: FinTexte) => void
  let rompre!: (e: ErreurIa) => void
  let reglee = false
  const fin = new Promise<FinTexte>((resoudre, rejeter) => {
    tenir = f => { reglee = true; resoudre(f) }
    rompre = e => { reglee = true; rejeter(e) }
  })
  // Le rejet est aussi levé pendant le parcours : qui ne demande pas fin() n'a pas à le traiter une seconde fois.
  fin.catch(() => {})

  async function* morceaux(): AsyncGenerator<string> {
    let texte = ''
    const parcours = parcourir(demande, undefined, libelles)
    try {
      for (;;) {
        const etape = await parcours.next()
        if (etape.done) {
          const message = etape.value
          tenir({ texte, tronquee: message.stop_reason === 'max_tokens', refusee: message.stop_reason === 'refusal' })
          return
        }
        texte += etape.value
        yield etape.value
      }
    } catch (e) {
      const erreurIa = e instanceof ErreurIa ? e : versErreurIa(e, false, libelles)
      rompre(erreurIa)
      throw erreurIa
    } finally {
      if (!reglee) {
        // Parcours interrompu par l'appelant : le flux est refermé, sa minuterie avec.
        void parcours.return(undefined as never).catch(() => {})
        rompre(new ErreurIa('Génération abandonnée avant la fin.'))
      }
    }
  }

  return {
    [Symbol.asyncIterator]: () => morceaux(),
    fin: () => fin,
  }
}

// ─── Sortie structurée lue à la fin ──────────────────────────────────────────

/**
 * Sortie produite mais hors du schéma (JSON illisible ou contraintes non respectées). `detail` dit ce qui ne va pas,
 * `brut` est le texte produit : de quoi demander une correction au modèle.
 */
export class ErreurSortie extends ErreurIa {
  constructor(message: string, readonly detail: string, readonly brut: string) {
    super(message)
    this.name = 'ErreurSortie'
  }
}

export interface Structure<T> {
  sortie: T
  /** JSON tel que le modèle l'a écrit. */
  brut: string
}

/** Format JSON envoyé à l'API, tiré du schéma Zod, sans la lecture automatique du SDK (faite ici, après les contrôles). */
export function formatJson(schema: z.ZodType): FormatJson {
  const { type, schema: jsonSchema } = zodOutputFormat(schema)
  return { type, schema: jsonSchema }
}

function detailZod(erreur: z.ZodError): string {
  return erreur.issues.map(i => `${i.path.join('.') || 'racine'} : ${i.message}`).join(' ; ')
}

/**
 * Sortie structurée (`output_config.format`) produite en flux : rien n'est transmis au fil de l'eau, le JSON final
 * est lu dans `finalMessage()` puis validé avec le schéma. Le format est envoyé sans la lecture automatique du SDK,
 * qui lèverait une erreur sans nuance sur un refus ou une réponse tronquée : ceux-ci sont d'abord reconnus à leur
 * `stop_reason`. Une sortie hors du schéma lève ErreurSortie.
 */
export async function genererStructure<S extends z.ZodType>(
  demande: DemandeIa, schema: S, libelles: LibellesErreur = {},
): Promise<Structure<z.infer<S>>> {
  const parcours = parcourir(demande, formatJson(schema), libelles)
  let etape = await parcours.next()
  while (!etape.done) etape = await parcours.next()
  const message = etape.value
  if (message.stop_reason === 'refusal') throw new ErreurIa("L'IA a refusé de répondre.")
  if (message.stop_reason === 'max_tokens') throw new ErreurIa("Réponse de l'IA tronquée : longueur maximale atteinte.")
  const brut = message.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('')
  if (!brut.trim()) throw new ErreurIa("L'IA n'a produit aucune réponse.")
  let json: unknown
  try {
    json = JSON.parse(brut)
  } catch {
    throw new ErreurSortie("Réponse de l'IA illisible.", 'la réponse n\'est pas un JSON valide', brut)
  }
  const lecture = schema.safeParse(json)
  if (!lecture.success) {
    throw new ErreurSortie("Réponse de l'IA hors du format attendu.", detailZod(lecture.error), brut)
  }
  return { sortie: lecture.data, brut }
}
