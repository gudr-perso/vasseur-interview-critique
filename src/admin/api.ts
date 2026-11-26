import type { Analyse, AnalyseResume, SuccesAnalyse, TypeAnalyse } from '../../shared/analyses'
import type {
  DemandeTourCadrage, EnteteCadrage, EnteteTourCadrage, EtatDialogue, SuccesTexteCadrage, SuccesTourCadrage,
} from '../../shared/cadrage'
import type { EnteteGeneration, SuccesGeneration, SuccesPublics } from '../../shared/generation'
import type {
  Contenu, DocumentProjet, Logiciel, Mode, ProjetComplet, ProjetFiche, ProjetResume, Questionnaire, StatutProjet, TypeDemande,
} from '../../shared/interviews'
import type { Etape } from '../../shared/modeles'
import type { EntretienLu, Identite, RepondantResume } from '../../shared/repondants'
import { lireFlux, REPONSE_INATTENDUE, type FormatFlux, type ResultatFlux } from './flux'
import { FORMAT_ANALYSE, type EnteteAnalyse } from './fluxAnalyse'
import { FORMAT_PUBLICS, FORMAT_QUESTIONNAIRE, FORMAT_TEXTE_CADRAGE, FORMAT_TOUR } from './formatsFlux'

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

/** Reçoit le texte cumulé et les champs de l'en-tête, à chaque morceau. */
export type SurTexte<C> = (texte: string, entete: C) => void

/**
 * Envoie la demande et lit la réponse en flux (`./flux`). Les refus du serveur (400, 409, 503…) sont levés en
 * `ErreurApi` ; un échec en cours de route est renvoyé dans `erreur`, une coupure de lecture levée avec `coupure`.
 * Si `signal` est interrompu, l'erreur d'interruption est relancée telle quelle.
 */
async function appelEnFlux<C, S>(
  chemin: string, corps: unknown, format: FormatFlux<C, S>, coupure: string, surTexte: SurTexte<C>, signal?: AbortSignal,
): Promise<ResultatFlux<C, S>> {
  const reponse = await envoyer('POST', chemin, corps, signal)
  if (!reponse.body) throw new ErreurApi(REPONSE_INATTENDUE, reponse.status)
  try {
    return await lireFlux(reponse.body, format, surTexte)
  } catch (e) {
    if (signal?.aborted) throw e
    throw new ErreurApi(coupure, 0)
  }
}

const COUPURE_ANALYSE =
  "Connexion interrompue pendant la génération : l'analyse n'a sans doute pas été enregistrée. Actualisez la liste pour vérifier, sinon relancez-la."
const COUPURE_TOUR = "Connexion interrompue pendant la réponse de l'IA. Relancez-la."
const COUPURE_TEXTE = 'Connexion interrompue pendant la rédaction. Relancez-la.'
const COUPURE_PUBLICS = 'Connexion interrompue pendant la proposition des publics. Relancez-la.'
const COUPURE_QUESTIONNAIRE =
  "Connexion interrompue pendant la génération : le brouillon n'a sans doute pas été créé. Actualisez la page pour vérifier, sinon relancez-la."

export interface DemandeGenerationQuestionnaire {
  public_vise: string
  mode: Mode
  consignes?: string
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
    /** Publics proposés par l'IA ; rien n'est enregistré. */
    proposerPublics: (id: string, surTexte: SurTexte<EnteteGeneration>, signal?: AbortSignal) =>
      appelEnFlux<EnteteGeneration, SuccesPublics>(
        `/projets/${id}/questionnaires/publics`, {}, FORMAT_PUBLICS, COUPURE_PUBLICS, surTexte, signal),
    /** Questionnaire rédigé par l'IA, créé en brouillon. */
    genererQuestionnaire: (
      id: string, demande: DemandeGenerationQuestionnaire, surTexte: SurTexte<EnteteGeneration>, signal?: AbortSignal,
    ) => appelEnFlux<EnteteGeneration, SuccesGeneration>(
      `/projets/${id}/questionnaires/generer`, demande, FORMAT_QUESTIONNAIRE, COUPURE_QUESTIONNAIRE, surTexte, signal),
  },
  cadrage: {
    lire: (projetId: string) => appel<EtatDialogue>('GET', `/projets/${projetId}/cadrage`),
    /** Efface le dialogue ; la note de cadrage est conservée. */
    recommencer: (projetId: string) => appel<void>('DELETE', `/projets/${projetId}/cadrage`),
    /**
     * Un tour : `texte` est la réponse de l'admin, absent pour la première question ou pour relancer l'IA ; `apres`
     * est le dernier message affiché (`null` : dialogue vide). Un fil périmé est refusé (409).
     */
    tour: (projetId: string, demande: DemandeTourCadrage, surTexte: SurTexte<EnteteTourCadrage>, signal?: AbortSignal) =>
      appelEnFlux<EnteteTourCadrage, SuccesTourCadrage>(
        `/projets/${projetId}/cadrage/tour`, demande, FORMAT_TOUR, COUPURE_TOUR, surTexte, signal),
    /** Note de cadrage au fil de l'eau ; rien n'est enregistré. */
    note: (projetId: string, surTexte: SurTexte<EnteteCadrage>, signal?: AbortSignal) =>
      appelEnFlux<EnteteCadrage, SuccesTexteCadrage>(
        `/projets/${projetId}/cadrage/note`, undefined, FORMAT_TEXTE_CADRAGE, COUPURE_TEXTE, surTexte, signal),
    /** Résumé de contexte au fil de l'eau ; rien n'est enregistré. */
    resume: (projetId: string, surTexte: SurTexte<EnteteCadrage>, signal?: AbortSignal) =>
      appelEnFlux<EnteteCadrage, SuccesTexteCadrage>(
        `/projets/${projetId}/cadrage/resume`, undefined, FORMAT_TEXTE_CADRAGE, COUPURE_TEXTE, surTexte, signal),
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
    /** Analyse générée par l'IA et enregistrée à la fin du flux. */
    generer: (projetId: string, demande: DemandeAnalyse, surTexte: SurTexte<EnteteAnalyse>, signal?: AbortSignal) =>
      appelEnFlux<EnteteAnalyse, SuccesAnalyse>(
        `/projets/${projetId}/analyses`, demande, FORMAT_ANALYSE, COUPURE_ANALYSE, surTexte, signal),
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
