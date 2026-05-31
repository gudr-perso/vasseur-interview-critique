import type { Preset } from '../types'

const STORAGE_KEY = 'vasseur_presets'

export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Preset[]) : []
  } catch {
    return []
  }
}

export function savePreset(preset: Preset): void {
  try {
    const presets = loadPresets()
    const idx = presets.findIndex(p => p.name === preset.name)
    if (idx >= 0) {
      presets[idx] = preset
    } else {
      presets.push(preset)
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
  } catch {
    // localStorage peut être bloqué en navigation privée
  }
}

export function deletePreset(name: string): void {
  try {
    const presets = loadPresets().filter(p => p.name !== name)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
  } catch {
    // silently fail
  }
}
