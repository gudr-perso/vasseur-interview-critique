import { route } from '../../../../../../server/api'
import { repondrePublics } from '../../../../../../server/ia/questionnaires'

/** Réponse en flux : voir `repondrePublics`. Rien n'est enregistré. */
export const onRequestPost = route<'id'>(contexte => repondrePublics(contexte))
