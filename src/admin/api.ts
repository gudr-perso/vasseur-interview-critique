import type { Analyse, AnalyseResume, TypeAnalyse } from '../../shared/analyses'
import type {
  Contenu, DocumentProjet, Logiciel, Mode, ProjetComplet, ProjetFiche, ProjetResume, Questionnaire, StatutProjet, TypeDemande,
} from '../../shared/interviews'
import type { Etape } from '../../shared/modeles'
import type { EntretienLu, Identite, RepondantResume } from '../../shared/repondants'
import { lireFluxAnalyse, REPONSE_INATTENDUE, type ResultatGeneration } from './fluxAnalyse'

export class ErreurApi extends Error {
  constructor(message: string, readonly statut: number) {
    super(message)
  }
}

/** Envoie la requête ; une réponse en erreur devient une `ErreurApi` portant le message du serveur. */
async function envoyer(methode: string, chemin: string, corps?: unknown, signal?: AbortSignal): Promise<Response> {
  let reponse: Response
  try {
    reponse = await fetch(`/api/admin${chemin}`, {
      method: methode,
      headers: corps === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      signal,
    })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new ErreurApi('Serveur injoignable. Vérifiez votre connexion.', 0)
  }
  if (reponse.status === 401) {
    // Session expirée : le rechargement ramène à l'écran de connexion.
    window.location.reload()
    throw new ErreurApi('Session expirée.', 401)
  }
  if (!reponse.ok) {
    const donnees = await reponse.json().catch(() => ({})) as { error?: { message?: string } }
    throw new ErreurApi(donnees.error?.message ?? `Erreur ${reponse.status}`, reponse.status)
  }
  return reponse
}

async function appel<T>(methode: string, chemin: string, corps?: unknown): Promise<T> {
  const reponse = await envoyer(methode, chemin, corps)
  return (reponse.status === 204 ? undefined : await reponse.json()) as T
}

export interface FiltreAnalyses {
  questionnaire_id?: string
  repondant_id?: string
  type?: TypeAnalyse
}

export interface DemandeAnalyse {
  type: TypeAnalyse
  questionnaire_id?: string
  repondant_id?: string
  inclure_en_cours?: boolean
}

const COUPURE_FLUX =
  "Connexion interrompue pendant la génération. L'analyse continue sans doute côté serveur : actualisez la liste dans quelques minutes."

/**
 * Lance une analyse et en suit le flux. `surTexte` reçoit le texte cumulé à chaque morceau.
 * Les refus du serveur (400, 413, 503…) sont levés en `ErreurApi` ; un échec en cours de route est
 * renvoyé dans `erreur`. Si `signal` est interrompu, l'erreur d'interruption est relancée telle quelle.
 */
async function generer(
  projetId: string, demande: DemandeAnalyse,
  surTexte: (texte: string, nb_entretiens: number) => void, signal?: AbortSignal,
): Promise<ResultatGeneration> {
  const reponse = await envoyer('POST', `/projets/${projetId}/analyses`, demande, signal)
  if (!reponse.body) throw new ErreurApi(REPONSE_INATTENDUE, reponse.status)
  try {
    return await lireFluxAnalyse(reponse.body, surTexte)
  } catch (e) {
    if (signal?.aborted) throw e
    throw new ErreurApi(COUPURE_FLUX, 0)
  }
}

export interface SaisieProjet {
  titre?: string
  type_demande?: TypeDemande
  description?: string
  note_cadrage?: string
  resume_contexte?: string
  statut?: StatutProjet
  logiciel_ids?: string[]
  modeles?: Partial<Record<Etape, string>>
}

export interface SaisieQuestionnaire {
  public_vise: string
  mode: Mode
  contenu: Contenu
  introduction?: string
  duree_estimee_min?: number
  relances_max_par_question?: number
  tours_max?: number
}

export type ProjetAdmin = ProjetFiche & { nb_entretiens: number }

