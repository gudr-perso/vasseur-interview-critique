import { describe, expect, it } from 'vitest'
import type { QuestionPublique } from '../../shared/repondants'
import {
  BROUILLON_VIDE, controlerIdentite, IDENTITE_VIDE, identiteNettoyee, libelleProgression, lireBrouillonBrut, versReponse,
} from '../../src/repondant/saisie'

const choix = (type: 'choix_unique' | 'choix_multiple'): QuestionPublique =>
  ({ ordre: 1, type, libelle: 'Q', options: ['A', 'B', 'C'] })

describe('versReponse', () => {
  it('ne donne rien tant que la saisie est vide', () => {
    for (const type of ['choix_unique', 'choix_multiple', 'echelle', 'texte', 'relance', 'ouverte'] as const) {
      expect(versReponse({ ordre: 1, type, libelle: 'Q', options: ['A'] }, BROUILLON_VIDE)).toBeNull()
    }
  })

  it('choix unique : une option proposée, commentaire nettoyé', () => {
    expect(versReponse(choix('choix_unique'), { ...BROUILLON_VIDE, choix: ['B'], commentaire: '  vu  ' }))
      .toEqual({ valeur: 'B', commentaire: 'vu' })
    expect(versReponse(choix('choix_unique'), { ...BROUILLON_VIDE, choix: ['Z'] })).toBeNull()
  })

  it('choix multiple : dans l\'ordre des options, sans commentaire vide', () => {
    expect(versReponse(choix('choix_multiple'), { ...BROUILLON_VIDE, choix: ['C', 'A'], commentaire: '  ' }))
      .toEqual({ valeur: ['A', 'C'] })
  })

  it('échelle : la note', () => {
    expect(versReponse({ ordre: 2, type: 'echelle', libelle: 'Q' }, { ...BROUILLON_VIDE, note: 4 })).toEqual({ valeur: 4 })
  })

  it('texte, relance, ouverte : le texte sans espaces de bord, jamais de commentaire', () => {
    for (const type of ['texte', 'relance', 'ouverte'] as const) {
      expect(versReponse({ ordre: 3, type, libelle: 'Q' }, { ...BROUILLON_VIDE, texte: ' Sur papier ', commentaire: 'x' }))
        .toEqual({ texte: 'Sur papier' })
    }
    expect(versReponse({ ordre: 3, type: 'texte', libelle: 'Q' }, { ...BROUILLON_VIDE, texte: '   ' })).toBeNull()
  })
})

describe('lireBrouillonBrut', () => {
  it('relit un brouillon conservé', () => {
    const brouillon = { choix: ['A'], note: 3, texte: 'en cours', commentaire: 'c' }
    expect(lireBrouillonBrut(JSON.stringify(brouillon))).toEqual(brouillon)
  })

  it('écarte un contenu absent, illisible ou d\'une autre forme', () => {
    expect(lireBrouillonBrut(null)).toEqual(BROUILLON_VIDE)
    expect(lireBrouillonBrut('{pas du json')).toEqual(BROUILLON_VIDE)
    expect(lireBrouillonBrut('"texte"')).toEqual(BROUILLON_VIDE)
    expect(lireBrouillonBrut(JSON.stringify({ choix: [1, 'B'], note: 9, texte: 4 })))
      .toEqual({ choix: ['B'], note: null, texte: '', commentaire: '' })
  })
})

describe('libelleProgression', () => {
  const question: QuestionPublique = { ordre: 3, type: 'texte', libelle: 'Q' }

  it('numérote la question en cours en mode hybride', () => {
    expect(libelleProgression(question, { faites: 1, total: 8 })).toEqual({ libelle: 'Question 2 sur 8', part: 1 / 8 })
  })

  it('une relance garde le numéro de sa question', () => {
    expect(libelleProgression({ ...question, type: 'relance' }, { faites: 2, total: 8 })?.libelle).toBe('Question 2 sur 8')
  })

  it('rien en mode entretien', () => {
    expect(libelleProgression({ ...question, type: 'ouverte' }, {})).toBeNull()
  })
})

describe('controlerIdentite', () => {
  it('signale le premier obligatoire vide avec le message du serveur', () => {
    expect(controlerIdentite(IDENTITE_VIDE)).toEqual({ champ: 'nom', message: 'Le nom est obligatoire.' })
    expect(controlerIdentite({ ...IDENTITE_VIDE, nom: 'Dupont', prenom: 'Marc', entreprise: '  ' }))
      .toEqual({ champ: 'entreprise', message: 'L\'entreprise est obligatoire.' })
  })

  it('laisse passer une identité sans poste ni mail', () => {
    expect(controlerIdentite({ ...IDENTITE_VIDE, nom: 'Dupont', prenom: 'Marc', entreprise: 'CUMA' })).toBeNull()
  })

  it('nettoie les espaces de bord', () => {
    expect(identiteNettoyee({ nom: ' Dupont ', prenom: 'Marc', poste: '', entreprise: ' CUMA', mail: ' m@x.fr ' }))
      .toEqual({ nom: 'Dupont', prenom: 'Marc', poste: '', entreprise: 'CUMA', mail: 'm@x.fr' })
  })
})
