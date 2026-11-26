import { parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { iaPourJeton } from '../../../../../server/ia'
import { relancerSuite } from '../../../../../server/services/entretiens'

export const onRequestPost = route<'jeton'>(async contexte => {
  const { env, params } = contexte
  const jeton = parametre(params.jeton)
  const ia = await iaPourJeton(env, jeton, p => contexte.waitUntil(p))
  return json(await relancerSuite(env.DB, ia, jeton))
})
