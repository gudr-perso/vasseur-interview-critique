import { describe, expect, it, vi } from 'vitest'
import { consigneAnalyse, genererAnalyse, messageAnalyse } from '../../server/ia/analyse'
import { ErreurIa } from '../../server/ia/types'

type Evenement = Record<string, unknown>

const debutMessage: Evenement = {
  type: 'message_start',
  message: {
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [],
    stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 },
  },
}
const debutBloc: Evenement = { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }
const texte = (t: string): Evenement => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })
const finBloc: Evenement = { type: 'content_block_stop', index: 0 }
const finMessage = (stop_reason: string): Evenement[] => [
  { type: 'message_delta', delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: 20 } },
  { type: 'message_stop' },
]
const erreurApi: Evenement = { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }

function sse(e: Evenement): string {
  return `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`
}

function reponseSse(evenements: Evenement[]): Response {
  return new Response(evenements.map(sse).join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

function reponseErreur(statut: number, type: string, message: string): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status: statut, headers: { 'Content-Type': 'application/json' },
  })
}

const options = { cleApi: 'sk-test', modele: 'claude-opus-5-5', consigne: 'Consigne de test', message: 'Entretiens de test' }

async function toutLire(generation: AsyncIterable<string>): Promise<string[]> {
  const morceaux: string[] = []
  for await (const m of generation) morceaux.push(m)
  return morceaux
}

function corpsEnvoye(appel: ReturnType<typeof vi.fn>, rang = 0): any {
  return JSON.parse((appel.mock.calls[rang] as unknown as [string, RequestInit])[1].body as string)
}

