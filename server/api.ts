import type { z } from './zod'
import type { Env } from './env'
import { ErreurMetier } from './erreurs'
import { erreur } from './http'

/**
 * Enveloppe d'une route admin : une erreur métier devient une réponse JSON à son statut,
 * toute autre erreur est journalisée et masquée derrière un 500 générique.
 */
export function route<P extends string = never>(
  traiter: (contexte: EventContext<Env, P, Record<string, unknown>>) => Promise<Response>,
): PagesFunction<Env, P> {
  return async contexte => {
    try {
      return await traiter(contexte)
    } catch (e) {
      if (e instanceof ErreurMetier) return erreur(e.message, e.statut)
      console.error('API admin :', e)
      return erreur('Erreur interne du serveur.', 500)
    }
  }
}

/** Lit le corps JSON et le valide ; l'erreur nomme les champs fautifs. */
export async function lireCorps<S extends z.ZodType>(requete: Request, schema: S): Promise<z.infer<S>> {
  let brut: unknown
  try {
    brut = await requete.json()
  } catch {
    throw new ErreurMetier('Corps de requête JSON invalide.')
  }
  const analyse = schema.safeParse(brut)
  if (!analyse.success) {
    const details = analyse.error.issues.map(i => `${i.path.join('.') || 'corps'} : ${i.message}`).join(' ; ')
    throw new ErreurMetier(`Données invalides — ${details}`)
  }
  return analyse.data
}

/** Paramètre de chemin `[id]` sous forme de chaîne. */
export function parametre(valeur: string | string[] | undefined): string {
  return Array.isArray(valeur) ? valeur[0] ?? '' : valeur ?? ''
}
