import type { DecisionRelance, DecisionTour, DemandeRelance, DemandeTour, Ia } from '../../server/ia/types'
import { ErreurIa } from '../../server/ia/types'

type Resultat<R> = R | 'erreur'
/** Un script peut répondre tout de suite ou plus tard (IA lente). */
type Script<D, R> = (demande: D) => Resultat<R> | Promise<Resultat<R>>

/** IA simulée : chaque décision suit le script fourni ; les demandes reçues sont gardées pour les assertions. */
export function iaSimulee(
  relance: Script<DemandeRelance, DecisionRelance> = () => ({ relancer: false, question: null }),
  tour: Script<DemandeTour, DecisionTour> = () => ({ fin: true, question: null, themes_couverts: [] }),
) {
  const demandes = { relance: [] as DemandeRelance[], tour: [] as DemandeTour[] }
  const ia: Ia = {
    async deciderRelance(d) {
      demandes.relance.push(d)
      const r = await relance(d)
      if (r === 'erreur') throw new ErreurIa('simulée')
      return r
    },
    async prochainTour(d) {
      demandes.tour.push(d)
      const r = await tour(d)
      if (r === 'erreur') throw new ErreurIa('simulée')
      return r
    },
  }
  return { ia, demandes }
}

export function attendre(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
