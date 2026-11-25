import { parametre, route } from '../../../../../server/api'
import { ErreurMetier } from '../../../../../server/erreurs'
import { json } from '../../../../../server/http'
import { repondreAnalyse } from '../../../../../server/ia/analyse'
import { listerAnalyses } from '../../../../../server/services/analyses'
import { TYPES_ANALYSE, type TypeAnalyse } from '../../../../../shared/analyses'

export const onRequestGet = route<'id'>(async ({ request, env, params }) => {
  const recherche = new URL(request.url).searchParams
  const type = recherche.get('type') || undefined
  if (type && !TYPES_ANALYSE.includes(type as TypeAnalyse)) {
    throw new ErreurMetier(`Type d'analyse inconnu : ${type} (attendu : ${TYPES_ANALYSE.join(', ')}).`)
  }
  return json(await listerAnalyses(env.DB, {
    projet_id: parametre(params.id),
    questionnaire_id: recherche.get('questionnaire_id') || undefined,
    repondant_id: recherche.get('repondant_id') || undefined,
    type: type as TypeAnalyse | undefined,
  }))
})

/** Réponse en flux : voir `repondreAnalyse`. */
export const onRequestPost = route<'id'>(contexte => repondreAnalyse(contexte))
