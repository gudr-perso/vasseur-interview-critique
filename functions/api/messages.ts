import { exigerAdmin } from '../../server/auth'
import type { Env } from '../../server/env'
import { erreur } from '../../server/http'

/**
 * Relais vers l'API Messages d'Anthropic pour l'interview critique.
 * Réservé à la session admin : sans ce contrôle, n'importe qui pourrait consommer la clé API.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const refus = await exigerAdmin(request, env)
  if (refus) return refus

  if (!env.ANTHROPIC_API_KEY) return erreur('ANTHROPIC_API_KEY non configurée.', 500)

  let corps: unknown
  try {
    corps = await request.json()
  } catch {
    return erreur('Corps de requête JSON invalide.', 400)
  }

  const reponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(corps),
  })

  return new Response(await reponse.text(), {
    status: reponse.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
