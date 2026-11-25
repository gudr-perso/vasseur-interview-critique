import { parametre, route } from '../../../../../server/api'
import { exporterReponses, lireOptionsExport, reponseExport } from '../../../../../server/services/exports'
import { lireQuestionnaire } from '../../../../../server/services/questionnaires'

export const onRequestGet = route<'id'>(async ({ request, env, params }) => {
  const { format, inclure_en_cours } = lireOptionsExport(new URL(request.url))
  const questionnaire = await lireQuestionnaire(env.DB, parametre(params.id))
  return reponseExport(await exporterReponses(
    env.DB, { projet_id: questionnaire.projet_id, questionnaire_id: questionnaire.id, inclure_en_cours }, format,
  ))
})
