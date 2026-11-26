// Cadrage d'un projet par l'API, dans l'admin : dialogue question par question, puis note de cadrage et résumé de
// contexte. La méthode est celle du guide « cadrage », que Claude suit aussi via le MCP.

import type Anthropic from '@anthropic-ai/sdk'
import {
  DIALOGUE_CHANGE, type EnteteCadrage, type EnteteTourCadrage, type EtatDialogue, type MessageCadrage,
  type SuccesTexteCadrage, type SuccesTourCadrage,
} from '../../shared/cadrage'
import { LIMITES } from '../../shared/interviews'
import { lireCorps, parametre } from '../api'
import type { Env } from '../env'
import { ErreurMetier } from '../erreurs'
import { consigneSansOutils } from '../guides'
import { erreur } from '../http'
import { schemaTourCadrage } from '../schemas'
import {
  ajouterMessageApres, contexteCadrage, dialogueConclu, listerMessages, plafondQuestions, questionsPosees,
} from '../services/cadrage'
import { TYPES_DEMANDE_LIBELLES } from '../services/corpus'
import { lireProjet } from '../services/projets'
import { z } from '../zod'
import { genererStructure, genererTexte, type DemandeIa, type GenerationTexte } from './appel'
import { repondreEnFlux, type ReglagesFlux } from './flux'
import type { Suivi } from './suivi'
import { ErreurIa } from './types'

type Contexte = EventContext<Env, 'id', Record<string, unknown>>

/** Pour les tests : accès réseau simulé et réglages du flux. */
export interface OptionsAppelIa {
  fetch?: typeof globalThis.fetch
  reglages?: ReglagesFlux
}

/** Coût des appels de l'admin qui préparent le projet (dialogue, note, résumé, publics, questionnaires). */
export function suiviCadrage(contexte: Contexte, projetId: string): Suivi {
  return { db: contexte.env.DB, poste: 'cadrage', projet_id: projetId, attendre: p => contexte.waitUntil(p) }
}

// ─── Consigne ────────────────────────────────────────────────────────────────

/** Ce que le dialogue dans l'admin ajoute au guide : il remplace la section « Avec les outils », propre au MCP. */
export const SECTION_ADMIN = `## Dans l'admin

Ici, tu n'as aucun outil : le contexte du projet (description, logiciels et leur fiche, note de cadrage existante, texte des documents) suit cette consigne, et la personne qui pilote le projet te répond dans l'admin de l'application. Chaque demande dit ce qu'elle attend : la suite du dialogue, la note de cadrage ou le résumé de contexte.

Pendant le dialogue :

- Pose une seule question à la fois, en quelques phrases au plus, et ne redemande rien de ce que disent déjà le contexte ou les réponses précédentes.
- Quand tu as assez d'éléments pour écrire la note, ou dès que la personne dit que cela suffit, ne pose plus de question : dis-le en une phrase, et le dialogue s'arrête là. Le serveur arrête aussi le dialogue quand le plafond de questions est atteint ; le nombre de questions déjà posées t'est rappelé à chaque tour.
- N'écris pas la note pendant le dialogue : elle est demandée à part, une fois le dialogue terminé.
- Si un document du contexte porte la mention « document tronqué », dis-le dans ton premier message : seul son début t'a été transmis.

La note et le résumé s'écrivent directement en Markdown, sans préambule ni question : ils remplissent une zone de saisie, que la personne relit et corrige avant de l'enregistrer.`

/**
 * Consigne système des trois appels du cadrage : le guide sans les outils, puis la section propre à l'admin.
 * Elle est la même pour le dialogue, la note et le résumé, et précède le contexte : un seul préfixe à mettre en cache.
 */
export function consigneCadrage(): string {
  return `${consigneSansOutils('cadrage')}\n\n${SECTION_ADMIN}`
}

// ─── Messages ────────────────────────────────────────────────────────────────

const OUVERTURE = 'Je pilote ce projet. Interroge-moi pour le cadrer, en suivant la consigne.'

/**
 * Dialogue enregistré, en messages pour l'API : une ouverture fixe, puis chaque message dans l'ordre. Les messages de
 * l'IA sont rendus dans le format qu'elle a produit (`{ fin, message }`), ceux de l'admin tels quels. Un tour ne fait
 * qu'ajouter des messages : l'historique d'un tour est le début exact de celui du tour suivant.
 */
