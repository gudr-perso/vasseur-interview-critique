import { parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { cloreQuestionnaire } from '../../../../../server/services/questionnaires'

export const onRequestPost = route<'id'>(async ({ env, params }) => json(await cloreQuestionnaire(env.DB, parametre(params.id))))