export const api = {
  logiciels: {
    lister: () => appel<Logiciel[]>('GET', '/logiciels'),
    creer: (saisie: { nom: string; contexte?: string }) => appel<Logiciel>('POST', '/logiciels', saisie),
    modifier: (id: string, saisie: { nom: string; contexte?: string }) => appel<Logiciel>('PUT', `/logiciels/${id}`, saisie),
  },
  projets: {
    lister: (filtre: { logiciel_id?: string; statut?: StatutProjet } = {}) => {
      const recherche = new URLSearchParams()
      if (filtre.logiciel_id) recherche.set('logiciel_id', filtre.logiciel_id)
      if (filtre.statut) recherche.set('statut', filtre.statut)
      const suffixe = recherche.toString()
      return appel<ProjetResume[]>('GET', `/projets${suffixe ? `?${suffixe}` : ''}`)
    },
    lire: (id: string) => appel<ProjetAdmin>('GET', `/projets/${id}`),
    creer: (saisie: SaisieProjet & { titre: string; type_demande: TypeDemande }) => appel<ProjetComplet>('POST', '/projets', saisie),
    modifier: (id: string, saisie: SaisieProjet) => appel<ProjetFiche>('PUT', `/projets/${id}`, saisie),
    supprimer: (id: string) => appel<void>('DELETE', `/projets/${id}`),
    ajouterDocument: (id: string, saisie: { nom: string; contenu: string }) =>
      appel<DocumentProjet>('POST', `/projets/${id}/documents`, saisie),
    creerQuestionnaire: (id: string, saisie: SaisieQuestionnaire) =>
      appel<Questionnaire>('POST', `/projets/${id}/questionnaires`, saisie),
  },
  documents: {
    supprimer: (id: string) => appel<void>('DELETE', `/documents/${id}`),
  },
  questionnaires: {
    lire: (id: string) => appel<Questionnaire>('GET', `/questionnaires/${id}`),
    remplacer: (id: string, saisie: SaisieQuestionnaire) => appel<Questionnaire>('PUT', `/questionnaires/${id}`, saisie),
    supprimer: (id: string) => appel<void>('DELETE', `/questionnaires/${id}`),
    publier: (id: string) => appel<Questionnaire>('POST', `/questionnaires/${id}/publier`),
    clore: (id: string) => appel<Questionnaire>('POST', `/questionnaires/${id}/clore`),
  },
  repondants: {
    lister: (questionnaireId: string) => appel<RepondantResume[]>('GET', `/questionnaires/${questionnaireId}/repondants`),
    inviter: (questionnaireId: string, identite: Identite) =>
      appel<RepondantResume>('POST', `/questionnaires/${questionnaireId}/repondants`, identite),
    lireEntretien: (id: string) => appel<EntretienLu>('GET', `/repondants/${id}`),
    supprimer: (id: string) => appel<void>('DELETE', `/repondants/${id}`),
  },
  analyses: {
    lister: (projetId: string, filtre: FiltreAnalyses = {}) => {
      const recherche = new URLSearchParams()
      if (filtre.questionnaire_id) recherche.set('questionnaire_id', filtre.questionnaire_id)
      if (filtre.repondant_id) recherche.set('repondant_id', filtre.repondant_id)
      if (filtre.type) recherche.set('type', filtre.type)
      const suffixe = recherche.toString()
      return appel<AnalyseResume[]>('GET', `/projets/${projetId}/analyses${suffixe ? `?${suffixe}` : ''}`)
    },
    lire: (id: string) => appel<Analyse>('GET', `/analyses/${id}`),
    supprimer: (id: string) => appel<void>('DELETE', `/analyses/${id}`),
    generer,
  },
}

export type CibleExport = { projet_id: string } | { questionnaire_id: string }

/** Route de téléchargement des réponses d'un projet entier ou d'un questionnaire. */
export function urlExport(cible: CibleExport, format: 'csv' | 'md', inclureEnCours: boolean): string {
  const chemin = 'projet_id' in cible ? `projets/${cible.projet_id}` : `questionnaires/${cible.questionnaire_id}`
  return `/api/admin/${chemin}/export?format=${format}&inclure_en_cours=${inclureEnCours ? 1 : 0}`
}

/** Adresse à diffuser aux répondants. */
export function urlQuestionnaire(code: string): string {
  return `${window.location.origin}/q/${code}`
}

/** Lien personnel d'une invitation. */
export function urlInvitation(jeton: string): string {
  return `${window.location.origin}/r/${encodeURIComponent(jeton)}`
}
