// Formats des flux du cadrage et de la génération des questionnaires (`shared/cadrage.ts`, `shared/generation.ts`),
// pour le lecteur commun `./flux` : chaque champ reçu est vérifié avant d'être utilisé.

import type {
  EnteteCadrage, EnteteTourCadrage, MessageCadrage, SuccesTexteCadrage, SuccesTourCadrage, TypeMessageCadrage,
} from '../../shared/cadrage'
import type { EnteteGeneration, PublicPropose, SuccesGeneration, SuccesPublics } from '../../shared/generation'
import { MODES } from '../../shared/interviews'
import { identifiant, type FormatFlux, type ObjetRecu } from './flux'

function entier(valeur: unknown): number | null {
  return typeof valeur === 'number' && Number.isInteger(valeur) && valeur >= 0 ? valeur : null
}

function enteteContexte(valeur: ObjetRecu): EnteteCadrage | null {
  return typeof valeur.contexte_tronque === 'boolean' ? { contexte_tronque: valeur.contexte_tronque } : null
}

function enteteTour(valeur: ObjetRecu): EnteteTourCadrage | null {
  const base = enteteContexte(valeur)
  const plafond = entier(valeur.plafond)
  const posees = entier(valeur.questions_posees)
  return base && plafond !== null && posees !== null ? { ...base, plafond, questions_posees: posees } : null
}

const TYPES_MESSAGE: readonly TypeMessageCadrage[] = ['question', 'reponse', 'conclusion']

function messageCadrage(valeur: unknown): MessageCadrage | null {
  if (typeof valeur !== 'object' || valeur === null) return null
  const { id, type, contenu, cree_le: creeLe } = valeur as ObjetRecu
  const nature = TYPES_MESSAGE.find(t => t === type)
  if (typeof id !== 'string' || !id || !nature || typeof contenu !== 'string' || typeof creeLe !== 'string') return null
  return { id, role: nature === 'reponse' ? 'admin' : 'ia', type: nature, contenu, cree_le: creeLe }
}

function succesTour(valeur: ObjetRecu): SuccesTourCadrage | null {
  const { fin, message } = valeur
  if (typeof fin !== 'boolean' || typeof message !== 'string' || !message.trim()) return null
  if (!Array.isArray(valeur.messages) || valeur.messages.length === 0) return null
  const messages: MessageCadrage[] = []
  for (const brut of valeur.messages) {
    const lu = messageCadrage(brut)
    if (!lu) return null
    messages.push(lu)
  }
  return { fin, message, messages }
}

function succesTexte(valeur: ObjetRecu): SuccesTexteCadrage | null {
  return typeof valeur.tronquee === 'boolean' ? { tronquee: valeur.tronquee } : null
}

function publicPropose(valeur: unknown): PublicPropose | null {
  if (typeof valeur !== 'object' || valeur === null) return null
  if (!('public_vise' in valeur) || !('mode' in valeur) || !('justification' in valeur)) return null
  const { public_vise: publicVise, justification } = valeur
  const mode = MODES.find(m => m === valeur.mode)
  if (typeof publicVise !== 'string' || !publicVise.trim() || typeof justification !== 'string' || !mode) return null
  return { public_vise: publicVise, mode, justification }
}

function succesPublics(valeur: ObjetRecu): SuccesPublics | null {
  if (!Array.isArray(valeur.publics) || valeur.publics.length === 0) return null
  const publics: PublicPropose[] = []
  for (const brut of valeur.publics) {
    const lu = publicPropose(brut)
    if (!lu) return null
    publics.push(lu)
  }
  return { publics }
}

export const FORMAT_TOUR: FormatFlux<EnteteTourCadrage, SuccesTourCadrage> = {
  entete: enteteTour,
  succes: succesTour,
  fluxCoupe: "La connexion s'est arrêtée avant la réponse de l'IA. Relancez-la.",
}

export const FORMAT_TEXTE_CADRAGE: FormatFlux<EnteteCadrage, SuccesTexteCadrage> = {
  entete: enteteContexte,
  succes: succesTexte,
  fluxCoupe: "La connexion s'est arrêtée avant la fin de la rédaction. Relancez-la.",
}

export const FORMAT_PUBLICS: FormatFlux<EnteteGeneration, SuccesPublics> = {
  entete: enteteContexte,
  succes: succesPublics,
  fluxCoupe: "La connexion s'est arrêtée avant la fin de la proposition. Relancez-la.",
}

export const FORMAT_QUESTIONNAIRE: FormatFlux<EnteteGeneration, SuccesGeneration> = {
  entete: enteteContexte,
  succes: identifiant('questionnaire_id'),
  fluxCoupe:
    "La connexion s'est arrêtée avant la fin de la génération : le brouillon n'a sans doute pas été créé. Actualisez la page pour vérifier, sinon relancez-la.",
}
