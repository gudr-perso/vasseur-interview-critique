import { lireCorps, parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { schemaModificationProjet } from '../../../../../server/schemas'
import { compterEntretiens, lireProjet, modifierProjet, supprimerProjet } from '../../../../../server/services/projets'

export const onRequestGet = route<'id'>(async ({ env, params }) => {
  const id = parametre(params.id)
  const projet = await lireProjet(env.DB, id)
  return json({ ...projet, nb_entretiens: await compterEntretiens(env.DB, id) })
})

export const onRequestPut = route<'id'>(async ({ request, env, params }) => {
  const modifs = await lireCorps(request, schemaModificationProjet)
  return json(await modifierProjet(env.DB, parametre(params.id), modifs))
})

export const onRequestDelete = route<'id'>(async ({ env, params }) => {
  await supprimerProjet(env.DB, parametre(params.id))
  return new Response(null, { status: 204 })
})
