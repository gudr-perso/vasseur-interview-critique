import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestPost } from '../../functions/api/messages'
import { NOM_COOKIE, creerSession } from '../../server/auth'

const env = { ANTHROPIC_API_KEY: 'sk-test', SESSION_SECRET: 'secret-de-test', ADMIN_PASSWORD: 'sésame' }

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
    const reponse = await onRequestPost({ request: requete(), env } as never)
    expect(reponse.status).toBe(401)
    expect(faux).not.toHaveBeenCalled()
  })

  it('relaie vers Anthropic avec une session valide', async () => {
    const faux = vi.fn(async () => new Response(JSON.stringify({ content: [{ text: 'ok' }] }), { status: 200 }))
    vi.stubGlobal('fetch', faux)
    const cookie = `${NOM_COOKIE}=${await creerSession(env.SESSION_SECRET, env.ADMIN_PASSWORD, Date.now())}`

    const reponse = await onRequestPost({ request: requete(cookie), env } as never)

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
    await onRequestPost({ request: requete(await cookieValide()), env } as never)
    const [, options] = faux.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(options.body as string)).toEqual(CORPS)
    const entetes = new Headers(options.headers)
    expect(entetes.get('Cookie')).toBeNull()
    expect(entetes.get('x-api-key')).toBe('sk-test')
  })

  it('répond 500 si ANTHROPIC_API_KEY est vide', async () => {
    const faux = vi.fn()
    vi.stubGlobal('fetch', faux)
    const reponse = await onRequestPost({
      request: requete(await cookieValide()), env: { ...env, ANTHROPIC_API_KEY: '' },
    } as never)
    expect(reponse.status).toBe(500)
    expect(faux).not.toHaveBeenCalled()
  })

  it.each([401, 403])('transforme un %i d\'Anthropic en 502', async (statut) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"invalid x-api-key"}}', { status: statut })))
    const reponse = await onRequestPost({ request: requete(await cookieValide()), env } as never)
    expect(reponse.status).toBe(502)
    expect(await reponse.json()).toEqual({
      error: { message: 'Clé API Anthropic refusée. Vérifiez ANTHROPIC_API_KEY.' },
    })
  })

  it('répond 502 JSON si Anthropic est injoignable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('réseau') }))
    const reponse = await onRequestPost({ request: requete(await cookieValide()), env } as never)
    expect(reponse.status).toBe(502)
    expect(await reponse.json()).toEqual({ error: { message: 'Service Anthropic injoignable.' } })
  })
})
