import { useState } from 'react'
import { useStore } from '../store/useStore'
import { Header } from '../components/layout/Header'
import { VasseurCard } from '../components/layout/VasseurCard'
import { Button } from '../components/ui/Button'
import { FeedbackCard } from '../components/ui/FeedbackCard'
import type { FeedbackState } from '../store/useStore'
import type { AnswerChoice } from '../types'

// Sous-composant question — key={currentQ} force le remontage à chaque question
function QuestionCard({ questionIndex }: { questionIndex: number }) {
  const { interview, selectedOption, setSelectedOption, submitAnswer, nextQuestion } = useStore()
  const [freeText, setFreeText] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)

  if (!interview) return null
  const q = interview.questions[questionIndex]

  const handleConfirm = () => {
    if (!selectedOption && !freeText.trim()) {
      alert('Choisissez une option ou répondez librement.')
      return
    }
    const fb = submitAnswer(selectedOption, freeText.trim())
    setFeedback(fb)
    setConfirmed(true)
  }

  return (
    <div className="bg-white border border-border p-5 mb-3.5">
      {/* Méta */}
      <div className="flex gap-2 items-center mb-2.5 flex-wrap">
        <span className="font-mono text-[0.67rem] bg-ink text-paper px-1.5 py-0.5">Q{q.id}</span>
        {q.tag && (
          <span className="font-mono text-[0.58rem] text-muted bg-paper2 px-1.5 py-0.5 border border-border">{q.tag}</span>
        )}
      </div>

      {/* Texte de la question */}
      <div className="text-[0.96rem] font-medium leading-[1.55] mb-4">{q.q}</div>

      {/* Options A/B/C */}
      <div className="flex flex-col gap-1.5 mb-3">
        {q.opts.map((opt, i) => {
          const key = (['A', 'B', 'C'] as AnswerChoice[])[i]
          const selected = selectedOption === key
          return (
            <button
              key={key}
              type="button"
              disabled={confirmed}
              onClick={() => {
                if (!confirmed) setSelectedOption(selected ? null : key)
              }}
              className={`flex items-start gap-2.5 px-3 py-2.5 border text-[0.85rem] text-left font-sans cursor-pointer transition-all duration-150 disabled:cursor-default ${
                selected
                  ? 'bg-ink text-paper border-ink'
                  : 'bg-paper border-border text-ink hover:bg-paper2 hover:border-ink'
              }`}
            >
              <span className={`font-mono text-[0.66rem] font-medium px-1 py-0.5 min-w-[22px] text-center flex-shrink-0 mt-0.5 border ${
                selected ? 'bg-red text-white border-red' : 'bg-paper2 border-border'
              }`}>
                {key}
              </span>
              {opt}
            </button>
          )
        })}
      </div>

      {/* Réponse libre */}
      <div className="border-t border-dashed border-border pt-2.5">
        <div className="font-mono text-[0.61rem] text-muted mb-1.5 uppercase tracking-wider">
          D — Réponse libre (facultatif ou à la place d'un choix)
        </div>
        <textarea
          rows={3}
          className="w-full border border-border px-3 py-2 text-[0.85rem] font-sans text-ink bg-white outline-none focus:border-ink transition-colors"
          placeholder="Nuancez ou complétez votre réponse…"
          value={freeText}
          disabled={confirmed}
          onChange={e => setFreeText(e.target.value)}
        />
      </div>

      {/* Confirmer */}
      <div className="flex items-center gap-2 mt-3">
        <Button variant="primary" onClick={handleConfirm} disabled={confirmed}>
          Confirmer →
        </Button>
      </div>

      {/* Feedback */}
      <FeedbackCard
        type={feedback?.type ?? 'ok'}
        text={feedback?.text ?? ''}
        flags={feedback?.flags}
        show={confirmed && feedback !== null}
      />

      {/* Question suivante */}
      {confirmed && (
        <div className="mt-2.5">
          <Button variant="dark" onClick={nextQuestion}>
            Question suivante →
          </Button>
        </div>
      )}
    </div>
  )
}

