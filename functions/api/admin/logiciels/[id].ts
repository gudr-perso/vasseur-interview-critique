import { lireCorps, parametre, route } from '../../../../server/api'
import { json } from '../../../../server/http'
import { schemaLogiciel } from '../../../../server/schemas'
import { enregistrerLogiciel, lireLogiciel } from '../../../../server/services/logiciels'

export const onRequestGet = route<'id'>(async ({ env, params }) => json(await lireLogiciel(env.DB, parametre(params.id))))

export const onRequestPut = route<'id'>(async ({ request, env, params }) => {
  const saisie = await lireCorps(request, schemaLogiciel)
  return json(await enregistrerLogiciel(env.DB, { id: parametre(params.id), ...saisie }))
})
