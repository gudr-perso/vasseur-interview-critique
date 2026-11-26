import { useRef } from 'react'
import type { SuccesAnalyse } from '../../shared/analyses'
import { api, type DemandeAnalyse } from './api'
import { useAppelFlux, type EtatAppel } from './appelFlux'
import type { EnteteAnalyse } from './fluxAnalyse'

export type EtatGeneration =
  | { phase: 'repos' }
  | { phase: 'en_cours'; debut: number; texte: string; nb_entretiens: number | null }
  /** `analyseId` : identifiant de l'analyse enregistrée, donné par la dernière ligne du flux. */
  | { phase: 'terminee'; texte: string; nb_entretiens: number; analyseId: string }
  | { phase: 'erreur'; texte: string; message: string }

/** Montré pendant une génération, et posé en question avant de quitter la page. */
export const AVERTISSEMENT_SORTIE = "Gardez cette page ouverte jusqu'à la fin : une analyse interrompue n'est pas enregistrée."

function versEtatGeneration(etat: EtatAppel<EnteteAnalyse, SuccesAnalyse>): EtatGeneration {
  switch (etat.phase) {
    case 'repos':
      return etat
    case 'en_cours':
      return { phase: 'en_cours', debut: etat.debut, texte: etat.texte, nb_entretiens: etat.entete?.nb_entretiens ?? null }
    case 'terminee':
      return { phase: 'terminee', texte: etat.texte, nb_entretiens: etat.entete.nb_entretiens, analyseId: etat.succes.analyse_id }
    case 'erreur':
      return { phase: 'erreur', texte: etat.texte, message: etat.message }
  }
}

/**
 * Lance une génération et en suit l'avancement. Quitter l'écran coupe la connexion : le serveur ne prolonge
 * alors le travail que brièvement, et une analyse interrompue n'est pas enregistrée.
 */
export function useGenerationAnalyse(projetId: string, onEnregistree: () => void) {
  const appel = useAppelFlux<EnteteAnalyse, SuccesAnalyse>()
  const surFin = useRef(onEnregistree)
  surFin.current = onEnregistree

  const lancer = async (demande: DemandeAnalyse) => {
    const fin = await appel.lancer((surTexte, signal) => api.analyses.generer(projetId, demande, surTexte, signal))
    if (fin?.phase === 'terminee') surFin.current()
  }

  return { etat: versEtatGeneration(appel.etat), lancer }
}
