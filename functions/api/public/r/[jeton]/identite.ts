import { lireCorps, parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { schemaIdentite } from '../../../../../server/schemas'
import { etapeCourante } from '../../../../../server/services/entretiens'
import { modifierIdentite } from '../../../../../server/services/repondants'

export const onRequestPut = route<'jeton'>(async ({ request, env, params }) => {
  const jeton = parametre(params.jeton)
  await modifierIdentite(env.DB, jeton, await lireCorps(request, schemaIdentite))
  return json(await etapeCourante(env.DB, jeton))
})
