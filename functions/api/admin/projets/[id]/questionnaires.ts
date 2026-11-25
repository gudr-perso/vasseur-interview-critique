import { CORPS_ADMIN_MAX, lireCorps, parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { schemaQuestionnaire } from '../../../../../server/schemas'
import { enregistrerQuestionnaire } from '../../../../../server/services/questionnaires'

export const onRequestPost = route<'id'>(async ({ request, env, params }) => {
  const saisie = await lireCorps(request, schemaQuestionnaire, CORPS_ADMIN_MAX)
  return json(await enregistrerQuestionnaire(env.DB, { projet_id: parametre(params.id), ...saisie }), 201)
})
