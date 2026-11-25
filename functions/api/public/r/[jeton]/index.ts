import { parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { etapeCourante } from '../../../../../server/services/entretiens'

export const onRequestGet = route<'jeton'>(async ({ env, params }) => {
  return json(await etapeCourante(env.DB, parametre(params.jeton)))
})
