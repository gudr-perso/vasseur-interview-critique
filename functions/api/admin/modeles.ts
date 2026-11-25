import type { Env } from '../../../server/env'
import { json } from '../../../server/http'
import { listerDepuisAnthropic, obtenirCatalogue } from '../../../server/modeles'

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return json(await obtenirCatalogue(() => listerDepuisAnthropic(env.ANTHROPIC_API_KEY)))
}
