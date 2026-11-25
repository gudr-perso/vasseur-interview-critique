import type { Env } from '../../server/env'
import { servirMcp } from '../../server/mcp/acces'

/** Accès par en-tête `Authorization: Bearer <jeton>`, pour les clients qui savent envoyer des en-têtes. */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const enTete = request.headers.get('Authorization') ?? ''
  const jeton = enTete.startsWith('Bearer ') ? enTete.slice('Bearer '.length).trim() : ''
  return servirMcp(request, env, jeton)
}
