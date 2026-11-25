import { afterEach, describe, expect, it, vi } from 'vitest'
import { onRequestPost } from '../../functions/api/messages'
import { NOM_COOKIE, creerSession } from '../../server/auth'

const env = { ANTHROPIC_API_KEY: 'sk-test', SESSION_SECRET: 'secret-de-test' }

function requete(cookie?: string): Request {
  return new Request('https://exemple.test/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ model: 'claude-opus-5-5', max_tokens: 10, messages: [] }),
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
    const cookie = `${NOM_COOKIE}=${await creerSession(env.SESSION_SECRET, Date.now())}`

    const reponse = await onRequestPost({ request: requete(cookie), env } as never)

    expect(reponse.status).toBe(200)
    expect(await reponse.json()).toEqual({ content: [{ text: 'ok' }] })
    const [url, options] = faux.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect((options.headers as Record<string, string>)['x-api-key']).toBe('sk-test')
    expect(reponse.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
