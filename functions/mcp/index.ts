import type { Env } from '../../server/env'
import { servirMcp } from '../../server/mcp/acces'

/** Accès par en-tête `Authorization: Bearer <jeton>`, pour les clients qui savent envoyer des en-têtes. */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const enTete = request.headers.get('Authorization') ?? ''
  // Le nom du schéma ne tient pas compte de la casse (RFC 9110, section 11.1).
  const jeton = /^Bearer\s+(.+)$/i.exec(enTete)?.[1].trim() ?? ''
  return servirMcp(request, env, jeton)
}
