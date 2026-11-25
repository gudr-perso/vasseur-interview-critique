import { parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { terminer } from '../../../../../server/services/entretiens'

export const onRequestPost = route<'jeton'>(async ({ env, params }) => {
  return json(await terminer(env.DB, parametre(params.jeton)))
})
