import { parametre, route } from '../../../../server/api'
import { json } from '../../../../server/http'
import { lireAnalyse, supprimerAnalyse } from '../../../../server/services/analyses'

export const onRequestGet = route<'id'>(async ({ env, params }) => json(await lireAnalyse(env.DB, parametre(params.id))))

export const onRequestDelete = route<'id'>(async ({ env, params }) => {
  await supprimerAnalyse(env.DB, parametre(params.id))
  return new Response(null, { status: 204 })
})
