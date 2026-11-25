import { parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { iaPourJeton } from '../../../../../server/ia'
import { relancerSuite } from '../../../../../server/services/entretiens'

export const onRequestPost = route<'jeton'>(async ({ env, params }) => {
  const jeton = parametre(params.jeton)
  return json(await relancerSuite(env.DB, await iaPourJeton(env, jeton), jeton))
})
