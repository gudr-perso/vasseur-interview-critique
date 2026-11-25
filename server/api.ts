import type { z } from './zod'
import type { Env } from './env'
import { ErreurMetier } from './erreurs'
import { erreur } from './http'

/** Taille maximale d'un corps de requête par défaut : largement assez pour une identité ou une réponse. */
export const CORPS_MAX = 64 * 1024
/** Routes admin qui reçoivent de longs textes (documents, note de cadrage, contenu d'un questionnaire). */
export const CORPS_ADMIN_MAX = 2 * 1024 * 1024

/** Surface de l'API d'après le chemin, pour le journal ; jamais le chemin lui-même, qui peut contenir un jeton. */
function surface(requete: Request | undefined): string {
  try {
    const chemin = requete ? new URL(requete.url).pathname : ''
    if (chemin.startsWith('/api/public/')) return 'API publique'
    if (chemin.startsWith('/api/admin/')) return 'API admin'
  } catch {
    // URL illisible : libellé neutre.
  }
  return 'API'
}

/**
 * Enveloppe d'une route : une erreur métier devient une réponse JSON à son statut,
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
      console.error(`${surface(contexte?.request)} :`, e)
      return erreur('Erreur interne du serveur.', 500)
    }
  }
}

function tropGros(max: number): ErreurMetier {
  return new ErreurMetier(`Requête trop volumineuse (${Math.round(max / 1024)} Ko au plus).`, 413)
}

/** Texte du corps, en s'arrêtant dès que `max` octets sont dépassés. */
async function lireTexte(requete: Request, max: number): Promise<string> {
  const annonce = Number(requete.headers.get('Content-Length'))
  if (Number.isFinite(annonce) && annonce > max) throw tropGros(max)
  if (!requete.body) return ''
  const lecteur = requete.body.getReader()
  const morceaux: Uint8Array[] = []
  let taille = 0
  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    taille += value.byteLength
    if (taille > max) {
      await lecteur.cancel().catch(() => {})
      throw tropGros(max)
    }
    morceaux.push(value)
  }
  const tout = new Uint8Array(taille)
  let position = 0
  for (const m of morceaux) { tout.set(m, position); position += m.byteLength }
  return new TextDecoder().decode(tout)
}

/** Lit le corps JSON (`max` octets au plus) et le valide ; l'erreur nomme les champs fautifs. */
export async function lireCorps<S extends z.ZodType>(
  requete: Request, schema: S, max: number = CORPS_MAX,
): Promise<z.infer<S>> {
  const texte = await lireTexte(requete, max)
  let brut: unknown
  try {
    brut = JSON.parse(texte)
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
