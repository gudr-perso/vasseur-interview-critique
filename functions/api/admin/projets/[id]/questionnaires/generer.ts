import { route } from '../../../../../../server/api'
import { repondreGeneration } from '../../../../../../server/ia/questionnaires'

/** Réponse en flux : voir `repondreGeneration`. Le questionnaire est créé en brouillon. */
export const onRequestPost = route<'id'>(contexte => repondreGeneration(contexte))
