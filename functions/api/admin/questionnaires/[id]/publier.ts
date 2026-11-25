import { parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { publierQuestionnaire } from '../../../../../server/services/questionnaires'

export const onRequestPost = route<'id'>(async ({ request, env, params }) => {
  const { questionnaire } = await publierQuestionnaire(env.DB, parametre(params.id), new URL(request.url).origin)
  return json(questionnaire)
})
