import { route } from '../../../../../../server/api'
import { repondreTourCadrage } from '../../../../../../server/ia/cadrage'

/** Réponse en flux : voir `repondreTourCadrage`. */
export const onRequestPost = route<'id'>(contexte => repondreTourCadrage(contexte))
