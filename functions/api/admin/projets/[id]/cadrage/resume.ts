import { route } from '../../../../../../server/api'
import { repondreResumeContexte } from '../../../../../../server/ia/cadrage'

/** Réponse en flux : voir `repondreResumeContexte`. Rien n'est enregistré. */
export const onRequestPost = route<'id'>(contexte => repondreResumeContexte(contexte))
