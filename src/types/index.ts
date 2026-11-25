/** Identifiant d'un modèle du catalogue servi par /api/admin/modeles. */
export type ModelId = string

export interface AppConfig {
  journalist: string
  subject: string
  sector: string
  doc: string
  questionCount: 10 | 25 | 50 | 100
  genModel: ModelId
}

export interface Section {
  id: string
  label: string
  intro: string
}

export interface Question {
  id: number
  sec: string
  tag: string
  q: string
  opts: [string, string, string]
  flags: { A: string | null; B: string | null; C: string | null }
  fb:    { A: string; B: string; C: string }
}

export interface GeneratedInterview {
  journalist_name: string
  journalist_intro: string
  knowledge_base: string
  sections: Section[]
  questions: Question[]
}

export type AnswerChoice = 'A' | 'B' | 'C' | 'D'

export interface Answer {
  id: number
  sec: string
  tag: string
  question: string
  opts: string[]
  choice: AnswerChoice
  free: string
  ts: string
  flags: string[]
}

export type TemplateKey = 'critique' | 'article' | 'verif'

export interface Templates {
  critique: string
  article: string
  verif: string
}

export interface Preset {
  name: string
  templates: Templates
  createdAt: string
}

export type Screen = 'config' | 'templates' | 'loading' | 'interview' | 'synthesis'

export type FeedbackType = 'ok' | 'warn' | 'flag'
