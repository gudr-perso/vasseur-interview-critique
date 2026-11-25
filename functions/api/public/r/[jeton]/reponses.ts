import { lireCorps, parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { iaPourJeton } from '../../../../../server/ia'
import { schemaReponse } from '../../../../../server/schemas'
import { repondre } from '../../../../../server/services/entretiens'

export const onRequestPost = route<'jeton'>(async ({ request, env, params }) => {
  const jeton = parametre(params.jeton)
  const { ordre, reponse } = await lireCorps(request, schemaReponse)
  return json(await repondre(env.DB, await iaPourJeton(env, jeton), jeton, ordre, reponse))
})
