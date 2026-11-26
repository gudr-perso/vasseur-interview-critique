import { route } from '../../../server/api'
import { ErreurMetier } from '../../../server/erreurs'
import { json } from '../../../server/http'
import { schemaDepuisCouts } from '../../../server/schemas'
import { coutsGlobaux } from '../../../server/services/couts'

export const onRequestGet = route(async ({ request, env }) => {
  const depuis = new URL(request.url).searchParams.get('depuis')
  if (depuis !== null && !schemaDepuisCouts.safeParse(depuis).success) {
    throw new ErreurMetier('Paramètre « depuis » invalide : attendu le premier jour d\'un mois, AAAA-MM-01.')
  }
  return json(await coutsGlobaux(env.DB, { depuis: depuis ?? undefined }))
})
