import { DUREE_SESSION_S, creerSession, enTeteCookie, motDePasseValide } from '../../../server/auth'
import type { Env } from '../../../server/env'
import { erreur, json } from '../../../server/http'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return erreur('ADMIN_PASSWORD ou SESSION_SECRET non configuré.', 500)
  }

  let corps: unknown
  try {
    corps = await request.json()
  } catch {
    return erreur('Corps de requête JSON invalide.', 400)
  }
  const saisi = (corps as { motDePasse?: unknown } | null)?.motDePasse
  const motDePasse = typeof saisi === 'string' ? saisi : ''

  if (!(await motDePasseValide(env.SESSION_SECRET, motDePasse, env.ADMIN_PASSWORD))) {
    await new Promise(resolve => setTimeout(resolve, 1000))
    return erreur('Mot de passe incorrect.', 401)
  }

  const session = await creerSession(env.SESSION_SECRET, env.ADMIN_PASSWORD, Date.now())
  return json({ ok: true }, 200, { 'Set-Cookie': enTeteCookie(session, DUREE_SESSION_S) })
}
