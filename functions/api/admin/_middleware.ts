import { exigerAdmin } from '../../../server/auth'
import type { Env } from '../../../server/env'

export const onRequest: PagesFunction<Env> = async (contexte) => {
  if (new URL(contexte.request.url).pathname === '/api/admin/login') return contexte.next()
  const refus = await exigerAdmin(contexte.request, contexte.env)
  return refus ?? contexte.next()
}
