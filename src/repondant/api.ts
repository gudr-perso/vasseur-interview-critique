import type { Mode } from '../../shared/interviews'
import type { EtatRepondant, Identite, Reponse } from '../../shared/repondants'
import { ErreurApi } from '../admin/api'
import { TEXTES } from './textes'

// Même classe d'erreur que l'admin : `useChargement` y lit le statut HTTP.
export { ErreurApi }

/** Accueil d'un lien générique : ce que le répondant voit avant de donner son identité. */
export interface Accueil {
  public_vise: string
  introduction: string
  duree_estimee_min: number
  mode: Mode
}

/** Appel d'une route publique. Aucune session ici : un 401 n'entraîne aucun rechargement. */
async function appel<T>(methode: string, chemin: string, corps?: unknown): Promise<T> {
  let reponse: Response
  try {
    reponse = await fetch(`/api/public${chemin}`, {
      method: methode,
      headers: corps === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    })
  } catch {
    throw new ErreurApi(TEXTES.erreurs.reseau, 0)
  }
  if (!reponse.ok) {
    const donnees = await reponse.json().catch(() => ({})) as { error?: { message?: string } }
    throw new ErreurApi(donnees.error?.message ?? TEXTES.erreurs.inattendue, reponse.status)
  }
  return (reponse.status === 204 ? undefined : await reponse.json()) as T
}

const segment = encodeURIComponent

export const repondantApi = {
  accueil: (code: string) => appel<Accueil>('GET', `/q/${segment(code)}`),
  commencer: (code: string, identite: Identite) =>
    appel<{ jeton: string }>('POST', `/q/${segment(code)}/repondants`, identite),
  etat: (jeton: string) => appel<EtatRepondant>('GET', `/r/${segment(jeton)}`),
  identite: (jeton: string, identite: Identite) => appel<EtatRepondant>('PUT', `/r/${segment(jeton)}/identite`, identite),
  repondre: (jeton: string, ordre: number, reponse: Reponse) =>
    appel<EtatRepondant>('POST', `/r/${segment(jeton)}/reponses`, { ordre, reponse }),
  suivant: (jeton: string) => appel<EtatRepondant>('POST', `/r/${segment(jeton)}/suivant`),
  terminer: (jeton: string) => appel<EtatRepondant>('POST', `/r/${segment(jeton)}/terminer`),
}

/** Statuts après lesquels l'état affiché n'est plus le bon : on relit l'état plutôt que d'afficher une erreur. */
export function exigeRelecture(e: unknown): boolean {
  return e instanceof ErreurApi && (e.statut === 404 || e.statut === 409 || e.statut === 410)
}

/** Erreur réseau : la saisie est conservée et le bouton propose de réessayer. */
export function estErreurReseau(e: unknown): boolean {
  return e instanceof ErreurApi && e.statut === 0
}
