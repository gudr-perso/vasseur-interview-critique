import { describe, expect, it } from 'vitest'
import { calculerCout, tarifDe } from '../../shared/tarifs'

const zero = { entree: 0, sortie: 0, cache_lecture: 0, cache_ecriture: 0 }

describe('tarifs', () => {
  it("trouve un modèle exact ou suivi d'une date, jamais une famille voisine", () => {
    expect(tarifDe('claude-opus-5-5')?.entree).toBe(4)
    expect(tarifDe('claude-haiku-4-5-20251001')?.entree).toBe(1)
    expect(tarifDe('claude-opus-5-6')).toBeNull()
  })

  it('ne confond pas un modèle avec une propriété de Object.prototype', () => {
    expect(tarifDe('constructor')).toBeNull()
    expect(tarifDe('toString')).toBeNull()
    expect(calculerCout('__proto__', zero)).toBeNull()
  })

  it('compte entrée, cache et sortie en micro-dollars', () => {
    // Opus 5.5 : 10 000 × 4 + 50 000 × 0,2 + 2 000 × 5 + 3 000 × 20
    expect(calculerCout('claude-opus-5-5', { entree: 10_000, cache_lecture: 50_000, cache_ecriture: 2_000, sortie: 3_000 })).toBe(120_000)
  })

  it('passe Haiku 5.5 au palier long au-delà de 100 000 jetons d’entrée, cache compris', () => {
    expect(calculerCout('claude-haiku-5-5', { ...zero, entree: 50_000, cache_lecture: 50_000, sortie: 1_000 })).toBe(5_000 + 500 + 500)
    expect(calculerCout('claude-haiku-5-5', { ...zero, entree: 50_001, cache_lecture: 50_000, sortie: 1_000 })).toBe(30_001)
  })

  it('renvoie null pour un modèle sans tarif', () => {
    expect(calculerCout('claude-inconnu', zero)).toBeNull()
  })
})
