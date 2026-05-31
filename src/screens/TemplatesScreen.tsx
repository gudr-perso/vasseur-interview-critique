import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { loadPresets, savePreset, deletePreset } from '../lib/presets'
import { Button } from '../components/ui/Button'
import type { TemplateKey, Preset } from '../types'

const TABS: { key: TemplateKey; label: string }[] = [
  { key: 'critique', label: 'Analyse critique' },
  { key: 'article',  label: 'Article' },
  { key: 'verif',    label: 'Vérification faits' },
]

const VARIABLES = ['journaliste', 'sujet', 'secteur', 'qa', 'flags', 'kb']

export function TemplatesScreen() {
  const { templates, setTemplate, resetTemplate, loadPreset, templateFrom, setScreen } = useStore()
  const [activeTab, setActiveTab] = useState<TemplateKey>('critique')
  const [presets, setPresets] = useState<Preset[]>([])
  const [presetName, setPresetName] = useState('')
  const [selectedPreset, setSelectedPreset] = useState('')
  const [flashMsg, setFlashMsg] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setPresets(loadPresets())
  }, [])

  const flash = (msg: string) => {
    setFlashMsg(msg)
    setTimeout(() => setFlashMsg(''), 2500)
  }

  const insertVar = (varName: string) => {
    const ta = taRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const v = `{{${varName}}}`
    const current = templates[activeTab]
    const next = current.slice(0, start) + v + current.slice(end)
    setTemplate(activeTab, next)
    requestAnimationFrame(() => {
      ta.setSelectionRange(start + v.length, start + v.length)
      ta.focus()
    })
  }

  const handleTabChange = (key: TemplateKey) => {
    setActiveTab(key)
  }

  const handleReset = () => {
    resetTemplate(activeTab)
    flash('Remis par défaut.')
  }

  const handlePresetSave = () => {
    const name = presetName.trim()
    if (!name) { alert('Donnez un nom au preset.'); return }
    const existing = presets.find(p => p.name === name)
    if (existing && !confirm(`Écraser le preset "${name}" ?`)) return
    const preset: Preset = {
      name,
      templates: { ...templates },
      createdAt: new Date().toISOString(),
    }
    savePreset(preset)
    const updated = loadPresets()
    setPresets(updated)
    flash(`Preset "${name}" sauvegardé.`)
  }

  const handlePresetLoad = () => {
    if (!selectedPreset) { alert('Sélectionnez un preset.'); return }
    const preset = presets.find(p => p.name === selectedPreset)
    if (!preset) return
    loadPreset(preset)
    flash(`Preset "${selectedPreset}" chargé.`)
  }

  const handlePresetDelete = () => {
    if (!selectedPreset) { alert('Sélectionnez un preset.'); return }
    if (!confirm(`Supprimer le preset "${selectedPreset}" ?`)) return
    deletePreset(selectedPreset)
    const updated = loadPresets()
    setPresets(updated)
    setSelectedPreset('')
    flash('Supprimé.')
  }

  const handleBack = () => {
    setScreen(templateFrom === 'synth' ? 'synthesis' : 'config')
  }

  return (
    <div className="max-w-[820px] w-full mx-auto px-6 pb-10 pt-5">
      {/* VasseurCard */}
      <div className="bg-ink text-paper mb-5 px-5 py-4 border-l-4 border-red">
        <div className="font-mono text-[0.6rem] text-red uppercase tracking-[0.1em] mb-1.5">▶ Configuration</div>
        <div className="font-display italic text-[0.95rem] leading-[1.65] text-[#e8e0d0]">
          Configurez les prompts. Les variables {'{{qa}}'}, {'{{journaliste}}'}, {'{{sujet}}'}, {'{{secteur}}'}, {'{{flags}}'}, {'{{kb}}'} seront remplacées automatiquement.
        </div>
      </div>

      <div className="bg-white border border-border overflow-hidden mb-3.5">
        {/* En-tête */}
        <div className="px-5 pt-5 pb-4 border-b border-border">
          <h2 className="font-display font-bold text-[1.1rem] mb-1">Configurer les rendus</h2>
          <p className="text-[0.86rem] text-muted leading-relaxed">
            Personnalisez les prompts utilisés par chaque bouton de sortie. Utilisez les variables pour injecter le contexte automatiquement.
          </p>
        </div>

        <div className="px-5 py-4">
          {/* Variables */}
          <div className="flex flex-wrap gap-1.5 items-center mb-4">
            <span className="font-mono text-[0.6rem] text-muted uppercase tracking-wider mr-1">Variables :</span>
            {VARIABLES.map(v => (
              <button
                key={v}
                type="button"
                onClick={() => insertVar(v)}
                className="font-mono text-[0.67rem] px-2 py-1 bg-paper2 border border-border text-ink cursor-pointer hover:bg-ink hover:text-paper hover:border-ink transition-all duration-150"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>

          {/* Onglets */}
          <div className="flex border-b-2 border-ink mb-0">
            {TABS.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                className={`px-4 py-2 font-mono text-[0.68rem] uppercase tracking-wider cursor-pointer border-r border-border transition-all duration-150 ${
                  activeTab === tab.key
                    ? 'bg-white text-ink font-medium border-b-2 border-b-white -mb-0.5'
                    : 'bg-paper2 text-muted hover:bg-paper hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Éditeur */}
          <textarea
            ref={taRef}
            className="w-full min-h-[260px] font-mono text-[0.78rem] leading-[1.65] border border-border border-t-0 p-3.5 text-ink bg-white outline-none focus:border-ink transition-colors resize-y"
            value={templates[activeTab]}
            onChange={e => setTemplate(activeTab, e.target.value)}
          />

          {/* Actions template */}
          <div className="flex justify-between items-center mt-2 flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>Réinitialiser par défaut</Button>
            <span className="font-mono text-[0.6rem] text-muted">{flashMsg}</span>
          </div>

          {/* Presets */}
          <div className="flex gap-2 items-center flex-wrap pt-3.5 border-t border-border mt-3">
            <span className="font-mono text-[0.6rem] text-muted uppercase tracking-wider flex-shrink-0">Presets :</span>
            <input
              type="text"
              className="flex-1 min-w-[140px] max-w-[220px] border border-border px-2.5 py-1.5 text-[0.83rem] font-sans bg-paper text-ink outline-none focus:border-ink"
              placeholder="Nom du preset…"
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
            />
            <Button variant="dark" size="sm" onClick={handlePresetSave}>Sauvegarder</Button>
            <select
              className="flex-1 min-w-[140px] max-w-[220px] border border-border px-2.5 py-1.5 text-[0.83rem] font-sans bg-paper text-ink outline-none cursor-pointer"
              value={selectedPreset}
              onChange={e => setSelectedPreset(e.target.value)}
            >
              <option value="">— Charger un preset —</option>
              {presets.map(p => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={handlePresetLoad}>Charger</Button>
            <Button variant="danger" size="sm" onClick={handlePresetDelete}>Supprimer</Button>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={handleBack}>← Retour</Button>
      </div>
    </div>
  )
}
