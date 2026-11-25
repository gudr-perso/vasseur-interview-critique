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

describe('validerContenu — identifiants', () => {
  it('refuse un identifiant fourni qui entre en collision avec un identifiant attribué', () => {
    expect(() => validerContenu('hybride', { questions: [{ ...question, id: 'q2' }, question] }))
      .toThrow('Question 2 : identifiant « q2 » déjà utilisé')
    expect(() => validerContenu('hybride', { questions: [question, { ...question, id: 'q1' }] }))
      .toThrow('identifiant « q1 » déjà utilisé')
  })

  it('refuse deux thèmes de même identifiant, y compris par collision avec un identifiant attribué', () => {
    const theme = { titre: 'a', objectif: 'b' }
    const base = { question_ouverture: 'x' }
    expect(() => validerContenu('entretien', { ...base, themes: [{ ...theme, id: 'a' }, { ...theme, id: 'a' }] }))
      .toThrow('Thème 2 : identifiant « a » déjà utilisé')
    expect(() => validerContenu('entretien', { ...base, themes: [{ ...theme, id: 't2' }, theme] }))
      .toThrow('Thème 2 : identifiant « t2 » déjà utilisé')
  })

  it.each(['a b', 'é', 'a/b', 'x'.repeat(41), 'a.b'])('refuse l\'identifiant de question « %s »', id => {
    expect(() => validerContenu('hybride', { questions: [{ ...question, id }] })).toThrow('identifiant')
  })

  it('refuse un identifiant qui n\'est pas une chaîne, et accepte 40 caractères', () => {
    expect(() => validerContenu('hybride', { questions: [{ ...question, id: 5 }] })).toThrow('identifiant')
    const id = 'A_b-9'.repeat(8)
    expect(validerContenu('hybride', { questions: [{ ...question, id }] })).toMatchObject({ questions: [{ id }] })
  })

  it('refuse un identifiant de thème hors de [A-Za-z0-9_-]', () => {
    expect(() => validerContenu('entretien', {
      question_ouverture: 'x', themes: [{ id: 'th ème', titre: 'a', objectif: 'b' }],
    })).toThrow('Thème 1 : identifiant')
  })
})

describe('validerContenu — options', () => {
  const choix = (options: unknown[]) => ({ questions: [{ ...question, type: 'choix_unique', options }] })

  it('refuse une option qui n\'est pas une chaîne non vide, en nommant la question', () => {
    expect(() => validerContenu('hybride', choix(['A', 5, 'C']))).toThrow('Question 1 : option 2')
    expect(() => validerContenu('hybride', choix(['A', '  ', 'C']))).toThrow('Question 1 : option 2')
    expect(() => validerContenu('hybride', choix(['A', null]))).toThrow('Question 1 : option 2')
  })

  it('refuse les doublons, espaces et casse ignorés', () => {
    expect(() => validerContenu('hybride', choix(['Oui', ' oui ']))).toThrow('Question 1 : option « oui » en double')
  })

  it('refuse une option de plus de 200 caractères', () => {
    expect(() => validerContenu('hybride', choix(['A', 'x'.repeat(201)]))).toThrow('200 caractères')
    expect(() => validerContenu('hybride', choix(['A', 'x'.repeat(200)]))).not.toThrow()
  })
})

describe('validerContenu — longueurs et texte invisible', () => {
  const entretien = { question_ouverture: 'x', themes: [{ titre: 'a', objectif: 'b' }] }

  it.each([
    ['libellé', { questions: [{ ...question, libelle: 'x'.repeat(501) }] }, 'Question 1 : libellé trop long (500 caractères au plus'],
    ['objectif de question', { questions: [{ ...question, objectif: 'x'.repeat(501) }] }, 'Question 1 : objectif trop long (500'],
  ])('refuse un %s trop long', (_cas, contenu, message) => {
    expect(() => validerContenu('hybride', contenu)).toThrow(message)
  })

  it.each([
    ['question d\'ouverture', { ...entretien, question_ouverture: 'x'.repeat(501) }, 'ouverture trop longue (500'],
    ['titre de thème', { ...entretien, themes: [{ titre: 'x'.repeat(201), objectif: 'b' }] }, 'Thème 1 : titre trop long (200'],
    ['objectif de thème', { ...entretien, themes: [{ titre: 'a', objectif: 'x'.repeat(501) }] }, 'Thème 1 : objectif trop long (500'],
  ])('refuse %s trop long', (_cas, contenu, message) => {
    expect(() => validerContenu('entretien', contenu)).toThrow(message)
  })

  it('accepte les longueurs maximales', () => {
    const q = { type: 'texte', libelle: 'x'.repeat(500), objectif: 'y'.repeat(500) }
    expect(() => validerContenu('hybride', { questions: [q] })).not.toThrow()
    expect(() => validerContenu('entretien', {
      question_ouverture: 'x'.repeat(500), themes: [{ titre: 'x'.repeat(200), objectif: 'y'.repeat(500) }],
    })).not.toThrow()
  })

  it('traite un texte fait de caractères invisibles comme vide', () => {
    const invisible = ' ​‍⁠﻿ ㅤ '
    expect(() => validerContenu('hybride', { questions: [{ ...question, libelle: invisible }] })).toThrow('libellé manquant')
    expect(() => validerContenu('hybride', { questions: [{ ...question, objectif: invisible }] })).toThrow('objectif manquant')
    expect(() => validerContenu('entretien', { ...entretien, question_ouverture: invisible })).toThrow('question d\'ouverture')
    expect(() => validerContenu('entretien', { ...entretien, themes: [{ titre: invisible, objectif: 'b' }] })).toThrow('titre manquant')
    expect(() => validerContenu('hybride', {
      questions: [{ ...question, type: 'choix_unique', options: ['A', invisible] }],
    })).toThrow('option 2')
  })
})
