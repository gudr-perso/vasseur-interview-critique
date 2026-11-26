import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { onRequestPost } from '../../functions/api/messages'
import { NOM_COOKIE, creerSession } from '../../server/auth'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
let env: { ANTHROPIC_API_KEY: string; SESSION_SECRET: string; ADMIN_PASSWORD: string; DB: D1Database }
beforeAll(async () => {
  base = await creerBaseDeTest()
  env = { ANTHROPIC_API_KEY: 'sk-test', SESSION_SECRET: 'secret-de-test', ADMIN_PASSWORD: 'sésame', DB: base.db }
})
afterAll(async () => { await base.fermer() })

/** Contexte de la route : `tache()` attend le travail confié à waitUntil (l'enregistrement du coût). */
function contexte(request: Request, envRoute: object = env) {
  const enCours: Promise<unknown>[] = []
  return {
    valeur: { request, env: envRoute, waitUntil: (p: Promise<unknown>) => { enCours.push(p) } } as never,
    tache: () => Promise.all(enCours),
    enCours,
  }
}

const CORPS = { model: 'claude-opus-5-5', max_tokens: 10, messages: [{ role: 'user', content: 'Bonjour é' }] }

async function cookieValide(): Promise<string> {
  return `${NOM_COOKIE}=${await creerSession(env.SESSION_SECRET, env.ADMIN_PASSWORD, Date.now())}`
}

function requete(cookie?: string): Request {
  return new Request('https://exemple.test/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(CORPS),
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('POST /api/messages', () => {
  it("répond 401 sans session et n'appelle pas Anthropic", async () => {
    const faux = vi.fn()
    vi.stubGlobal('fetch', faux)
    const reponse = await onRequestPost(contexte(requete()).valeur)
    expect(reponse.status).toBe(401)
    expect(faux).not.toHaveBeenCalled()
  })

  it('relaie vers Anthropic avec une session valide', async () => {
    const faux = vi.fn(async () => new Response(JSON.stringify({ content: [{ text: 'ok' }] }), { status: 200 }))
    vi.stubGlobal('fetch', faux)
    const cookie = `${NOM_COOKIE}=${await creerSession(env.SESSION_SECRET, env.ADMIN_PASSWORD, Date.now())}`

    const reponse = await onRequestPost(contexte(requete(cookie)).valeur)

    expect(reponse.status).toBe(200)
    expect(await reponse.json()).toEqual({ content: [{ text: 'ok' }] })
    const [url, options] = faux.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect((options.headers as Record<string, string>)['x-api-key']).toBe('sk-test')
    expect(reponse.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('transmet le corps à l\'identique et ne transmet pas le cookie', async () => {
    const faux = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', faux)
    await onRequestPost(contexte(requete(await cookieValide())).valeur)
    const [, options] = faux.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(options.body as string)).toEqual(CORPS)
    const entetes = new Headers(options.headers)
    expect(entetes.get('Cookie')).toBeNull()
    expect(entetes.get('x-api-key')).toBe('sk-test')
  })

  it('répond 500 si ANTHROPIC_API_KEY est vide', async () => {
    const faux = vi.fn()
    vi.stubGlobal('fetch', faux)
    const reponse = await onRequestPost(contexte(requete(await cookieValide()), { ...env, ANTHROPIC_API_KEY: '' }).valeur)
    expect(reponse.status).toBe(500)
    expect(faux).not.toHaveBeenCalled()
  })

  it.each([401, 403])('transforme un %i d\'Anthropic en 502', async (statut) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"invalid x-api-key"}}', { status: statut })))
    const reponse = await onRequestPost(contexte(requete(await cookieValide())).valeur)
    expect(reponse.status).toBe(502)
    expect(await reponse.json()).toEqual({
      error: { message: 'Clé API Anthropic refusée. Vérifiez ANTHROPIC_API_KEY.' },
    })
  })

  it('répond 502 JSON si Anthropic est injoignable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('réseau') }))
    const reponse = await onRequestPost(contexte(requete(await cookieValide())).valeur)
    expect(reponse.status).toBe(502)
    expect(await reponse.json()).toEqual({ error: { message: 'Service Anthropic injoignable.' } })
  })

  describe("coût de l'interview critique", () => {
    afterEach(async () => {
      vi.restoreAllMocks()
      await base.db.prepare('DELETE FROM consommation_ia').run()
    })
    const lignes = async () => (await base.db.prepare('SELECT * FROM consommation_ia').all<Record<string, unknown>>()).results
    const corpsApi = {
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Bonjour é' }], usage: { input_tokens: 42, output_tokens: 7 },
    }

    it('écrit une ligne `interview_critique` sans projet et relaie la réponse inchangée', async () => {
      const brut = JSON.stringify(corpsApi)
      vi.stubGlobal('fetch', vi.fn(async () => new Response(brut, { status: 200, headers: { 'Content-Type': 'application/json' } })))
      const ctx = contexte(requete(await cookieValide()))
      const reponse = await onRequestPost(ctx.valeur)
      expect(reponse.status).toBe(200)
      expect(reponse.headers.get('Content-Type')).toBe('application/json')
      expect(await reponse.text()).toBe(brut)
      expect(ctx.enCours).toHaveLength(1)
      await ctx.tache()
      expect(await lignes()).toMatchObject([
        { poste: 'interview_critique', projet_id: null, modele: 'claude-opus-5-5', jetons_entree: 42, jetons_sortie: 7 },
      ])
    })

    it('relaie la réponse même sans waitUntil ni base disponible', async () => {
      const brut = JSON.stringify(corpsApi)
      vi.stubGlobal('fetch', vi.fn(async () => new Response(brut, { status: 200, headers: { 'Content-Type': 'application/json' } })))
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const { DB: _sansBase, ...sansBase } = env
      const reponse = await onRequestPost({ request: requete(await cookieValide()), env: sansBase } as never)
      expect(reponse.status).toBe(200)
      expect(await reponse.text()).toBe(brut)
    })
  })
})
