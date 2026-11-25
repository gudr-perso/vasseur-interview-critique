import type { AppConfig, GeneratedInterview, ModelId } from '../types'

const API_URL = '/api/messages'

function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
}

async function callAnthropic(payload: {
  model: ModelId
  max_tokens: number
  messages: { role: string; content: string }[]
}): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.status === 401) {
    throw new Error('Session expirée. Rechargez la page pour vous reconnecter.')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err?.error?.message ?? `Erreur API ${res.status}`)
  }
  const data = await res.json() as { content: { text?: string }[]; stop_reason?: string }
  if (data.stop_reason === 'refusal') {
    throw new Error('Le modèle a refusé de répondre à cette demande.')
  }
  if (data.stop_reason === 'max_tokens') {
    throw new Error('Réponse tronquée : réduisez le nombre de questions ou changez de modèle.')
  }
  return data.content.map(c => c.text ?? '').join('')
}

export function buildGenerationPrompt(config: AppConfig): string {
  const { journalist, subject, sector, doc, questionCount } = config
  return [
    `Tu es un générateur de questions d'interview critique. Tu incarnes ce journaliste :`,
    ``,
    journalist,
    ``,
    `SUJET : ${subject}`,
    sector ? `SECTEUR : ${sector}` : null,
    ``,
    `DOCUMENT :`,
    doc.substring(0, 12000),
    ``,
    `RÈGLES :`,
    `1. Organise en 5-6 sections thématiques, de la plus létale à la moins létale`,
    `2. Génère exactement ${questionCount} questions au total, réparties entre les sections`,
    `3. Chaque question : 3 choix A/B/C. Option D libre disponible.`,
    `4. Chaque option peut avoir un flag (string snake_case identifiant le risque, ou null)`,
    `5. Chaque option a un feedback du journaliste (direct, factuel, incisif, jamais complaisant)`,
    `6. Identifie : promesses invérifiables, risques juridiques, angles morts techniques, concurrence, viabilité`,
    `7. La base de connaissances liste les faits vérifiés pertinents`,
    ``,
    `RETOURNE UNIQUEMENT du JSON valide, sans balises markdown, sans texte avant ou après :`,
    `{`,
    `  "journalist_name": "Nom court",`,
    `  "journalist_intro": "Phrase d'ouverture spécifique au sujet",`,
    `  "knowledge_base": "Faits clés à vérifier (tirets)",`,
    `  "sections": [{"id":"A","label":"Titre","intro":"Intro section"}],`,
    `  "questions": [{"id":1,"sec":"A","tag":"#tag","q":"Question ?","opts":["A","B","C"],"flags":{"A":"risque_x","B":null,"C":null},"fb":{"A":"Feedback A","B":"Feedback B","C":"Feedback C"}}]`,
    `}`,
  ].filter(Boolean).join('\n')
}

export async function generateQuestions(config: AppConfig): Promise<GeneratedInterview> {
  const prompt = buildGenerationPrompt(config)
  const raw = await callAnthropic({
    model: config.genModel,
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
  })
  const cleaned = stripMarkdownFences(raw)
  let parsed: GeneratedInterview
  try {
    parsed = JSON.parse(cleaned) as GeneratedInterview
  } catch {
    throw new Error('Réponse JSON invalide. Réessayez ou changez de modèle.')
  }
  if (!parsed.questions || parsed.questions.length === 0) {
    throw new Error('Aucune question générée. Vérifiez le document et le sujet.')
  }
  return parsed
}

export async function generateOutput(
  prompt: string,
  model: ModelId,
): Promise<string> {
  return callAnthropic({
    model,
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  })
}
