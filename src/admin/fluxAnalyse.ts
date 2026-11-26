// Lecture du flux renvoyé par `POST /api/admin/projets/:id/analyses` : le flux commun (`./flux`), dont l'en-tête
// porte le nombre d'entretiens analysés et la ligne de succès l'identifiant de l'analyse enregistrée.

import type { SuccesAnalyse } from '../../shared/analyses'
import { identifiant, LecteurFlux, lireFlux, type FormatFlux, type ObjetRecu, type ResultatFlux } from './flux'

export { ERREUR_SANS_MESSAGE, REPONSE_INATTENDUE } from './flux'

export interface ResultatGeneration {
  nb_entretiens: number
  texte: string
  /** Analyse enregistrée : présent seulement quand le serveur a confirmé le succès. */
  analyse_id?: string
  /** Présent si la génération a échoué ou si le flux s'est arrêté sans conclure. */
  erreur?: string
}

export const FLUX_INACHEVE =
  "La connexion s'est arrêtée avant la fin de la génération : l'analyse n'a sans doute pas été enregistrée. Actualisez la liste pour vérifier, sinon relancez-la."

export interface EnteteAnalyse {
  nb_entretiens: number
}

function lireEnteteAnalyse(valeur: ObjetRecu): EnteteAnalyse | null {
  const n = valeur.nb_entretiens
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? { nb_entretiens: n } : null
}

export const FORMAT_ANALYSE: FormatFlux<EnteteAnalyse, SuccesAnalyse> = {
  entete: lireEnteteAnalyse,
  succes: identifiant('analyse_id'),
  fluxCoupe: FLUX_INACHEVE,
}

function versResultatGeneration(resultat: ResultatFlux<EnteteAnalyse, SuccesAnalyse>): ResultatGeneration {
  const { entete, texte, succes, erreur } = resultat
  return {
    nb_entretiens: entete?.nb_entretiens ?? 0,
    texte,
    ...(succes ? { analyse_id: succes.analyse_id } : {}),
    ...(erreur === undefined ? {} : { erreur }),
  }
}

/** Accumule les morceaux d'octets reçus ; `texte` est ce qui peut être affiché à l'instant. */
export class LecteurFluxAnalyse {
  private readonly lecteur = new LecteurFlux(FORMAT_ANALYSE)

  get nb_entretiens(): number | null {
    return this.lecteur.entete?.nb_entretiens ?? null
  }

  get texte(): string {
    return this.lecteur.texte
  }

  ajouter(octets: Uint8Array): void {
    this.lecteur.ajouter(octets)
  }

  terminer(): ResultatGeneration {
    return versResultatGeneration(this.lecteur.terminer())
  }
}

/**
 * Lit tout le flux. `surTexte` reçoit le texte affichable cumulé chaque fois qu'il change.
 * Une coupure de lecture (réseau, arrêt demandé) est relancée telle quelle.
 */
export async function lireFluxAnalyse(
  flux: ReadableStream<Uint8Array>,
  surTexte: (texte: string, nb_entretiens: number) => void,
): Promise<ResultatGeneration> {
  const resultat = await lireFlux(flux, FORMAT_ANALYSE, (texte, entete) => surTexte(texte, entete.nb_entretiens))
  return versResultatGeneration(resultat)
}
