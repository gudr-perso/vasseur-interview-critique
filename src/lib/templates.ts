import type { Templates, TemplateKey } from '../types'

export const DEFAULT_TEMPLATES: Templates = {
  critique: `Tu es {{journaliste}}. Tu viens de conduire cette interview.

Sujet : {{sujet}}{{secteur}}
{{kb}}
Réponses de l'interviewé :
{{qa}}

Flags déclenchés : {{flags}}

Rédige une analyse critique de 300 à 600 mots, au style journalistique factuel et incisif.
Structure :
1. Jugement d'ensemble (2-3 phrases)
2. Points solides identifiés (s'il y en a)
3. Liste numérotée des réponses "à approfondir" (n° de question + pourquoi, 1-2 phrases chacune)
4. Conclusion sans concession.

Ton : direct, factuel. Ni complaisant ni hostile.`,

  article: `Tu es {{journaliste}}, journaliste.

Sujet : {{sujet}}{{secteur}}
{{kb}}
Réponses : {{qa}}

Rédige un article de 600 à 1200 mots :
- Titre accrocheur
- Chapeau 2-3 phrases
- Corps structuré avec sous-titres courts
- Citations stylisées reconstituées à partir des réponses (signale-les comme "reconstituées")
- Points saillants
- Conclusion critique

Style : journalisme professionnel, factuel.`,

  verif: `Tu es {{journaliste}}.

Sujet : {{sujet}}{{secteur}}
{{kb}}
Réponses : {{qa}}

Confronte 3 à 5 affirmations importantes de cet interview à la réalité factuelle vérifiable (réglementations, chiffres officiels, réalités du marché, limites techniques).
Pour chaque affirmation : cite la réponse concernée, donne le fait réel, rends un verdict (confirmé / contesté / invérifiable).
Précis, bref, factuel.`,
}

export function renderTemplate(
  tpl: string,
  data: {
    journalist: string
    subject: string
    sector: string
    qa: string
    flags: string
    kb: string
  }
): string {
  const sectorStr = data.sector ? ` (${data.sector})` : ''
  const kbStr = data.kb ? `Base de connaissances :\n${data.kb}` : ''
  return tpl
    .replace(/\{\{journaliste\}\}/g, data.journalist)
    .replace(/\{\{sujet\}\}/g, data.subject)
    .replace(/\{\{secteur\}\}/g, sectorStr)
    .replace(/\{\{qa\}\}/g, data.qa)
    .replace(/\{\{flags\}\}/g, data.flags || 'aucun')
    .replace(/\{\{kb\}\}/g, kbStr)
}

export function getDefaultTemplate(key: TemplateKey): string {
  return DEFAULT_TEMPLATES[key]
}
