import { parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { lireAccueilParCode } from '../../../../../server/services/repondants'

export const onRequestGet = route<'code'>(async ({ env, params }) => {
  return json(await lireAccueilParCode(env.DB, parametre(params.code)))
})
