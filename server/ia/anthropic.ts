import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from '../zod'
import { CONSIGNE_ENTRETIEN, CONSIGNE_RELANCE, messageEntretien, messageRelance } from './consignes'
import { fetchSuivi, type Suivi } from './suivi'
import { ErreurIa, type DecisionRelance, type DecisionTour, type Ia } from './types'

/** Les consignes demandent 300 caractères ; la marge évite de rejeter une question à peine plus longue. */
const QUESTION_MAX = 500

const schemaRelance = z.object({
  relancer: z.boolean(),
  question: z.string().nullable(),
})

const schemaTour = z.object({
  fin: z.boolean(),
  question: z.string().nullable(),
  themes_couverts: z.array(z.string()),
})

type Effort = 'low' | 'medium'

export interface OptionsIa {
  cleApi: string
  /** Modèle choisi pour le projet ; transmis tel quel. */
  modele: string
  /** Pour les tests : remplace l'accès réseau. */
  fetch?: typeof globalThis.fetch
  /** Coût des appels, sous le poste `interview`. */
  suivi?: Suivi
}

function questionValide(question: string | null): string {
  const texte = question?.trim() ?? ''
  if (!texte || texte.length > QUESTION_MAX) throw new ErreurIa('Question produite vide ou trop longue.')
  return texte
}

function refusEffort(e: unknown): boolean {
  return e instanceof Anthropic.BadRequestError && /effort/i.test(e.message)
}

/**
 * Un répondant attend la réponse : 12 s par appel et un seul nouvel essai (le SDK le fait sur 408, 409, 429 et 5xx),
 * soit une trentaine de secondes au pire, sous l'expiration de 60 s du calcul de la suite.
 */
const DELAI_APPEL_MS = 12_000
const NOUVEAUX_ESSAIS = 1
/** La sortie est un petit JSON, mais la réflexion du modèle compte dans cette borne. */
const JETONS_MAX = 3_000

export function creerIaAnthropic(options: OptionsIa): Ia {
  const client = new Anthropic({
    apiKey: options.cleApi, timeout: DELAI_APPEL_MS, maxRetries: NOUVEAUX_ESSAIS,
    fetch: options.suivi ? fetchSuivi(options.suivi, options.fetch) : options.fetch,
  })

  async function demander<S extends z.ZodType>(
    consigne: string, message: string, schema: S, effort: Effort,
  ): Promise<z.infer<S>> {
    const appeler = (avecEffort: boolean) => client.messages.parse({
      model: options.modele,
      max_tokens: JETONS_MAX,
      system: consigne,
      messages: [{ role: 'user', content: message }],
      output_config: { format: zodOutputFormat(schema), ...(avecEffort ? { effort } : {}) },
    })

    let reponse: Awaited<ReturnType<typeof appeler>>
    try {
      try {
        reponse = await appeler(true)
      } catch (e) {
        // Un modèle plus ancien choisi dans l'admin peut refuser le réglage d'effort.
        if (!refusEffort(e)) throw e
        reponse = await appeler(false)
      }
    } catch (e) {
      // Une erreur hors API vient de la lecture du JSON produit (texte de refus, sortie tronquée, schéma non respecté).
      const message = e instanceof Anthropic.APIError ? "Appel à l'IA impossible." : "Réponse de l'IA illisible."
      throw new ErreurIa(message, e)
    }
    if (reponse.stop_reason === 'refusal') throw new ErreurIa("L'IA a refusé de répondre.")
    if (reponse.stop_reason === 'max_tokens') throw new ErreurIa("Réponse de l'IA tronquée.")
    if (reponse.parsed_output == null) throw new ErreurIa("Réponse de l'IA illisible.")
    return reponse.parsed_output
  }

  return {
    async deciderRelance(demande): Promise<DecisionRelance> {
      const sortie = await demander(CONSIGNE_RELANCE, messageRelance(demande), schemaRelance, 'low')
      return sortie.relancer ? { relancer: true, question: questionValide(sortie.question) } : { relancer: false, question: null }
    },
    async prochainTour(demande): Promise<DecisionTour> {
      const sortie = await demander(CONSIGNE_ENTRETIEN, messageEntretien(demande), schemaTour, 'medium')
      return sortie.fin
        ? { fin: true, question: null, themes_couverts: sortie.themes_couverts }
        : { fin: false, question: questionValide(sortie.question), themes_couverts: sortie.themes_couverts }
    },
  }
}