describe('consigne et message', () => {
  it("reprennent le guide de l'étape sans sa section sur les outils, que l'API n'a pas", () => {
    for (const type of ['fiche_repondant', 'synthese', 'expression_besoin'] as const) {
      const consigne = consigneAnalyse(type)
      expect(consigne.length).toBeGreaterThan(800)
      expect(consigne).toMatch(/^# Guide /)
      expect(consigne).toContain('## Comment se présentent les entretiens')
      expect(consigne).not.toContain('Avec les outils')
      for (const outil of ['lire_entretien', 'lire_reponses', 'lire_projet', 'enregistrer_analyse', 'lister_repondants', 'lister_analyses']) {
        expect(consigne).not.toContain(outil)
      }
    }
    expect(consigneAnalyse('synthese')).toContain('# Guide de la synthèse')
  })

  it("place l'en-tête du projet puis les entretiens, chacun sous un titre", () => {
    const message = messageAnalyse('synthese', '# Projet : Saisie\n', '## Répondant 1 — Comptable\n→ oui\n', 3)
    const contexte = message.indexOf('Contexte du projet')
    const entretiens = message.indexOf('Entretiens')
    expect(contexte).toBeGreaterThanOrEqual(0)
    expect(entretiens).toBeGreaterThan(contexte)
    expect(message.indexOf('# Projet : Saisie')).toBeGreaterThan(contexte)
    expect(message.indexOf('## Répondant 1')).toBeGreaterThan(entretiens)
    expect(message).toContain('3 entretiens')
  })
})

describe('génération par l\'API, en flux', () => {
  it('transmet le texte au fil des morceaux, sans attendre la fin de la réponse', async () => {
    let libererLaSuite!: () => void
    const suite = new Promise<void>(r => { libererLaSuite = r })
    const encodeur = new TextEncoder()
    const appel = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      async start(c) {
        for (const e of [debutMessage, debutBloc, texte('## Constats\n')]) c.enqueue(encodeur.encode(sse(e)))
        await suite
        for (const e of [texte('Quatre répondants '), texte('sur six.'), finBloc, ...finMessage('end_turn')]) c.enqueue(encodeur.encode(sse(e)))
        c.close()
      },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))

    const generation = genererAnalyse({ ...options, fetch: appel as never })
    const iterateur = generation[Symbol.asyncIterator]()
    // Le premier morceau arrive alors que l'API n'a pas fini de répondre.
    expect(await iterateur.next()).toEqual({ value: '## Constats\n', done: false })
    libererLaSuite()
    const reste: string[] = []
    for (let r = await iterateur.next(); !r.done; r = await iterateur.next()) reste.push(r.value)
    expect(reste).toEqual(['Quatre répondants ', 'sur six.'])
    expect(await generation.fin()).toEqual({ texte: '## Constats\nQuatre répondants sur six.', tronquee: false, refusee: false })
  })

  it('envoie le modèle du projet, la consigne, 32 000 jetons, un effort élevé, en flux et sans réflexion explicite', async () => {
    const appel = vi.fn(async () => reponseSse([debutMessage, debutBloc, texte('ok'), finBloc, ...finMessage('end_turn')]))
    await toutLire(genererAnalyse({ ...options, modele: 'claude-modele-du-projet', fetch: appel as never }))
    expect(appel).toHaveBeenCalledTimes(1)
    const [url] = appel.mock.calls[0] as unknown as [string]
    expect(String(url)).toMatch(/\/v1\/messages$/)
    const corps = corpsEnvoye(appel)
    expect(corps.model).toBe('claude-modele-du-projet')
    expect(corps.system).toBe('Consigne de test')
    expect(corps.messages).toEqual([{ role: 'user', content: 'Entretiens de test' }])
    expect(corps.max_tokens).toBe(32_000)
    expect(corps.output_config).toEqual({ effort: 'high' })
    expect(corps.stream).toBe(true)
    expect(corps).not.toHaveProperty('thinking')
  })

  it('signale un refus du modèle', async () => {
    const appel = vi.fn(async () => reponseSse([debutMessage, debutBloc, texte('Je ne peux pas'), finBloc, ...finMessage('refusal')]))
    const generation = genererAnalyse({ ...options, fetch: appel as never })
    await toutLire(generation)
    expect(await generation.fin()).toEqual({ texte: 'Je ne peux pas', tronquee: false, refusee: true })
  })

  it('signale une réponse tronquée à la longueur maximale', async () => {
    const appel = vi.fn(async () => reponseSse([debutMessage, debutBloc, texte('## Début'), finBloc, ...finMessage('max_tokens')]))
    const generation = genererAnalyse({ ...options, fetch: appel as never })
    await toutLire(generation)
    expect(await generation.fin()).toEqual({ texte: '## Début', tronquee: true, refusee: false })
  })

  it("lève ErreurIa sur une erreur en cours de flux, sans nouvel essai une fois le texte commencé", async () => {
    const appel = vi.fn(async () => reponseSse([debutMessage, debutBloc, texte('## Début'), erreurApi]))
    const generation = genererAnalyse({ ...options, fetch: appel as never })
    const recus: string[] = []
    await expect((async () => { for await (const m of generation) recus.push(m) })()).rejects.toThrow(ErreurIa)
    expect(recus).toEqual(['## Début'])
    await expect(generation.fin()).rejects.toThrow(ErreurIa)
    expect(appel).toHaveBeenCalledTimes(1)
  })

  it("lève ErreurIa si l'API refuse l'appel (clé invalide, modèle inconnu)", async () => {
    const appel = vi.fn(async () => reponseErreur(404, 'not_found_error', 'model: claude-inconnu'))
    const generation = genererAnalyse({ ...options, fetch: appel as never })
    await expect(toutLire(generation)).rejects.toThrow(/404/)
    expect(appel).toHaveBeenCalledTimes(1)
  })

  it("refait l'appel sans effort si le modèle choisi ne le prend pas en charge", async () => {
    const appel = vi.fn()
      .mockResolvedValueOnce(reponseErreur(400, 'invalid_request_error', 'effort: unsupported for this model'))
      .mockResolvedValueOnce(reponseSse([debutMessage, debutBloc, texte('ok'), finBloc, ...finMessage('end_turn')]))
    const generation = genererAnalyse({ ...options, fetch: appel as never })
    expect(await toutLire(generation)).toEqual(['ok'])
    expect(appel).toHaveBeenCalledTimes(2)
    expect(corpsEnvoye(appel, 1)).not.toHaveProperty('output_config')
  })

  it("laisse 5 minutes à l'API pour commencer à répondre", async () => {
    vi.useFakeTimers()
    try {
      const signaux: AbortSignal[] = []
      const appel = vi.fn((_url: string, init: RequestInit) => {
        const signal = init.signal!
        signaux.push(signal)
        return new Promise<Response>((_, refuser) => {
          signal.addEventListener('abort', () => refuser(new DOMException('abandon', 'AbortError')))
        })
      })
      let fin: unknown = 'en cours'
      void toutLire(genererAnalyse({ ...options, fetch: appel as never })).catch(e => { fin = e })
      await vi.advanceTimersByTimeAsync(4 * 60_000 + 59_000)
      expect(signaux[0].aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(2_000)
      expect(signaux[0].aborted).toBe(true)
      await vi.advanceTimersByTimeAsync(20 * 60_000)
      expect(fin).toBeInstanceOf(ErreurIa)
    } finally {
      vi.useRealTimers()
    }
  })
})
