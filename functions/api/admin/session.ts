import type { Env } from '../../../server/env'
import { json } from '../../../server/http'

/** Atteint seulement si la garde a validé la session. */
export const onRequestGet: PagesFunction<Env> = async () => json({ ok: true })
