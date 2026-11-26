import { describe, expect, it } from 'vitest'
import { libellesQuestionnaires } from '../../shared/interviews'

const q = (id: string, public_vise: string, mode: string, statut: string, cree_le = '2026-11-20T09:05:00.000Z') =>
  ({ id, public_vise, mode, statut, cree_le })

describe('libellesQuestionnaires', () => {
  it('donne le public, le mode et le statut', () => {
    const libelles = libellesQuestionnaires([q('a', 'Comptables', 'hybride', 'ouvert'), q('b', 'Gérants', 'entretien', 'clos')])
    expect([...libelles]).toEqual([['a', 'Comptables (hybride, ouvert)'], ['b', 'Gérants (entretien, clos)']])
  })

  it('distingue deux questionnaires de même public par leur mode ou leur statut', () => {
    const libelles = libellesQuestionnaires([
      q('a', 'Comptables', 'hybride', 'ouvert'), q('b', 'Comptables', 'entretien', 'ouvert'), q('c', 'Comptables', 'hybride', 'clos'),
    ])
    expect(new Set(libelles.values()).size).toBe(3)
    expect(libelles.get('b')).toBe('Comptables (entretien, ouvert)')
  })

  it('ajoute la date de création, puis l\'heure, quand le reste est identique', () => {
    const libelles = libellesQuestionnaires([
      q('a', 'Comptables', 'hybride', 'ouvert', '2026-11-20T09:05:00.000Z'),
      q('b', 'Comptables', 'hybride', 'ouvert', '2026-11-22T14:30:00.000Z'),
      q('c', 'Comptables', 'hybride', 'ouvert', '2026-11-22T16:45:00.000Z'),
      q('d', 'Gérants', 'hybride', 'ouvert'),
    ])
    expect(libelles.get('a')).toBe('Comptables (hybride, ouvert, créé le 20/11/2026)')
    expect(libelles.get('b')).toBe('Comptables (hybride, ouvert, créé le 22/11/2026 à 14:30)')
    expect(libelles.get('c')).toBe('Comptables (hybride, ouvert, créé le 22/11/2026 à 16:45)')
    expect(libelles.get('d')).toBe('Gérants (hybride, ouvert)')
  })

  it('départage par leur rang deux questionnaires créés dans la même minute', () => {
    const libelles = libellesQuestionnaires([
      q('a', 'Comptables', 'hybride', 'brouillon', '2026-11-22T14:30:01.000Z'),
      q('b', 'Comptables', 'hybride', 'brouillon', '2026-11-22T14:30:02.000Z'),
    ])
    expect([...libelles.values()]).toEqual([
      'Comptables (hybride, brouillon, créé le 22/11/2026 à 14:30, n° 1)',
      'Comptables (hybride, brouillon, créé le 22/11/2026 à 14:30, n° 2)',
    ])
  })
})
