import { expect, vi } from 'vitest'
import { FORME_SEPARATEUR, type ControleFlux, type EnteteFlux } from '../../shared/flux'

// API Messages simulée, au format SSE, et lecture des flux de l'admin selon le contrat commun (`shared/flux.ts`).

type Evenement = Record<string, unknown>

function sse(e: Evenement): string {
  return `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`
}

export interface Compteurs {
  input_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  output_tokens?: number
}

/** Réponse en flux de l'API : le texte en morceaux, puis la raison d'arrêt. */
export function reponseSse(morceaux: string[], stop_reason = 'end_turn', modele = 'claude-simule', compteurs: Compteurs = {}): Response {
  const evenements: Evenement[] = [
    {
      type: 'message_start',
      message: {
        id: 'msg_1', type: 'message', role: 'assistant', model: modele, content: [], stop_reason: null, stop_sequence: null,
        usage: {
          input_tokens: compteurs.input_tokens ?? 10, output_tokens: 1,
          cache_read_input_tokens: compteurs.cache_read_input_tokens ?? 0, cache_creation_input_tokens: compteurs.cache_creation_input_tokens ?? 0,
        },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...morceaux.map(t => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: compteurs.output_tokens ?? 20 } },
    { type: 'message_stop' },
  ]
  return new Response(evenements.map(sse).join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

/** Sortie structurée : le JSON écrit en deux morceaux, comme le ferait le modèle. */
export function reponseJson(valeur: unknown, stop_reason = 'end_turn', compteurs?: Compteurs): Response {
  const texte = typeof valeur === 'string' ? valeur : JSON.stringify(valeur)
  const milieu = Math.floor(texte.length / 2)
  return reponseSse([texte.slice(0, milieu), texte.slice(milieu)], stop_reason, undefined, compteurs)
}

/** Erreur survenue au milieu du flux, après un premier morceau. */
export function reponseCoupee(premier: string): Response {
  const evenements = [
    { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'x', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: premier } },
    { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
  ]
  return new Response(evenements.map(sse).join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

/**
 * `fetch` simulé : chaque appel prend la réponse suivante de la liste ; les corps envoyés sont gardés tels quels.
 * Une réponse peut se faire attendre (promesse) : de quoi simuler une IA lente.
 */
export function apiSimulee(...reponses: (() => Response | Promise<Response>)[]) {
  const corps: string[] = []
  const appel = vi.fn(async (_url: string, init?: RequestInit) => {
    corps.push(init?.body as string)
    const suivante = reponses.shift()
    if (!suivante) throw new Error("Appel à l'API non prévu par le test.")
    return suivante()
  })
  return {
    fetch: appel as unknown as typeof globalThis.fetch,
    appel,
    /** Corps bruts envoyés, dans l'ordre. */
    corps,
    /** Corps envoyés, lus. */
    lus: () => corps.map(c => JSON.parse(c)),
  }
}

/** Découpe un flux complet selon le contrat : en-tête, texte sans les lignes de contrôle, lignes de contrôle. */
export function analyserFlux<C extends object = Record<string, unknown>, S extends object = Record<string, unknown>>(brut: string) {
  const fin = brut.indexOf('\n')
  const entete = JSON.parse(brut.slice(0, fin)) as EnteteFlux<C>
  expect(entete.controle).toMatch(FORME_SEPARATEUR)
  const marque = `\n${entete.controle} `
  const controles: ControleFlux<S>[] = []
  let reste = brut.slice(fin + 1)
  let texte = ''
  for (;;) {
    const i = reste.indexOf(marque)
    if (i < 0) break
    const finLigne = reste.indexOf('\n', i + marque.length)
    expect(finLigne, 'ligne de contrôle terminée').toBeGreaterThan(i)
    texte += reste.slice(0, i)
    controles.push(JSON.parse(reste.slice(i + marque.length, finLigne)) as ControleFlux<S>)
    reste = reste.slice(finLigne + 1)
  }
  texte += reste
  const derniere = controles.at(-1)
  expect(reste).toBe('')
  expect(derniere?.type === 'succes' || derniere?.type === 'erreur').toBe(true)
  expect(controles.slice(0, -1).every(c => c.type === 'vie')).toBe(true)
  return { entete, texte, controles, fin: derniere! }
}

/** Contexte de Pages Function pour une route admin ; `tache()` attend le travail confié à waitUntil. */
export function contexteRoute(db: D1Database, methode: string, id: string, corps?: unknown, cle: string | undefined = 'sk-test') {
  const enCours: Promise<unknown>[] = []
  const request = new Request(`https://exemple.test/api/admin/projets/${id}/x`, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const env = cle === undefined ? { DB: db } : { DB: db, ANTHROPIC_API_KEY: cle }
  return {
    valeur: { request, env, params: { id }, waitUntil: (p: Promise<unknown>) => { enCours.push(p) } } as never,
    tache: async () => {
      for (let vus = 0; vus < enCours.length;) {
        const lot = enCours.slice(vus)
        vus = enCours.length
        await Promise.all(lot)
      }
    },
    enCours,
  }
}
