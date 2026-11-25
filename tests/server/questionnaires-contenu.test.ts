import { describe, expect, it } from 'vitest'
import { validerContenu } from '../../server/services/questionnaires'

const question = { type: 'texte', libelle: 'Que faites-vous ?', objectif: 'Comprendre le quotidien' }

describe('validerContenu — hybride', () => {
  it('accepte les quatre types et numérote les questions sans identifiant', () => {
    const contenu = validerContenu('hybride', {
      questions: [
        question,
        { id: 'frequence', type: 'choix_unique', libelle: 'À quelle fréquence ?', options: ['Jamais', 'Parfois'], objectif: 'o' },
        { type: 'choix_multiple', libelle: 'Quels outils ?', options: ['A', 'B', 'C'], objectif: 'o' },
        { type: 'echelle', libelle: 'Satisfaction ?', objectif: 'o' },
      ],
    })
    expect(contenu).toEqual({
      questions: [
        { id: 'q1', ...question },
        { id: 'frequence', type: 'choix_unique', libelle: 'À quelle fréquence ?', options: ['Jamais', 'Parfois'], objectif: 'o' },
        { id: 'q3', type: 'choix_multiple', libelle: 'Quels outils ?', options: ['A', 'B', 'C'], objectif: 'o' },
        { id: 'q4', type: 'echelle', libelle: 'Satisfaction ?', objectif: 'o' },
      ],
    })
  })

  it.each([
    ['aucune question', { questions: [] }, 'au moins une question'],
    ['pas de liste', {}, 'au moins une question'],
    ['type inconnu', { questions: [{ ...question, type: 'oui_non' }] }, 'Question 1 : type inconnu'],
    ['libellé vide', { questions: [{ ...question, libelle: ' ' }] }, 'Question 1 : libellé manquant'],
    ['objectif absent', { questions: [{ type: 'texte', libelle: 'x' }] }, 'Question 1 : objectif manquant'],
    ['choix sans options', { questions: [{ ...question, type: 'choix_unique' }] }, 'Question 1 : entre 2 et 10 options'],
    ['une seule option', { questions: [{ ...question, type: 'choix_unique', options: ['A'] }] }, 'entre 2 et 10 options'],
    ['options sur du texte', { questions: [{ ...question, options: ['A', 'B'] }] }, 'Question 1 : pas d\'options'],
    ['identifiants en double', { questions: [{ ...question, id: 'a' }, { ...question, id: 'a' }] }, 'Question 2 : identifiant « a » déjà utilisé'],
  ])('refuse : %s', (_cas, contenu, message) => {
    expect(() => validerContenu('hybride', contenu)).toThrow(message)
  })

  it('refuse plus de 40 questions', () => {
    const questions = Array.from({ length: 41 }, () => question)
    expect(() => validerContenu('hybride', { questions })).toThrow('40 questions au plus')
  })
})

describe('validerContenu — entretien', () => {
  it('accepte un guide et numérote les thèmes', () => {
    expect(validerContenu('entretien', {
      question_ouverture: 'Racontez-moi votre dernière clôture.',
      themes: [{ titre: 'Existant', objectif: 'Décrire le fonctionnement actuel' }],
    })).toEqual({
      question_ouverture: 'Racontez-moi votre dernière clôture.',
      themes: [{ id: 't1', titre: 'Existant', objectif: 'Décrire le fonctionnement actuel' }],
    })
  })

  it.each([
    ['ouverture absente', { themes: [{ titre: 'a', objectif: 'b' }] }, 'question d\'ouverture'],
    ['aucun thème', { question_ouverture: 'x', themes: [] }, 'au moins un thème'],
    ['thème sans objectif', { question_ouverture: 'x', themes: [{ titre: 'a' }] }, 'Thème 1 : objectif manquant'],
  ])('refuse : %s', (_cas, contenu, message) => {
    expect(() => validerContenu('entretien', contenu)).toThrow(message)
  })
})
