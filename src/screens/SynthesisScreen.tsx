import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useStore } from '../store/useStore'
import { generateOutput } from '../lib/api'
import { renderTemplate } from '../lib/templates'
import { Header } from '../components/layout/Header'
import { VasseurCard } from '../components/layout/VasseurCard'
import { Button } from '../components/ui/Button'
import { Chip } from '../components/ui/Chip'
import { ModelSelector } from '../components/ui/ModelSelector'
import { Spinner } from '../components/ui/Spinner'
import type { TemplateKey, Answer } from '../types'

const CRITICAL_KEYWORDS = [
  'legal','rgpd','credibilite','zero_client','solo','chiffres',
  'signature','vendor','positionnement','promesse',
]

function buildQAString(answers: Answer[]): string {
  return answers.map(a => {
    const lines: string[] = [`Q${a.id} [${a.sec}] ${a.tag}: ${a.question}`]
    if (a.choice !== 'D') {
      const idx = ['A','B','C'].indexOf(a.choice)
      lines.push(`-> [${a.choice}] ${a.opts[idx] ?? a.choice}`)
    }
    if (a.free) lines.push(`-> Réponse libre : ${a.free}`)
    if (a.flags.length) lines.push(`[FLAGS: ${a.flags.join(', ')}]`)
    return lines.join('\n')
  }).join('\n\n')
}

function buildMarkdownExport(
  subject: string,
  journalistName: string,
  genModel: string,
  questionCount: number,
  answers: Answer[],
  sections: Record<string, { label: string }>,
  flags: string[],
): string {
  const lines: string[] = [
    `# Interview — ${subject || 'Sans titre'}`,
    `**Journaliste** : ${journalistName}`,
    `**Date** : ${new Date().toLocaleDateString('fr-FR')}`,
    `**Questions** : ${questionCount} | **Modèle** : ${genModel}`,
    '',
    '## Présentation',
    answers[0]?.id === 0 ? answers[0].free : '—',
    '',
    '## Réponses',
    '',
  ]

  let curSec = ''
  answers.forEach(a => {
    if (a.id === 0) return
    if (a.sec !== curSec) {
      curSec = a.sec
      const sec = sections[a.sec]
      lines.push(`### Section ${a.sec}${sec ? ` — ${sec.label}` : ''}`, '')
    }
    lines.push(`**Q${a.id}** \`${a.tag}\` — ${a.question}`)
    if (a.choice !== 'D') {
      const idx = ['A','B','C'].indexOf(a.choice)
      lines.push(`- Choix : **${a.choice}** — ${a.opts[idx] ?? ''}`)
    }
    if (a.free) lines.push(`- Réponse libre : ${a.free}`)
    if (a.flags.length) lines.push(`- Flags : ${a.flags.join(', ')}`)
    lines.push(`- *${a.ts}*`, '')
  })

  lines.push('## Flags globaux', ...flags.map(f => `- ${f}`))
  return lines.join('\n')
}