export function messagesDialogue(messages: Pick<MessageCadrage, 'role' | 'type' | 'contenu'>[]): Anthropic.MessageParam[] {
  return [
    { role: 'user', content: OUVERTURE },
    ...messages.map((m): Anthropic.MessageParam => m.role === 'ia'
      ? { role: 'assistant', content: JSON.stringify({ fin: m.type === 'conclusion', message: m.contenu }) }
      : { role: 'user', content: m.contenu }),
  ]
}

/** Rappel du décompte, ajouté en dernier message du tour (il ne reste pas dans l'historique). */
export function rappelTour(posees: number, plafond: number, typeDemande: keyof typeof TYPES_DEMANDE_LIBELLES): string {
  const reste = plafond - posees
  return [
    `Questions déjà posées : ${posees} sur ${plafond} au plus pour une ${TYPES_DEMANDE_LIBELLES[typeDemande]}.`,
    reste === 1 ? "Il ne t'en reste qu'une : pose la plus utile, ou conclus." : '',
    'Donne la suite du dialogue : fin à false et la question suivante dans message, ou fin à true et, dans message, la phrase qui dit que le cadrage peut être conclu.',
  ].filter(Boolean).join(' ')
}

const DEMANDE_NOTE = "Le dialogue de cadrage est terminé. Rédige maintenant la note de cadrage, avec les titres de la consigne dans leur ordre (Objectif, Publics à interroger, Existant, Contraintes, Hors périmètre, Hypothèses à vérifier, Points encore ouverts), à partir du contexte du projet et de ce dialogue. Si le contexte contient déjà une note de cadrage, pars d'elle et complète-la avec ce que le dialogue a appris. Écris directement la note, en Markdown, sans préambule ni question."

const DEMANDE_NOTE_SANS_DIALOGUE = "Aucun dialogue de cadrage n'a eu lieu. Rédige la note de cadrage à partir du contexte du projet seul, avec les titres de la consigne dans leur ordre (Objectif, Publics à interroger, Existant, Contraintes, Hors périmètre, Hypothèses à vérifier, Points encore ouverts) ; range sous « Points encore ouverts » ce que le contexte ne dit pas. Si le contexte contient déjà une note de cadrage, pars d'elle. Écris directement la note, en Markdown, sans préambule ni question."

/** Le résumé sert de contexte à l'IA d'entretien, qui ne doit jamais voir la note (hypothèses internes) : il n'en tient pas compte. */
const DEMANDE_RESUME = "Rédige le résumé de contexte de ce projet : une vingtaine de lignes en Markdown, tirées de la description, des fiches des logiciels et des documents. Il servira de contexte à l'IA qui mène chaque entretien avec un utilisateur, à la place des documents complets : dis de quoi parle la demande, quels logiciels et quels écrans sont en jeu, et le vocabulaire du métier utile pour comprendre les réponses. Le contexte transmis pour ce résumé ne contient volontairement pas la note de cadrage : n'y ajoute aucune hypothèse de l'équipe, car l'IA d'entretien ne doit pas orienter les réponses. Écris directement le résumé, sans préambule ni question."

export function messagesNote(messages: Pick<MessageCadrage, 'role' | 'type' | 'contenu'>[]): Anthropic.MessageParam[] {
  if (messages.length === 0) return [{ role: 'user', content: DEMANDE_NOTE_SANS_DIALOGUE }]
  return [...messagesDialogue(messages), { role: 'user', content: DEMANDE_NOTE }]
}

export function messagesResume(): Anthropic.MessageParam[] {
  return [{ role: 'user', content: DEMANDE_RESUME }]
}

// ─── Réglages des appels ─────────────────────────────────────────────────────

/** Un tour rend un petit JSON ; la borne laisse la place à la réflexion du modèle. */
export const JETONS_MAX_TOUR = 8_000
/** Une note de cadrage tient en 50 000 caractères au plus ; la réflexion compte aussi. */
export const JETONS_MAX_NOTE = 32_000
export const JETONS_MAX_RESUME = 16_000

export const MESSAGE_PLAFOND = 'Le nombre maximal de questions pour ce type de demande est atteint : le cadrage peut être conclu. Rédigez maintenant la note de cadrage.'

