import { lireCorps, parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { iaPourJeton } from '../../../../../server/ia'
import { schemaReponse } from '../../../../../server/schemas'
import { repondre } from '../../../../../server/services/entretiens'

export const onRequestPost = route<'jeton'>(async contexte => {
  const { request, env, params } = contexte
  const jeton = parametre(params.jeton)
  const { ordre, reponse } = await lireCorps(request, schemaReponse)
  const ia = await iaPourJeton(env, jeton, p => contexte.waitUntil(p))
  return json(await repondre(env.DB, ia, jeton, ordre, reponse))
})
