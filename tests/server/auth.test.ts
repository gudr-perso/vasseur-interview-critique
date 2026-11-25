import { describe, expect, it } from 'vitest'
import {
  DUREE_SESSION_S, NOM_COOKIE, creerSession, enTeteCookie, exigerAdmin,
  lireCookie, motDePasseValide, sessionValide,
} from '../../server/auth'

const SECRET = 'secret-de-test'
const T0 = 1_800_000_000_000

function requete(cookie?: string): Request {
  return new Request('https://exemple.test/api/admin/session', {
    headers: cookie ? { Cookie: cookie } : {},
  })
}

describe('session', () => {
  it('accepte une session fraîchement créée', async () => {
    const session = await creerSession(SECRET, T0)
    expect(await sessionValide(SECRET, session, T0 + 1000)).toBe(true)
  })

  it('refuse une session expirée', async () => {
    const session = await creerSession(SECRET, T0)
    expect(await sessionValide(SECRET, session, T0 + DUREE_SESSION_S * 1000 + 1)).toBe(false)
  })

  it('refuse une session signée avec un autre secret', async () => {
    const session = await creerSession('autre-secret', T0)
    expect(await sessionValide(SECRET, session, T0)).toBe(false)
  })

  it("refuse une échéance modifiée à la main", async () => {
    const session = await creerSession(SECRET, T0)
    const [, signature] = session.split('.')
    expect(await sessionValide(SECRET, `${T0 + 10 ** 12}.${signature}`, T0)).toBe(false)
  })

  it('refuse les valeurs vides ou mal formées', async () => {
    for (const valeur of [null, '', 'abc', '1.2.3', '.x']) {
      expect(await sessionValide(SECRET, valeur, T0)).toBe(false)
    }
  })
})

describe('mot de passe', () => {
  it('accepte le bon et refuse les autres', async () => {
    expect(await motDePasseValide(SECRET, 'sésame', 'sésame')).toBe(true)
    expect(await motDePasseValide(SECRET, 'sesame', 'sésame')).toBe(false)
    expect(await motDePasseValide(SECRET, '', 'sésame')).toBe(false)
  })
})

describe('cookie', () => {
  it('lit le cookie parmi plusieurs', () => {
    expect(lireCookie(requete(`a=1; ${NOM_COOKIE}=xyz; b=2`), NOM_COOKIE)).toBe('xyz')
    expect(lireCookie(requete('a=1'), NOM_COOKIE)).toBeNull()
    expect(lireCookie(requete(), NOM_COOKIE)).toBeNull()
  })

  it('pose un cookie HttpOnly, Secure, SameSite=Lax', () => {
    const enTete = enTeteCookie('xyz', 60)
    expect(enTete).toBe(`${NOM_COOKIE}=xyz; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=60`)
  })
})

describe('exigerAdmin', () => {
  const env = { SESSION_SECRET: SECRET }

  it('laisse passer une session valide', async () => {
    const session = await creerSession(SECRET, T0)
    expect(await exigerAdmin(requete(`${NOM_COOKIE}=${session}`), env, T0)).toBeNull()
  })

  it('répond 401 sans session', async () => {
    const refus = await exigerAdmin(requete(), env, T0)
    expect(refus?.status).toBe(401)
    expect(await refus?.json()).toEqual({ error: { message: 'Authentification requise.' } })
  })

  it('répond 500 si le secret manque', async () => {
    const refus = await exigerAdmin(requete(), { SESSION_SECRET: '' }, T0)
    expect(refus?.status).toBe(500)
  })
})