// Intro card — présentez-vous
function IntroCard() {
  const { submitAnswer, nextQuestion, interview, journalistName } = useStore()
  const [freeText, setFreeText] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleStart = () => {
    if (!freeText.trim()) { alert('Présentez-vous avant de continuer.'); return }
    submitAnswer(null, freeText.trim())
    setSubmitted(true)
    nextQuestion()
  }

  return (
    <div className="bg-white border border-border p-5 mb-3.5">
      <div className="flex gap-2 items-center mb-2.5">
        <span className="font-mono text-[0.67rem] bg-ink text-paper px-1.5 py-0.5">INTRO</span>
        <span className="font-mono text-[0.58rem] text-muted bg-paper2 px-1.5 py-0.5 border border-border">#présentation</span>
      </div>
      <div className="text-[0.96rem] font-medium leading-[1.55] mb-4">
        Présentez-vous : qui êtes-vous, quel est votre rôle sur ce projet, et quelle est votre légitimité sur le sujet ?
      </div>
      <div className="font-mono text-[0.61rem] text-muted mb-1.5 uppercase tracking-wider">
        D — Réponse libre
      </div>
      <textarea
        rows={4}
        className="w-full border border-border px-3 py-2 text-[0.85rem] font-sans text-ink bg-white outline-none focus:border-ink transition-colors mb-3"
        placeholder="Présentez-vous…"
        value={freeText}
        disabled={submitted}
        onChange={e => setFreeText(e.target.value)}
      />
      <Button variant="primary" onClick={handleStart} disabled={submitted}>
        Commencer l'interview →
      </Button>
      {/* suppress unused warning */}
      {interview && journalistName && null}
    </div>
  )
}

export function InterviewScreen() {
  const { interview, currentQ, journalistName } = useStore()

  if (!interview) return null

  const questions = interview.questions
  const isIntro = currentQ === 0
  const totalQ = questions.length

  // Section courante
  const currentQuestion = !isIntro ? questions[currentQ - 1] : null
  const prevQuestion = !isIntro && currentQ > 1 ? questions[currentQ - 2] : null
  const isNewSection = currentQuestion && prevQuestion
    ? currentQuestion.sec !== prevQuestion.sec
    : currentQuestion && currentQ === 1

  const currentSection = currentQuestion ? interview.sections?.find(s => s.id === currentQuestion.sec) : null
  const vasseurText = isNewSection && currentSection?.intro
    ? currentSection.intro
    : isIntro
    ? interview.journalist_intro || 'On va aller droit au but.'
    : currentSection?.intro || interview.journalist_intro || ''

  return (
    <div>
      <Header
        subject={useStore.getState().config.subject}
        currentQ={currentQ}
        totalQ={totalQ}
        model={useStore.getState().config.genModel}
        showProgress={!isIntro}
      />

      <div className="max-w-[820px] w-full mx-auto px-6 pb-10 pt-4">
        {/* Base de connaissances repliable */}
        {interview.knowledge_base && <KnowledgeBaseCard kb={interview.knowledge_base} />}

        {/* VasseurCard */}
        <VasseurCard name={`${journalistName} · Journaliste`} text={vasseurText} />

        {/* Section banner */}
        {isNewSection && currentSection && (
          <div className="bg-paper2 border border-border border-l-4 border-l-gold px-3.5 py-2 mb-3.5 font-mono text-[0.67rem] text-gold uppercase tracking-wider">
            {currentSection.label}
          </div>
        )}

        {/* Question ou intro — key force le remontage */}
        {isIntro
          ? <IntroCard key="intro" />
          : <QuestionCard key={currentQ} questionIndex={currentQ - 1} />
        }
      </div>
    </div>
  )
}

function KnowledgeBaseCard({ kb }: { kb: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-paper2 border border-border border-l-[3px] border-l-gold mb-3.5">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3.5 py-2.5 cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <span className="font-mono text-[0.6rem] text-gold uppercase tracking-wider">
          📋 Base de connaissances
        </span>
        <span className="font-mono text-[0.6rem] text-muted">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3.5 pb-3 text-[0.79rem] leading-relaxed text-muted whitespace-pre-wrap">
          {kb}
        </div>
      )}
    </div>
  )
}
