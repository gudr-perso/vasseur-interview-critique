import { parametre, route } from '../../../../../../server/api'
import { json } from '../../../../../../server/http'
import { etatDialogue } from '../../../../../../server/ia/cadrage'
import { effacerDialogue } from '../../../../../../server/services/cadrage'

/** Dialogue de cadrage enregistré, plafond et questions posées. */
export const onRequestGet = route<'id'>(async ({ env, params }) => json(await etatDialogue(env.DB, parametre(params.id))))

/** « Recommencer le dialogue » : efface les messages, pas la note de cadrage. */
export const onRequestDelete = route<'id'>(async ({ env, params }) => {
  await effacerDialogue(env.DB, parametre(params.id))
  return new Response(null, { status: 204 })
})
