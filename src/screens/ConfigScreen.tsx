import { useState } from 'react'
import { useStore } from '../store/useStore'
import { generateQuestions } from '../lib/api'
import { Button } from '../components/ui/Button'
import { ModelSelector } from '../components/ui/ModelSelector'
import type { AppConfig } from '../types'

const QUESTION_OPTIONS: { n: AppConfig['questionCount']; hint: string }[] = [
  { n: 10,  hint: '~10 min · Survol rapide' },
  { n: 25,  hint: '~25 min · Analyse solide' },
  { n: 50,  hint: '~45 min · Couverture complète' },
  { n: 100, hint: '~90 min · Due diligence approfondie' },
]

export function ConfigScreen() {
  const { config, setConfig, setScreen, setInterview, setTemplateFrom } = useStore()
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setError('')
    if (!config.subject.trim()) { setError('Le sujet est requis.'); return }
    if (!config.doc.trim()) { setError('Le document est requis.'); return }

    setScreen('loading')
    try {
      const data = await generateQuestions(config)
      setInterview(data)
      setScreen('interview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue.')
      setScreen('config')
    }
  }

  const hint = QUESTION_OPTIONS.find(o => o.n === config.questionCount)?.hint ?? ''

  return (
    <div className="max-w-[820px] w-full mx-auto px-6 pb-10 pt-5">
      {/* VasseurCard header */}
      <div className="bg-ink text-paper mb-5 px-5 py-4 border-l-4 border-red">
        <div className="font-mono text-[0.6rem] text-red uppercase tracking-[0.1em] mb-1.5">▶ Étienne Vasseur · Journaliste</div>
        <div className="font-display italic text-[0.95rem] leading-[1.65] text-[#e8e0d0]">
          Bonjour. Je suis Étienne Vasseur. Donnez-moi un sujet et un document, je prépare l'interview.
        </div>
      </div>

      <div className="bg-white border border-border p-7">
        <h1 className="font-display font-bold text-[1.35rem] mb-1">Configurer l'interview</h1>
        <p className="text-[0.86rem] text-muted mb-6 leading-relaxed">
          Vasseur prend connaissance du dossier et génère une série de questions adaptées à votre sujet.
        </p>

        {/* Journaliste */}
        <div className="mb-4">
          <label className="block font-mono text-[0.66rem] uppercase tracking-wider text-muted mb-1.5">
            Journaliste
          </label>
          <input
            type="text"
            className="w-full border border-border px-3 py-2.5 text-[0.88rem] font-sans text-ink bg-white outline-none focus:border-ink transition-colors"
            value={config.journalist}
            onChange={e => setConfig({ journalist: e.target.value })}
          />
        </div>

        {/* Sujet */}
        <div className="mb-4">
          <label className="block font-mono text-[0.66rem] uppercase tracking-wider text-muted mb-1.5">
            Sujet de l'interview <span className="text-red">*</span>
          </label>
          <input
            type="text"
            className="w-full border border-border px-3 py-2.5 text-[0.88rem] font-sans text-ink bg-white outline-none focus:border-ink transition-colors"
            placeholder="Ex : Lancement de CAP Qualité, pitch de levée de fonds, dossier de conformité…"
            value={config.subject}
            onChange={e => setConfig({ subject: e.target.value })}
          />
        </div>

        {/* Secteur */}
        <div className="mb-4">
          <label className="block font-mono text-[0.66rem] uppercase tracking-wider text-muted mb-1.5">
            Secteur / Contexte
          </label>
          <input
            type="text"
            className="w-full border border-border px-3 py-2.5 text-[0.88rem] font-sans text-ink bg-white outline-none focus:border-ink transition-colors"
            placeholder="Ex : Agroalimentaire, fintech, santé, RH, immobilier…"
            value={config.sector}
            onChange={e => setConfig({ sector: e.target.value })}
          />
        </div>

        {/* Document */}
        <div className="mb-4">
          <label className="block font-mono text-[0.66rem] uppercase tracking-wider text-muted mb-1.5">
            Document à analyser <span className="text-red">*</span>{' '}
            <span className="font-sans normal-case tracking-normal font-light text-[0.79rem]">
              — collez le contenu (pitch, BP, dossier, cahier des charges…)
            </span>
          </label>
          <textarea
            className="w-full border border-border px-3 py-2.5 text-[0.83rem] font-sans text-ink bg-white outline-none focus:border-ink transition-colors leading-relaxed min-h-[150px]"
            placeholder="Collez ici le contenu du document à analyser…"
            value={config.doc}
            onChange={e => setConfig({ doc: e.target.value })}
          />
        </div>

        {/* Nombre de questions */}
        <div className="mb-4">
          <label className="block font-mono text-[0.66rem] uppercase tracking-wider text-muted mb-1.5">
            Nombre de questions
          </label>
          <div className="flex gap-2 mt-1">
            {QUESTION_OPTIONS.map(opt => (
              <button
                key={opt.n}
                type="button"
                onClick={() => setConfig({ questionCount: opt.n })}
                className={`flex-1 py-2.5 px-1.5 border font-mono text-[0.85rem] font-medium text-center cursor-pointer transition-all duration-150 ${
                  config.questionCount === opt.n
                    ? 'bg-ink text-paper border-ink'
                    : 'bg-paper border-border text-ink hover:bg-paper2 hover:border-ink'
                }`}
              >
                {opt.n}
              </button>
            ))}
          </div>
          <div className="font-mono text-[0.62rem] text-muted mt-1.5">{hint}</div>
        </div>

        {/* Modèle */}
        <div className="mb-4">
          <label className="block font-mono text-[0.66rem] uppercase tracking-wider text-muted mb-1.5">
            Modèle pour la génération des questions
          </label>
          <ModelSelector
            value={config.genModel}
            onChange={m => setConfig({ genModel: m })}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-4 flex-wrap items-center">
          <Button variant="primary" onClick={handleSubmit}>
            Lancer la préparation →
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setTemplateFrom('config'); setScreen('templates') }}
          >
            Configurer les rendus ⚙
          </Button>
        </div>

        {error && (
          <div className="mt-3 px-3.5 py-2.5 bg-flag-bg border-l-[3px] border-red text-[0.83rem] text-flag-fg">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
