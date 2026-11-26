import { parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { coutsProjet } from '../../../../../server/services/couts'

export const onRequestGet = route<'id'>(async ({ env, params }) => json(await coutsProjet(env.DB, parametre(params.id))))
