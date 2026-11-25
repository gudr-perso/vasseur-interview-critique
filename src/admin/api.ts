import type {
  Contenu, DocumentProjet, Logiciel, Mode, ProjetComplet, ProjetResume, Questionnaire, StatutProjet, TypeDemande,
} from '../../shared/interviews'
import type { Etape } from '../../shared/modeles'

export class ErreurApi extends Error {
  constructor(message: string, readonly statut: number) {
    super(message)
  }
}

async function appel<T>(methode: string, chemin: string, corps?: unknown): Promise<T> {
  let reponse: Response
  try {
    reponse = await fetch(`/api/admin${chemin}`, {
      method: methode,
      headers: corps === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    })
  } catch {
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
  return (reponse.status === 204 ? undefined : await reponse.json()) as T
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

export type ProjetAdmin = ProjetComplet & { nb_entretiens: number }

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
    modifier: (id: string, saisie: SaisieProjet) => appel<ProjetComplet>('PUT', `/projets/${id}`, saisie),
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
}

/** Adresse à diffuser aux répondants. */
export function urlQuestionnaire(code: string): string {
  return `${window.location.origin}/q/${code}`
}
