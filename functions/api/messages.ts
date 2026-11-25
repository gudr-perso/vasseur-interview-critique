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

  let reponse: Response
  try {
    reponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(corps),
    })
  } catch (e) {
    console.error('Appel Anthropic impossible', e)
    return erreur('Service Anthropic injoignable.', 502)
  }

  // Un 401/403 d'Anthropic signale une clé refusée, pas une session expirée : le front les confondrait.
  if (reponse.status === 401 || reponse.status === 403) {
    return erreur('Clé API Anthropic refusée. Vérifiez ANTHROPIC_API_KEY.', 502)
  }

  return new Response(await reponse.text(), {
    status: reponse.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
