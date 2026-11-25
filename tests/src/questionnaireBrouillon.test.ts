import { describe, expect, it } from 'vitest'
import type { ContenuHybride, Questionnaire } from '../../shared/interviews'
import {
  BORNES, TOURS_PAR_DEFAUT, empreinte, modifsChangementMode, versBrouillon, versSaisie, type Brouillon,
} from '../../src/admin/questionnaireBrouillon'

const questionnaire: Questionnaire = {
  id: 'Q', projet_id: 'P', public_vise: 'Comptables', mode: 'hybride', introduction: 'Bonjour',
  duree_estimee_min: 10, relances_max_par_question: 2, tours_max: 12, code: 'abc', statut: 'brouillon',
  cree_le: '2026-01-01', maj_le: '2026-01-01',
  contenu: {
    questions: [
      { id: 'q1', type: 'choix_unique', libelle: 'Outil ?', objectif: 'Savoir', options: ['A', ' ', 'B', ''] },
      { id: 'q2', type: 'texte', libelle: 'Pourquoi ?', objectif: 'Comprendre' },
    ],
  },
}

const brouillon = (): Brouillon => versBrouillon(questionnaire)

describe('versBrouillon', () => {
  it('reprend le questionnaire, nombres en texte', () => {
    expect(brouillon()).toEqual({
      public_vise: 'Comptables', mode: 'hybride', introduction: 'Bonjour',
      duree: '10', relances: '2', tours: '12', contenu: questionnaire.contenu,
    })
  })
})

describe('empreinte : détection des modifications', () => {
  it('est stable pour un brouillon inchangé, même recopié', () => {
    expect(empreinte(brouillon())).toBe(empreinte(structuredClone(brouillon())))
  })

  it('change pour un réglage, une question, une option ou l\'ordre des questions', () => {
    const base = empreinte(brouillon())
    const b = brouillon()
    expect(empreinte({ ...b, introduction: 'Salut' })).not.toBe(base)
    expect(empreinte({ ...b, tours: '13' })).not.toBe(base)
    const { questions } = b.contenu as ContenuHybride
    expect(empreinte({ ...b, contenu: { questions: [{ ...questions[0], libelle: 'Outil ?!' }, questions[1]] } })).not.toBe(base)
    expect(empreinte({ ...b, contenu: { questions: [{ ...questions[0], options: ['A', 'B'] }, questions[1]] } })).not.toBe(base)
    expect(empreinte({ ...b, contenu: { questions: [questions[1], questions[0]] } })).not.toBe(base)
  })

  it('suit le contenu d\'un entretien', () => {
    const entretien: Brouillon = {
      ...brouillon(), mode: 'entretien',
      contenu: { question_ouverture: 'Racontez', themes: [{ id: 't1', titre: 'Outils', objectif: 'Savoir' }] },
    }
    const base = empreinte(entretien)
    expect(empreinte({ ...entretien, contenu: { question_ouverture: 'Racontez-moi', themes: [{ id: 't1', titre: 'Outils', objectif: 'Savoir' }] } })).not.toBe(base)
    expect(empreinte({ ...entretien, contenu: { question_ouverture: 'Racontez', themes: [{ id: 't1', titre: 'Outils', objectif: 'Autre' }] } })).not.toBe(base)
  })
})

describe('versSaisie : corps envoyé', () => {
  it('convertit les nombres et retire les options vides', () => {
    expect(versSaisie(brouillon())).toEqual({
      public_vise: 'Comptables', mode: 'hybride', introduction: 'Bonjour',
      duree_estimee_min: 10, relances_max_par_question: 2, tours_max: 12,
      contenu: {
        questions: [
          { id: 'q1', type: 'choix_unique', libelle: 'Outil ?', objectif: 'Savoir', options: ['A', 'B'] },
          { id: 'q2', type: 'texte', libelle: 'Pourquoi ?', objectif: 'Comprendre' },
        ],
      },
    })
  })

  it('n\'envoie jamais le statut, le code ni le projet', () => {
    const saisie = versSaisie(brouillon()) as unknown as Record<string, unknown>
    expect(saisie).not.toHaveProperty('statut')
    expect(saisie).not.toHaveProperty('code')
    expect(saisie).not.toHaveProperty('projet_id')
  })

  it('exige un public visé', () => {
    expect(() => versSaisie({ ...brouillon(), public_vise: '  ' })).toThrow('Le public visé est obligatoire.')
  })

  it('accepte les bornes et refuse ce qui en sort, un champ vide ou un décimal', () => {
    const { duree, relances, tours } = BORNES
    expect(versSaisie({ ...brouillon(), duree: String(duree.min), relances: String(relances.min), tours: String(tours.min) }))
      .toMatchObject({ duree_estimee_min: duree.min, relances_max_par_question: relances.min, tours_max: tours.min })
    expect(versSaisie({ ...brouillon(), duree: String(duree.max), relances: String(relances.max), tours: String(tours.max) }))
      .toMatchObject({ duree_estimee_min: duree.max, relances_max_par_question: relances.max, tours_max: tours.max })

    expect(() => versSaisie({ ...brouillon(), duree: String(duree.min - 1) })).toThrow('Durée estimée en minutes : un entier entre 1 et 120.')
    expect(() => versSaisie({ ...brouillon(), duree: String(duree.max + 1) })).toThrow('Durée estimée')
    expect(() => versSaisie({ ...brouillon(), relances: String(relances.max + 1) })).toThrow('Relances par question')
    expect(() => versSaisie({ ...brouillon(), tours: '' })).toThrow('Plafond de relances au total')
    expect(() => versSaisie({ ...brouillon(), duree: '2.5' })).toThrow('Durée estimée')
  })

  it('nomme le plafond selon le mode', () => {
    const entretien: Brouillon = {
      ...brouillon(), mode: 'entretien', tours: '0',
      contenu: { question_ouverture: 'Racontez', themes: [{ id: 't1', titre: 'Outils', objectif: 'Savoir' }] },
    }
    expect(() => versSaisie(entretien)).toThrow('Plafond de questions')
  })
})

describe('changement de mode', () => {
  it('repart du plafond par défaut du nouveau mode, avec un contenu vide', () => {
    expect(modifsChangementMode('entretien')).toEqual({
      mode: 'entretien', tours: String(TOURS_PAR_DEFAUT.entretien),
      contenu: { question_ouverture: '', themes: [{ id: 't1', titre: '', objectif: '' }] },
    })
    expect(modifsChangementMode('hybride')).toEqual({
      mode: 'hybride', tours: String(TOURS_PAR_DEFAUT.hybride),
      contenu: { questions: [{ id: 'q1', type: 'texte', libelle: '', objectif: '' }] },
    })
  })

  it('donne aux deux modes un plafond par défaut dans les bornes', () => {
    for (const tours of Object.values(TOURS_PAR_DEFAUT)) {
      expect(tours).toBeGreaterThanOrEqual(BORNES.tours.min)
      expect(tours).toBeLessThanOrEqual(BORNES.tours.max)
    }
  })
})
