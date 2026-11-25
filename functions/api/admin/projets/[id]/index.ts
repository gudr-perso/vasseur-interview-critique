import { CORPS_ADMIN_MAX, lireCorps, parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { schemaModificationProjet } from '../../../../../server/schemas'
import { compterEntretiens, lireProjet, modifierProjet, supprimerProjet } from '../../../../../server/services/projets'
import { versProjetFiche } from '../../../../../shared/interviews'

// La fiche n'affiche que le nom et la taille des documents : leur contenu (jusqu'à 200 000 caractères chacun) ne part pas.

export const onRequestGet = route<'id'>(async ({ env, params }) => {
  const id = parametre(params.id)
  const projet = await lireProjet(env.DB, id)
  return json({ ...versProjetFiche(projet), nb_entretiens: await compterEntretiens(env.DB, id) })
})

export const onRequestPut = route<'id'>(async ({ request, env, params }) => {
  const modifs = await lireCorps(request, schemaModificationProjet, CORPS_ADMIN_MAX)
  return json(versProjetFiche(await modifierProjet(env.DB, parametre(params.id), modifs)))
})

export const onRequestDelete = route<'id'>(async ({ env, params }) => {
  await supprimerProjet(env.DB, parametre(params.id))
  return new Response(null, { status: 204 })
})
