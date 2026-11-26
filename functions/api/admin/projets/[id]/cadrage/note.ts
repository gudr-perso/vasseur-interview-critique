import { route } from '../../../../../../server/api'
import { repondreNoteCadrage } from '../../../../../../server/ia/cadrage'

/** Réponse en flux : voir `repondreNoteCadrage`. Rien n'est enregistré. */
export const onRequestPost = route<'id'>(contexte => repondreNoteCadrage(contexte))
