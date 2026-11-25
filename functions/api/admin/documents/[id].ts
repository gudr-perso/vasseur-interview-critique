import { parametre, route } from '../../../../server/api'
import { supprimerDocument } from '../../../../server/services/projets'

export const onRequestDelete = route<'id'>(async ({ env, params }) => {
  await supprimerDocument(env.DB, parametre(params.id))
  return new Response(null, { status: 204 })
})
