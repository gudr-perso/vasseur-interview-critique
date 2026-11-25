import { parametre, route } from '../../../../../server/api'
import { exporterReponses, lireOptionsExport, reponseExport } from '../../../../../server/services/exports'

export const onRequestGet = route<'id'>(async ({ request, env, params }) => {
  const { format, inclure_en_cours } = lireOptionsExport(new URL(request.url))
  return reponseExport(await exporterReponses(env.DB, { projet_id: parametre(params.id), inclure_en_cours }, format))
})
