import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  codePourJeton, effacerBrouillons, garderBrouillon, jetonPourCode, lireBrouillon, oublierJeton, retenirJeton,
} from '../../src/repondant/stockage'
import { BROUILLON_VIDE } from '../../src/repondant/saisie'

/** Stockage en mémoire, au comportement de `Storage`. */
function stockageMemoire(): Storage {
  const valeurs = new Map<string, string>()
  return {
    get length() { return valeurs.size },
    key: (i: number) => [...valeurs.keys()][i] ?? null,
    getItem: (cle: string) => valeurs.get(cle) ?? null,
    setItem: (cle: string, valeur: string) => { valeurs.set(cle, String(valeur)) },
    removeItem: (cle: string) => { valeurs.delete(cle) },
    clear: () => valeurs.clear(),
  }
}

const global = globalThis as { window?: unknown }

beforeEach(() => {
  global.window = { localStorage: stockageMemoire(), sessionStorage: stockageMemoire() }
})
afterEach(() => { delete global.window })

describe('jeton du lien générique', () => {
  it('retrouve le code du lien générique qui a mené à un jeton', () => {
    retenirJeton('CODE1', 'jeton-a')
    expect(jetonPourCode('CODE1')).toBe('jeton-a')
    expect(codePourJeton('jeton-a')).toBe('CODE1')
    // Une invitation nominative n'est jamais retenue : aucun code.
    expect(codePourJeton('jeton-invitation')).toBeNull()
  })

  it('oublie le jeton : la personne suivante repart de l\'accueil', () => {
    retenirJeton('CODE1', 'jeton-a')
    retenirJeton('CODE2', 'jeton-b')
    oublierJeton('jeton-a')
    expect(jetonPourCode('CODE1')).toBeNull()
    expect(codePourJeton('jeton-a')).toBeNull()
    expect(jetonPourCode('CODE2')).toBe('jeton-b')
  })

  it('efface toutes les saisies en cours d\'un jeton, et seulement les siennes', () => {
    garderBrouillon('jeton-a', 1, { ...BROUILLON_VIDE, texte: 'privé' })
    garderBrouillon('jeton-a', 3, { ...BROUILLON_VIDE, texte: 'privé aussi' })
    garderBrouillon('jeton-b', 1, { ...BROUILLON_VIDE, texte: 'autre' })
    effacerBrouillons('jeton-a')
    expect(lireBrouillon('jeton-a', 1)).toEqual(BROUILLON_VIDE)
    expect(lireBrouillon('jeton-a', 3)).toEqual(BROUILLON_VIDE)
    expect(lireBrouillon('jeton-b', 1).texte).toBe('autre')
  })

  it('fonctionne sans stockage disponible', () => {
    global.window = {}
    expect(codePourJeton('x')).toBeNull()
    expect(() => { oublierJeton('x'); effacerBrouillons('x') }).not.toThrow()
  })
})
