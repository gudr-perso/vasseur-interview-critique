import { chainesEgales } from '../auth'
import type { Env } from '../env'
import { erreur } from '../http'
import { traiterRequeteMcp } from './serveur'

/** Vérifie le jeton présenté puis passe la main au serveur MCP. */
export async function servirMcp(requete: Request, env: Env, jetonPresente: string): Promise<Response> {
  if (!env.MCP_TOKEN) return erreur('MCP_TOKEN non configuré.', 500)
  if (!(await chainesEgales(jetonPresente, env.MCP_TOKEN))) return erreur('Jeton MCP invalide.', 401)
  return traiterRequeteMcp(requete, { db: env.DB, origine: new URL(requete.url).origin })
}
