import type { Env } from '../../../server/env'

/**
 * Toute réponse publique (erreurs comprises) échappe aux caches : elle dépend d'un code ou d'un jeton
 * personnel. Posé ici une fois pour toutes les routes de `functions/api/public/`, qui n'ont aucune garde de session.
 */
export const onRequest: PagesFunction<Env> = async (contexte) => {
  let reponse: Response
  try {
    reponse = await contexte.next()
  } catch (e) {
    console.error('API publique :', e)
    reponse = new Response(JSON.stringify({ error: { message: 'Erreur interne du serveur.' } }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
  const copie = new Response(reponse.body, reponse)
  copie.headers.set('Cache-Control', 'no-store')
  return copie
}
