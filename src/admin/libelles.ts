import type { Mode, StatutProjet, StatutQuestionnaire, TypeDemande, TypeQuestion } from '../../shared/interviews'

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

export function nombre(n: number): string {
  return n.toLocaleString('fr-FR')
}