export function SynthesisScreen() {
  const {
    interview, journalistName, config, answers, globalFlags,
    templates, outModel, setOutModel, setTemplateFrom, setScreen, reset,
  } = useStore()

  const [generating, setGenerating] = useState(false)
  const [outputTitle, setOutputTitle] = useState('')
  const [outputText, setOutputText] = useState('')

  if (!interview) return null

  const criticalAnswers = answers.filter(a =>
    a.flags.some(f => CRITICAL_KEYWORDS.some(k => f.includes(k)))
  ).slice(0, 8)

  const sectionsMap: Record<string, { label: string }> = {}
  interview.sections?.forEach(s => { sectionsMap[s.id] = s })

  const handleGenerate = async (type: TemplateKey) => {
    const labels: Record<TemplateKey, string> = {
      critique: 'ANALYSE CRITIQUE',
      article: 'ARTICLE',
      verif: 'VÉRIFICATION FACTUELLE',
    }
    const modelLabel = outModel.includes('opus') ? 'OPUS 4.6' : 'SONNET 4.6'
    setGenerating(true)
    setOutputText('')
    setOutputTitle(`${labels[type]} [${modelLabel}]`)
    try {
      const qa = buildQAString(answers)
      const prompt = renderTemplate(templates[type], {
        journalist: `${journalistName} — ${config.journalist}`,
        subject: config.subject,
        sector: config.sector,
        qa,
        flags: globalFlags.join(', ') || 'aucun',
        kb: interview.knowledge_base || '',
      })
      const result = await generateOutput(prompt, outModel)
      setOutputText(result)
    } catch (e) {
      setOutputText(e instanceof Error ? e.message : 'Erreur inconnue.')
    } finally {
      setGenerating(false)
    }
  }

  const handleExport = () => {
    const md = buildMarkdownExport(
      config.subject, journalistName, config.genModel,
      config.questionCount, answers, sectionsMap, globalFlags,
    )
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vasseur-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <Header
        subject={config.subject}
        currentQ={interview.questions.length}
        totalQ={interview.questions.length}
        model={config.genModel}
        showProgress
      />

      <div className="max-w-[820px] w-full mx-auto px-6 pb-10 pt-4">
        <VasseurCard
          name={`${journalistName} · Journaliste`}
          text="C'est terminé. Voici ce que j'ai retenu."
        />

        {/* Synthèse critique */}
        <div className="bg-white border-2 border-ink p-5 mb-3.5">
          <div className="font-display font-bold text-[1.1rem] mb-3 pb-2 border-b-2 border-ink">
            Synthèse — Points critiques détectés
          </div>
          {criticalAnswers.length === 0 ? (
            <div className="flex gap-2.5 py-2 text-[0.83rem] leading-relaxed">
              <span className="flex-shrink-0">✓</span>
              <div>Aucun risque critique majeur détecté. Consultez l'analyse détaillée.</div>
            </div>
          ) : (
            criticalAnswers.map(a => {
              const hasLegal = a.flags.some(f => f.includes('legal') || f.includes('rgpd'))
              return (
                <div key={a.id} className="flex gap-2.5 py-2 border-b border-border last:border-0 text-[0.83rem] leading-relaxed">
                  <span className="flex-shrink-0 text-[0.9rem] mt-0.5">{hasLegal ? '🚩' : '⚠'}</span>
                  <div>
                    <strong className="block font-medium mb-0.5">Q{a.id} — {a.tag}</strong>
                    {a.question}
                  </div>
                </div>
              )
            })
          )}
          {/* Flags globaux */}
          {globalFlags.length > 0 && (
            <div className="mt-2.5">
              {globalFlags.map(f => <Chip key={f} label={f} />)}
            </div>
          )}
        </div>

        {/* Sélecteur modèle output */}
        <div className="bg-white border border-border p-4 mb-3.5">
          <div className="font-mono text-[0.61rem] uppercase tracking-wider text-muted mb-2">
            Modèle pour les analyses
          </div>
          <ModelSelector value={outModel} onChange={setOutModel} variant="out" />
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-wrap items-center mt-3.5">
          <Button variant="dark" onClick={() => handleGenerate('critique')}>
            Analyse critique (Vasseur)
          </Button>
          <Button variant="outline" onClick={() => handleGenerate('article')}>
            Rédiger l'article
          </Button>
          <Button variant="outline" onClick={() => handleGenerate('verif')}>
            Vérifier les faits
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="outline" size="sm" onClick={() => { setTemplateFrom('synth'); setScreen('templates') }}>
            Modifier les prompts ⚙
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="danger" size="sm" onClick={handleExport}>
            Export Q&amp;A (.md)
          </Button>
          <Button variant="outline" size="sm" onClick={reset}>
            ← Nouvelle interview
          </Button>
        </div>

        {/* Spinner */}
        {generating && (
          <div className="flex items-center gap-2 mt-3 font-mono text-[0.68rem] text-muted">
            <Spinner size="sm" />
            Rédaction en cours…
          </div>
        )}

        {/* Output */}
        {outputText && (
          <div className="bg-white border border-border mt-3">
            <div className="font-mono text-[0.61rem] text-muted uppercase tracking-widest px-5 py-2.5 border-b border-border">
              {outputTitle}
            </div>
            <div className="px-5 py-4 max-h-[480px] overflow-y-auto prose prose-sm max-w-none text-[0.84rem] leading-[1.75] text-ink">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{outputText}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
