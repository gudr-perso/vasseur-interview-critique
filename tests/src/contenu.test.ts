import { describe, expect, it } from 'vitest'
import {
  changerType, contenuVide, deplacer, estHybride, nouveauTheme, nouvelleQuestion, pretPourEnvoi,
} from '../../src/admin/contenu'

describe('contenu de questionnaire', () => {
  it('propose un contenu de départ par mode', () => {
    expect(contenuVide('hybride')).toEqual({
      questions: [{ id: 'q1', type: 'texte', libelle: '', objectif: '' }],
    })
    expect(contenuVide('entretien')).toEqual({
      question_ouverture: '', themes: [{ id: 't1', titre: '', objectif: '' }],
    })
    expect(estHybride(contenuVide('hybride'))).toBe(true)
    expect(estHybride(contenuVide('entretien'))).toBe(false)
  })

  it("donne à une nouvelle question ou à un nouveau thème un identifiant libre", () => {
    expect(nouvelleQuestion([{ id: 'q1' }, { id: 'q3' }]).id).toBe('q2')
    expect(nouvelleQuestion([{ id: 'q1' }, { id: 'q2' }]).id).toBe('q3')
    expect(nouveauTheme([]).id).toBe('t1')
    expect(nouveauTheme([{ id: 't1' }, { id: 'intro' }]).id).toBe('t2')
  })

  it('déplace un élément sans toucher la liste d\'origine, et ignore les bornes', () => {
    const liste = ['a', 'b', 'c']
    expect(deplacer(liste, 0, 1)).toEqual(['b', 'a', 'c'])
    expect(deplacer(liste, 2, -1)).toEqual(['a', 'c', 'b'])
    expect(deplacer(liste, 0, -1)).toEqual(liste)
    expect(deplacer(liste, 2, 1)).toEqual(liste)
    expect(liste).toEqual(['a', 'b', 'c'])
  })

  it('ajoute deux options vides en passant à un type à choix, et les retire sinon', () => {
    const texte = { id: 'q1', type: 'texte' as const, libelle: 'L', objectif: 'O' }
    const choix = changerType(texte, 'choix_unique')
    expect(choix).toEqual({ ...texte, type: 'choix_unique', options: ['', ''] })
    expect(changerType(choix, 'choix_multiple').options).toEqual(['', ''])
    expect(changerType({ ...choix, options: ['A', 'B'] }, 'choix_multiple').options).toEqual(['A', 'B'])
    expect('options' in changerType(choix, 'echelle')).toBe(false)
  })

  it("retire les options vides avant l'envoi", () => {
    const contenu = {
      questions: [
        { id: 'q1', type: 'choix_unique' as const, libelle: 'L', objectif: 'O', options: ['A', ' ', 'B', ''] },
        { id: 'q2', type: 'texte' as const, libelle: 'L', objectif: 'O' },
      ],
    }
    expect(pretPourEnvoi(contenu)).toEqual({
      questions: [
        { id: 'q1', type: 'choix_unique', libelle: 'L', objectif: 'O', options: ['A', 'B'] },
        { id: 'q2', type: 'texte', libelle: 'L', objectif: 'O' },
      ],
    })
    const entretien = { question_ouverture: 'Q', themes: [{ id: 't1', titre: 'T', objectif: 'O' }] }
    expect(pretPourEnvoi(entretien)).toEqual(entretien)
  })
})
