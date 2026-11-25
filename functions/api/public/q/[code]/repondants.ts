import { lireCorps, parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { schemaIdentite } from '../../../../../server/schemas'
import { creerRepondantGenerique } from '../../../../../server/services/repondants'

export const onRequestPost = route<'code'>(async ({ request, env, params }) => {
  const identite = await lireCorps(request, schemaIdentite)
  return json(await creerRepondantGenerique(env.DB, parametre(params.code), identite), 201)
})
