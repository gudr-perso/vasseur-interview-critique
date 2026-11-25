import { describe, expect, it } from 'vitest'
import { onRequest as garde } from '../../functions/api/admin/_middleware'
import { onRequestPost as login } from '../../functions/api/admin/login'
import { onRequestPost as logout } from '../../functions/api/admin/logout'
import { onRequestGet as session } from '../../functions/api/admin/session'
import { DUREE_SESSION_S, NOM_COOKIE, creerSession } from '../../server/auth'

const env = { ADMIN_PASSWORD: 'sésame', SESSION_SECRET: 'secret-de-test' }

function contexte(requete: Request, envLocal: object = env) {
  return { request: requete, env: envLocal, next: async () => new Response('suite') } as never
}

function post(chemin: string, corps?: unknown): Request {
  return new Request(`https://exemple.test${chemin}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
}

describe('POST /api/admin/login', () => {
  it('pose le cookie de session avec le bon mot de passe', async () => {
    const reponse = await login(contexte(post('/api/admin/login', { motDePasse: 'sésame' })))
    expect(reponse.status).toBe(200)
    expect(reponse.headers.get('Set-Cookie')).toMatch(new RegExp(`^${NOM_COOKIE}=\\d+\\.[0-9a-f]{64}; `))
  })

  it('répond 401 sans cookie avec un mauvais mot de passe, après un délai', async () => {
    const debut = Date.now()
    const reponse = await login(contexte(post('/api/admin/login', { motDePasse: 'faux' })))
    expect(reponse.status).toBe(401)
    expect(reponse.headers.get('Set-Cookie')).toBeNull()
    expect(Date.now() - debut).toBeGreaterThanOrEqual(950)
  })

  it('répond 400 sur un corps illisible', async () => {
    const requete = new Request('https://exemple.test/api/admin/login', { method: 'POST', body: 'pas du json' })
    expect((await login(contexte(requete))).status).toBe(400)
  })

  it('répond 500 si les secrets ne sont pas configurés', async () => {
    const reponse = await login(contexte(post('/api/admin/login', { motDePasse: 'x' }), { SESSION_SECRET: 's' }))
    expect(reponse.status).toBe(500)
  })

  it('répond 500 quand SESSION_SECRET manque', async () => {
    const reponse = await login(contexte(post('/api/admin/login', { motDePasse: 'sésame' }), { ADMIN_PASSWORD: 'sésame' }))
    expect(reponse.status).toBe(500)
  })
})

describe('garde /api/admin/*', () => {
  it('laisse passer le login sans session', async () => {
    const reponse = await garde(contexte(post('/api/admin/login', {})))
    expect(await reponse.text()).toBe('suite')
  })

  it('bloque les autres routes sans session', async () => {
    const reponse = await garde(contexte(new Request('https://exemple.test/api/admin/session')))
    expect(reponse.status).toBe(401)
  })

  it.each(['/api/admin/login/', '/api/admin/loginX'])('refuse %s sans session', async (chemin) => {
    const reponse = await garde(contexte(new Request(`https://exemple.test${chemin}`)))
    expect(reponse.status).toBe(401)
  })

  it('refuse un cookie expiré', async () => {
    const passe = Date.now() - (DUREE_SESSION_S * 1000 + 60_000)
    const cookie = `${NOM_COOKIE}=${await creerSession(env.SESSION_SECRET, env.ADMIN_PASSWORD, passe)}`
    const requete = new Request('https://exemple.test/api/admin/session', { headers: { Cookie: cookie } })
    expect((await garde(contexte(requete))).status).toBe(401)
  })

  it('refuse un cookie à signature falsifiée', async () => {
    const valeur = await creerSession(env.SESSION_SECRET, env.ADMIN_PASSWORD, Date.now())
    const [echeance, signature] = valeur.split('.')
    const falsifiee = `${echeance}.${(signature[0] === 'a' ? 'b' : 'a')}${signature.slice(1)}`
    const requete = new Request('https://exemple.test/api/admin/session', { headers: { Cookie: `${NOM_COOKIE}=${falsifiee}` } })
    expect((await garde(contexte(requete))).status).toBe(401)
  })

  it('refuse une session émise sous un autre mot de passe', async () => {
    const cookie = `${NOM_COOKIE}=${await creerSession(env.SESSION_SECRET, 'ancien', Date.now())}`
    const requete = new Request('https://exemple.test/api/admin/session', { headers: { Cookie: cookie } })
    expect((await garde(contexte(requete))).status).toBe(401)
  })

  it('laisse passer avec une session valide', async () => {
    const cookie = `${NOM_COOKIE}=${await creerSession(env.SESSION_SECRET, env.ADMIN_PASSWORD, Date.now())}`
    const requete = new Request('https://exemple.test/api/admin/session', { headers: { Cookie: cookie } })
    expect(await (await garde(contexte(requete))).text()).toBe('suite')
  })
})

describe('session et logout', () => {
  it('GET /api/admin/session répond ok', async () => {
    const reponse = await session(contexte(new Request('https://exemple.test/api/admin/session')))
    expect(await reponse.json()).toEqual({ ok: true })
  })

  it('POST /api/admin/logout efface le cookie', async () => {
    const reponse = await logout(contexte(post('/api/admin/logout')))
    const cookie = reponse.headers.get('Set-Cookie')!
    expect(cookie.startsWith(`${NOM_COOKIE}=;`)).toBe(true)
    expect(cookie).toContain('Max-Age=0')
    expect(cookie).toContain('HttpOnly; Secure; SameSite=Lax')
  })
})