export const schemaTour = z.object({
  fin: z.boolean().describe('true quand le dialogue peut être conclu'),
  message: z.string().min(1).max(LIMITES.message_cadrage_ia)
    .describe('la question suivante, ou, si fin, la phrase qui dit que le cadrage peut être conclu'),
})

const SANS_CLE = "Cadrage par l'API indisponible : clé non configurée. Utilisez Claude avec le connecteur MCP."

/** Clé API ou réponse 503 à renvoyer telle quelle. */
function cleOuRefus(env: Env): string | Response {
  return env.ANTHROPIC_API_KEY || erreur(SANS_CLE, 503)
}

async function preparer(env: Env, projetId: string) {
  const projet = await lireProjet(env.DB, projetId)
  const messages = await listerMessages(env.DB, projetId)
  const contexte = await contexteCadrage(env.DB, projetId)
  return { projet, messages, contexte }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function etatDialogue(db: D1Database, projetId: string): Promise<EtatDialogue> {
  const projet = await lireProjet(db, projetId)
  const messages = await listerMessages(db, projetId)
  return {
    messages,
    plafond: plafondQuestions(projet.type_demande),
    questions_posees: questionsPosees(messages),
    conclu: dialogueConclu(messages),
  }
}

/**
 * `POST …/cadrage/tour` avec `{ texte?, apres }` : enregistre la réponse de l'admin s'il y en a une, puis la suite de
 * l'IA (question ou conclusion), en flux. Plafond atteint : le serveur conclut lui-même, sans appeler l'IA.
 * La réponse de l'admin est enregistrée avant l'appel : si l'IA échoue, un tour sans texte la relance.
 *
 * Tours concurrents (deux onglets, une relance pendant qu'un tour tourne encore) : `apres` est le dernier message
 * vu par le client. La réponse de l'admin n'est écrite que s'il est toujours le dernier (sinon 409, sans appel), et
 * le message de l'IA que si le dernier message est toujours celui du début du tour ; sinon le tour est abandonné
 * sans rien écrire. Deux relances simultanées appellent donc l'IA deux fois, mais un seul message en sort.
 */
export async function repondreTourCadrage(contexte: Contexte, options: OptionsAppelIa = {}): Promise<Response> {
  const { request, env, params } = contexte
  const projetId = parametre(params.id)
  const { texte, apres } = await lireCorps(request, schemaTourCadrage)
  const cleApi = cleOuRefus(env)
  if (cleApi instanceof Response) return cleApi

  const { projet, messages, contexte: ctx } = await preparer(env, projetId)
  const dernier = messages.at(-1)
  if ((dernier?.id ?? null) !== apres) throw new ErreurMetier(DIALOGUE_CHANGE, 409)
  if (dialogueConclu(messages)) {
    throw new ErreurMetier('Le cadrage est conclu : rédigez la note, ou recommencez le dialogue.', 409)
  }
  const ecrits: MessageCadrage[] = []
  if (texte !== undefined) {
    if (dernier?.type === 'reponse') {
      throw new ErreurMetier("L'IA n'a pas encore répondu à votre dernier message : relancez le tour sans texte.", 409)
    }
    const reponse = await ajouterMessageApres(env.DB, projetId, 'reponse', texte, apres)
    if (!reponse) throw new ErreurMetier(DIALOGUE_CHANGE, 409)
    messages.push(reponse)
    ecrits.push(reponse)
  } else if (dernier?.type === 'question') {
    throw new ErreurMetier("Répondez à la question de l'IA avant de demander la suite.")
  }
  /** Dernier message au début du tour : celui de l'IA ne s'écrit qu'à sa suite. */
  const debut = messages.at(-1)?.id ?? null
  const ecrireIa = async (type: 'question' | 'conclusion', contenu: string): Promise<SuccesTourCadrage> => {
    const message = await ajouterMessageApres(env.DB, projetId, type, contenu, debut)
    if (!message) throw new ErreurMetier(DIALOGUE_CHANGE, 409)
    return { fin: type === 'conclusion', message: message.contenu, messages: [...ecrits, message] }
  }

  const plafond = plafondQuestions(projet.type_demande)
  const posees = questionsPosees(messages)
  const demande: DemandeIa = {
    cleApi,
    modele: projet.modele_cadrage,
    consigne: consigneCadrage(),
    contexte: ctx.texte,
    messages: [...messagesDialogue(messages), { role: 'user', content: rappelTour(posees, plafond, projet.type_demande) }],
    maxTokens: JETONS_MAX_TOUR,
    effort: 'medium',
    fetch: options.fetch,
    suivi: suiviCadrage(contexte, projetId),
  }
  const entete: EnteteTourCadrage = { plafond, questions_posees: posees, contexte_tronque: ctx.tronquee }
  return repondreEnFlux(contexte, {
    journal: "Cadrage par l'API",
    entete,
    reglages: options.reglages,
    produire: async (): Promise<SuccesTourCadrage> => {
      if (posees >= plafond) return ecrireIa('conclusion', MESSAGE_PLAFOND)
      const { sortie } = await genererStructure(demande, schemaTour)
      if (!sortie.message.trim()) throw new ErreurIa("L'IA n'a produit aucune question.")
      return ecrireIa(sortie.fin ? 'conclusion' : 'question', sortie.message)
    },
  })
}

/** Texte au fil de l'eau ; rien n'est enregistré (décision 1). */
function repondreTexte(
  contexte: Contexte, entete: EnteteCadrage, generation: () => GenerationTexte, objet: string, reglages?: ReglagesFlux,
): Response {
  return repondreEnFlux(contexte, {
    journal: "Cadrage par l'API",
    entete,
    reglages,
    produire: async (ecrire): Promise<SuccesTexteCadrage> => {
      const flux = generation()
      for await (const morceau of flux) ecrire(morceau)
      const { texte, tronquee, refusee } = await flux.fin()
      if (refusee) throw new ErreurIa(`L'IA a refusé de rédiger ${objet}.`)
      if (!texte.trim()) throw new ErreurIa("L'IA n'a produit aucun texte.")
      return { tronquee }
    },
  })
}

/** `POST …/cadrage/note` : la note de cadrage, d'après le contexte et le dialogue, en flux. Rien n'est enregistré. */
export async function repondreNoteCadrage(contexte: Contexte, options: OptionsAppelIa = {}): Promise<Response> {
  const cleApi = cleOuRefus(contexte.env)
  if (cleApi instanceof Response) return cleApi
  const projetId = parametre(contexte.params.id)
  const { projet, messages, contexte: ctx } = await preparer(contexte.env, projetId)
  return repondreTexte(contexte, { contexte_tronque: ctx.tronquee }, () => genererTexte({
    cleApi,
    modele: projet.modele_cadrage,
    consigne: consigneCadrage(),
    contexte: ctx.texte,
    messages: messagesNote(messages),
    maxTokens: JETONS_MAX_NOTE,
    effort: 'high',
    fetch: options.fetch,
    suivi: suiviCadrage(contexte, projetId),
  }), 'la note de cadrage', options.reglages)
}

/** `POST …/cadrage/resume` : le résumé de contexte, d'après la description et les documents, en flux. Rien n'est enregistré. */
export async function repondreResumeContexte(contexte: Contexte, options: OptionsAppelIa = {}): Promise<Response> {
  const cleApi = cleOuRefus(contexte.env)
  if (cleApi instanceof Response) return cleApi
  const projetId = parametre(contexte.params.id)
  const projet = await lireProjet(contexte.env.DB, projetId)
  // Ni la note, ni le dialogue (qui la prépare) : le résumé est transmis à l'IA qui interroge les répondants.
  const ctx = await contexteCadrage(contexte.env.DB, projetId, { avecNote: false })
  if (!projet.description.trim() && projet.documents.length === 0) {
    throw new ErreurMetier('Ajoutez une description ou un document avant de demander le résumé de contexte.')
  }
  return repondreTexte(contexte, { contexte_tronque: ctx.tronquee }, () => genererTexte({
    cleApi,
    modele: projet.modele_cadrage,
    consigne: consigneCadrage(),
    contexte: ctx.texte,
    messages: messagesResume(),
    maxTokens: JETONS_MAX_RESUME,
    effort: 'medium',
    fetch: options.fetch,
    suivi: suiviCadrage(contexte, projetId),
  }), 'le résumé de contexte', options.reglages)
}
