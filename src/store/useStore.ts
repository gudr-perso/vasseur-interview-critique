import { create } from 'zustand'
import type {
  Screen, AppConfig, GeneratedInterview, Answer, AnswerChoice,
  TemplateKey, Templates, ModelId, Preset, FeedbackType,
} from '../types'
import { DEFAULT_TEMPLATES, getDefaultTemplate } from '../lib/templates'

const DEFAULT_JOURNALIST = "Étienne Vasseur, journaliste d'investigation spécialisé en conformité et qualité industrielle, 15 ans d'expérience presse professionnelle. Direct, factuel, incisif. Il cherche les incohérences, les promesses intenables et les angles morts. Jamais complaisant."

const DEFAULT_CONFIG: AppConfig = {
  journalist: DEFAULT_JOURNALIST,
  subject: '',
  sector: '',
  doc: '',
  questionCount: 25,
  genModel: 'claude-sonnet-4-6',
}

export interface FeedbackState {
  type: FeedbackType
  text: string
  flags: string[]
}

interface AppState {
  // Navigation
  screen: Screen
  setScreen: (s: Screen) => void
  templateFrom: 'config' | 'synth'
  setTemplateFrom: (s: 'config' | 'synth') => void

  // Config
  config: AppConfig
  setConfig: (c: Partial<AppConfig>) => void

  // Generated interview
  interview: GeneratedInterview | null
  journalistName: string
  setInterview: (i: GeneratedInterview) => void

  // Interview progress
  currentQ: number
  answers: Answer[]
  globalFlags: string[]
  selectedOption: AnswerChoice | null
  setSelectedOption: (o: AnswerChoice | null) => void
  submitAnswer: (choice: AnswerChoice | null, free: string) => FeedbackState
  nextQuestion: () => void

  // Templates
  templates: Templates
  setTemplate: (key: TemplateKey, value: string) => void
  resetTemplate: (key: TemplateKey) => void
  loadPreset: (preset: Preset) => void

  // Output model
  outModel: ModelId
  setOutModel: (m: ModelId) => void

  // Reset
  reset: () => void
}

export const useStore = create<AppState>((set, get) => ({
  // Navigation
  screen: 'config',
  setScreen: (s) => set({ screen: s }),
  templateFrom: 'config',
  setTemplateFrom: (s) => set({ templateFrom: s }),

  // Config
  config: { ...DEFAULT_CONFIG },
  setConfig: (c) => set(state => ({ config: { ...state.config, ...c } })),

  // Interview
  interview: null,
  journalistName: 'Étienne Vasseur',
  setInterview: (i) => set({
    interview: i,
    journalistName: i.journalist_name || 'Étienne Vasseur',
    currentQ: 0,
    answers: [],
    globalFlags: [],
    selectedOption: null,
  }),

  // Progress
  currentQ: 0,
  answers: [],
  globalFlags: [],
  selectedOption: null,
  setSelectedOption: (o) => set({ selectedOption: o }),

  submitAnswer: (choice, free): FeedbackState => {
    const state = get()
    const { interview, currentQ, config } = state

    // Phase intro (currentQ === 0)
    if (currentQ === 0) {
      const answer: Answer = {
        id: 0,
        sec: 'INTRO',
        tag: '#presentation',
        question: 'Présentation',
        opts: [],
        choice: 'D',
        free,
        ts: new Date().toISOString(),
        flags: [],
      }
      set(s => ({ answers: [...s.answers, answer], selectedOption: null }))
      return { type: 'ok', text: 'Présentation enregistrée.', flags: [] }
    }

    if (!interview) return { type: 'ok', text: 'Acté.', flags: [] }

    const q = interview.questions[currentQ - 1]
    const effectiveChoice = choice || 'D'

    // Calculer les flags (choice ne peut être 'D' ici — 'D' = pas de choix fermé)
    const flags: string[] = []
    type ClosedChoice = 'A' | 'B' | 'C'
    const closedChoice = (choice !== null && choice !== 'D') ? choice as ClosedChoice : null
    if (closedChoice && q.flags && q.flags[closedChoice]) {
      const flag = q.flags[closedChoice]!
      flags.push(flag)
    }

    // Calculer le feedback
    let fbText = 'Acté.'
    let fbType: FeedbackType = 'ok'

    if (closedChoice && q.fb && q.fb[closedChoice]) {
      fbText = q.fb[closedChoice]
      fbType = flags.length > 0 ? 'flag' : 'ok'
    } else if (!choice && free) {
      fbText = 'Réponse libre enregistrée.'
      fbType = 'warn'
    }

    const answer: Answer = {
      id: q.id,
      sec: q.sec,
      tag: q.tag,
      question: q.q,
      opts: [...q.opts],
      choice: effectiveChoice,
      free,
      ts: new Date().toISOString(),
      flags,
    }

    set(s => ({
      answers: [...s.answers, answer],
      globalFlags: [
        ...s.globalFlags,
        ...flags.filter(f => !s.globalFlags.includes(f)),
      ],
      selectedOption: null,
    }))

    // Supprimer l'avertissement sur config non utilisé
    void config

    return { type: fbType, text: fbText, flags }
  },

  nextQuestion: () => {
    const { currentQ, interview } = get()
    const next = currentQ + 1
    if (interview && next > interview.questions.length) {
      set({ screen: 'synthesis' })
    } else {
      set({ currentQ: next })
    }
  },

  // Templates
  templates: { ...DEFAULT_TEMPLATES },
  setTemplate: (key, value) =>
    set(s => ({ templates: { ...s.templates, [key]: value } })),
  resetTemplate: (key) =>
    set(s => ({ templates: { ...s.templates, [key]: getDefaultTemplate(key) } })),
  loadPreset: (preset) => set({ templates: { ...preset.templates } }),

  // Output model
  outModel: 'claude-sonnet-4-6',
  setOutModel: (m) => set({ outModel: m }),

  // Reset
  reset: () => set({
    screen: 'config',
    interview: null,
    journalistName: 'Étienne Vasseur',
    currentQ: 0,
    answers: [],
    globalFlags: [],
    selectedOption: null,
    templates: { ...DEFAULT_TEMPLATES },
    outModel: 'claude-sonnet-4-6',
  }),
}))
