import type { DecisionRelance, DecisionTour, DemandeRelance, DemandeTour, Ia } from '../../server/ia/types'
import { ErreurIa } from '../../server/ia/types'

type Script<D, R> = (demande: D) => R | 'erreur'

/** IA simulée : chaque décision suit le script fourni ; les demandes reçues sont gardées pour les assertions. */
export function iaSimulee(
  relance: Script<DemandeRelance, DecisionRelance> = () => ({ relancer: false, question: null }),
  tour: Script<DemandeTour, DecisionTour> = () => ({ fin: true, question: null, themes_couverts: [] }),
) {
  const demandes = { relance: [] as DemandeRelance[], tour: [] as DemandeTour[] }
  const ia: Ia = {
    async deciderRelance(d) {
      demandes.relance.push(d)
      const r = relance(d)
      if (r === 'erreur') throw new ErreurIa('simulée')
      return r
    },
    async prochainTour(d) {
      demandes.tour.push(d)
      const r = tour(d)
      if (r === 'erreur') throw new ErreurIa('simulée')
      return r
    },
  }
  return { ia, demandes }
}
