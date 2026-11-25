import { lireCorps, route } from '../../../../server/api'
import { ErreurMetier } from '../../../../server/erreurs'
import { json } from '../../../../server/http'
import { schemaCreationProjet } from '../../../../server/schemas'
import { STATUTS_PROJET, creerProjet, listerProjets, type StatutProjet } from '../../../../server/services/projets'

export const onRequestGet = route(async ({ request, env }) => {
  const recherche = new URL(request.url).searchParams
  const statut = recherche.get('statut') || undefined
  if (statut && !STATUTS_PROJET.includes(statut as StatutProjet)) {
    throw new ErreurMetier(`Statut inconnu : ${statut}`)
  }
  return json(await listerProjets(env.DB, {
    statut: statut as StatutProjet | undefined,
    logiciel_id: recherche.get('logiciel_id') || undefined,
  }))
})

export const onRequestPost = route(async ({ request, env }) => {
  return json(await creerProjet(env.DB, await lireCorps(request, schemaCreationProjet)), 201)
})
