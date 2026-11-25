import { parametre, route } from '../../../../server/api'
import { json } from '../../../../server/http'
import { lireEntretien, supprimerRepondant } from '../../../../server/services/repondants'

export const onRequestGet = route<'id'>(async ({ env, params }) => {
  return json(await lireEntretien(env.DB, parametre(params.id)))
})

export const onRequestDelete = route<'id'>(async ({ env, params }) => {
  await supprimerRepondant(env.DB, parametre(params.id))
  return new Response(null, { status: 204 })
})
