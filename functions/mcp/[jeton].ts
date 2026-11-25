import type { Env } from '../../server/env'
import { servirMcp } from '../../server/mcp/acces'

/** Accès par jeton dans l'URL : la seule forme acceptée par un connecteur personnalisé sans OAuth. */
export const onRequest: PagesFunction<Env, 'jeton'> = async ({ request, env, params }) => {
  return servirMcp(request, env, String(params.jeton ?? ''))
}
