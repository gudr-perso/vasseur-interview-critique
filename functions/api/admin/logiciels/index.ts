import { lireCorps, route } from '../../../../server/api'
import { ErreurMetier } from '../../../../server/erreurs'
import { json } from '../../../../server/http'
import { schemaLogiciel } from '../../../../server/schemas'
import { enregistrerLogiciel, listerLogiciels, memeNom } from '../../../../server/services/logiciels'

export const onRequestGet = route(async ({ env }) => json(await listerLogiciels(env.DB)))

export const onRequestPost = route(async ({ request, env }) => {
  const saisie = await lireCorps(request, schemaLogiciel)
  // Le service, pensé pour Claude, met à jour une fiche de même nom ; ici, créer un doublon est une erreur de saisie.
  if ((await listerLogiciels(env.DB)).some(l => memeNom(l.nom, saisie.nom))) {
    throw new ErreurMetier(`Un logiciel nommé « ${saisie.nom.trim()} » existe déjà.`, 409)
  }
  return json(await enregistrerLogiciel(env.DB, saisie), 201)
})
