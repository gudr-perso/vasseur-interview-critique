import { lireCorps, parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { schemaDocument } from '../../../../../server/schemas'
import { ajouterDocument } from '../../../../../server/services/projets'

export const onRequestPost = route<'id'>(async ({ request, env, params }) => {
  const saisie = await lireCorps(request, schemaDocument)
  return json(await ajouterDocument(env.DB, parametre(params.id), saisie), 201)
})
