import { enTeteCookie } from '../../../server/auth'
import type { Env } from '../../../server/env'
import { json } from '../../../server/http'

export const onRequestPost: PagesFunction<Env> = async () => {
  return json({ ok: true }, 200, { 'Set-Cookie': enTeteCookie('', 0) })
}
