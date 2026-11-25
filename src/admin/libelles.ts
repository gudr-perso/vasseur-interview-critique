import type { TypeAnalyse } from '../../shared/analyses'
import type { Modele } from '../../shared/modeles'
import type { Mode, StatutProjet, StatutQuestionnaire, TypeDemande, TypeQuestion } from '../../shared/interviews'
import type { RepondantResume, StatutRepondant } from '../../shared/repondants'

export const LIBELLES_TYPE_DEMANDE: Record<TypeDemande, string> = {
  evolution_simple: 'Évolution simple',
  amelioration: 'Amélioration',
  nouvelle_fonctionnalite: 'Nouvelle fonctionnalité',
}

export const LIBELLES_STATUT_PROJET: Record<StatutProjet, string> = {
  brouillon: 'Brouillon',
  cadre: 'Cadré',
  en_cours: 'En cours',
  clos: 'Clos',
}

export const LIBELLES_STATUT_QUESTIONNAIRE: Record<StatutQuestionnaire, string> = {
  brouillon: 'Brouillon',
  ouvert: 'Ouvert',
  clos: 'Clos',
}

export const LIBELLES_MODE: Record<Mode, string> = {
  hybride: 'Hybride (questions + relances)',
  entretien: 'Entretien (conversation guidée)',
}

export const LIBELLES_TYPE_QUESTION: Record<TypeQuestion, string> = {
  texte: 'Texte libre',
  choix_unique: 'Choix unique',
  choix_multiple: 'Choix multiple',
  echelle: 'Échelle de 1 à 5',
}

export const LIBELLES_STATUT_REPONDANT: Record<StatutRepondant, string> = {
  invite: 'Invité',
  commence: 'Commencé',
  termine: 'Terminé',
}

export const LIBELLES_ORIGINE: Record<RepondantResume['origine'], string> = {
  invitation: 'Invitation',
  lien_generique: 'Lien générique',
}

export const LIBELLES_TYPE_ANALYSE: Record<TypeAnalyse, string> = {
  fiche_repondant: 'Fiche répondant',
  synthese: 'Synthèse',
  expression_besoin: 'Expression de besoin',
}

/** Source d'une analyse : « Claude (MCP) », ou le nom du modèle API (son identifiant s'il est inconnu). */
export function libelleSource(source: string, modeles: readonly Modele[]): string {
  if (source === 'mcp') return 'Claude (MCP)'
  return modeles.find(m => m.id === source)?.nom ?? source
}

/** Libellé d'une valeur reçue du serveur sous forme de chaîne ; la valeur brute si elle est inconnue. */
export function libelle(table: Record<string, string>, valeur: string): string {
  return table[valeur] ?? valeur
}

/** Options d'une liste déroulante, dans l'ordre des `valeurs`. */
export function optionsDe<V extends string>(valeurs: readonly V[], table: Record<V, string>): { valeur: V; libelle: string }[] {
  return valeurs.map(valeur => ({ valeur, libelle: table[valeur] }))
}

const FORMAT_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

/** « 2026-11-25T10:00:00Z » → « 25 nov. 2026 » ; la valeur brute si ce n'est pas une date. */
export function formaterDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : FORMAT_DATE.format(date)
}

const FORMAT_DATE_HEURE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

/** « 2026-11-25T10:00:00Z » → « 25 nov. 2026, 11:00 » (heure locale) ; la valeur brute si ce n'est pas une date. */
export function formaterDateHeure(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : FORMAT_DATE_HEURE.format(date)
}

export function nombre(n: number): string {
  return n.toLocaleString('fr-FR')
}
