import { lireCorps, parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { schemaInvitation } from '../../../../../server/schemas'
import { lireQuestionnaire } from '../../../../../server/services/questionnaires'
import { creerInvitation, listerRepondants } from '../../../../../server/services/repondants'

export const onRequestGet = route<'id'>(async ({ env, params }) => {
  const id = parametre(params.id)
  await lireQuestionnaire(env.DB, id)
  return json(await listerRepondants(env.DB, id))
})

export const onRequestPost = route<'id'>(async ({ request, env, params }) => {
  const identite = await lireCorps(request, schemaInvitation)
  return json(await creerInvitation(env.DB, parametre(params.id), identite), 201)
})
