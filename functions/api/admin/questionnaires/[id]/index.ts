import { CORPS_ADMIN_MAX, lireCorps, parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { schemaQuestionnaire } from '../../../../../server/schemas'
import { enregistrerQuestionnaire, lireQuestionnaire, supprimerQuestionnaire } from '../../../../../server/services/questionnaires'

export const onRequestGet = route<'id'>(async ({ env, params }) => json(await lireQuestionnaire(env.DB, parametre(params.id))))

export const onRequestPut = route<'id'>(async ({ request, env, params }) => {
  const id = parametre(params.id)
  const saisie = await lireCorps(request, schemaQuestionnaire, CORPS_ADMIN_MAX)
  // Le projet d'un questionnaire ne change pas : on reprend celui de l'existant.
  const existant = await lireQuestionnaire(env.DB, id)
  return json(await enregistrerQuestionnaire(env.DB, { id, projet_id: existant.projet_id, ...saisie }))
})

export const onRequestDelete = route<'id'>(async ({ env, params }) => {
  await supprimerQuestionnaire(env.DB, parametre(params.id))
  return new Response(null, { status: 204 })
})
