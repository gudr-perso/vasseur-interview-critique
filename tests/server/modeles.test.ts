import { beforeEach, describe, expect, it } from 'vitest'
import { construireCatalogue, obtenirCatalogue, viderCache, type ModeleApi } from '../../server/modeles'
import { CATALOGUE_SECOURS, DEFAUTS } from '../../shared/modeles'

const LISTE: ModeleApi[] = [
  { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', created_at: '2026-09-01T00:00:00Z' },
  { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-10-01T00:00:00Z' },
  { id: 'autre-chose', display_name: 'Autre', created_at: '2026-11-01T00:00:00Z' },
]

beforeEach(() => viderCache())

describe('construireCatalogue', () => {
  it('garde les modèles Claude, du plus récent au plus ancien', () => {
    const catalogue = construireCatalogue(LISTE)
    expect(catalogue.modeles).toEqual([
      { id: 'claude-opus-5-5', nom: 'Claude Opus 5.5' },
      { id: 'claude-sonnet-5-5', nom: 'Claude Sonnet 5.5' },
    ])
    expect(catalogue.defauts).toEqual(DEFAUTS)
  })

  it('remplace un défaut absent par le modèle le plus récent', () => {
    const catalogue = construireCatalogue([LISTE[0]])
    expect(catalogue.defauts).toEqual({
      cadrage: 'claude-sonnet-5-5', interview: 'claude-sonnet-5-5', analyse: 'claude-sonnet-5-5',
    })
  })

  it('retombe sur la liste de secours si rien ne convient', () => {
    expect(construireCatalogue([])).toEqual(CATALOGUE_SECOURS)
  })
})

describe('obtenirCatalogue', () => {
  it("n'interroge l'API qu'une fois par période de cache", async () => {
    let appels = 0
    const lister = async () => { appels++; return LISTE }
    await obtenirCatalogue(lister, 0)
    await obtenirCatalogue(lister, 1000)
    expect(appels).toBe(1)
    await obtenirCatalogue(lister, 25 * 60 * 60 * 1000)
    expect(appels).toBe(2)
  })

  it("renvoie la liste de secours si l'API échoue, sans la mettre en cache", async () => {
    const enPanne = async () => { throw new Error('réseau') }
    expect(await obtenirCatalogue(enPanne, 0)).toEqual(CATALOGUE_SECOURS)
    const catalogue = await obtenirCatalogue(async () => LISTE, 1)
    expect(catalogue.modeles).toHaveLength(2)
  })
})
