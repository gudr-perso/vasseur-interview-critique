import { describe, expect, it } from 'vitest'
import { reponseEnTexte, validerReponse } from '../../server/services/reponses'

const choix = { id: 'q1', type: 'choix_unique' as const, libelle: 'Fréquence ?', objectif: 'o', options: ['Jour', 'Semaine'] }
const multiple = { ...choix, type: 'choix_multiple' as const, options: ['A', 'B', 'C'] }
const echelle = { id: 'q2', type: 'echelle' as const, libelle: 'Note ?', objectif: 'o' }
const texte = { id: 'q3', type: 'texte' as const, libelle: 'Comment ?', objectif: 'o' }

describe('validerReponse', () => {
  it('accepte une option existante, avec commentaire facultatif nettoyé', () => {
    expect(validerReponse(choix, { valeur: 'Jour', commentaire: '  parfois  ' })).toEqual({ valeur: 'Jour', commentaire: 'parfois' })
    expect(validerReponse(choix, { valeur: 'Semaine', commentaire: ' ' })).toEqual({ valeur: 'Semaine' })
  })

  it('refuse une option inconnue ou absente', () => {
    expect(() => validerReponse(choix, { valeur: 'Mois' })).toThrow('Choisissez une des réponses proposées.')
    expect(() => validerReponse(choix, {})).toThrow('Choisissez une des réponses proposées.')
  })

  it('choix multiple : au moins une option, toutes connues, sans doublon', () => {
    expect(validerReponse(multiple, { valeur: ['C', 'A', 'A'] })).toEqual({ valeur: ['A', 'C'] })
    expect(() => validerReponse(multiple, { valeur: [] })).toThrow('Choisissez au moins une réponse.')
    expect(() => validerReponse(multiple, { valeur: ['A', 'Z'] })).toThrow('Choisissez parmi les réponses proposées.')
  })

  it('échelle : un entier de 1 à 5', () => {
    expect(validerReponse(echelle, { valeur: 4 })).toEqual({ valeur: 4 })
    for (const valeur of [0, 6, 2.5, '3']) {
      expect(() => validerReponse(echelle, { valeur: valeur as never })).toThrow('Choisissez une note de 1 à 5.')
    }
  })

  it('texte, relance et entretien : un texte visible, borné', () => {
    expect(validerReponse(texte, { texte: '  Sur papier  ' })).toEqual({ texte: 'Sur papier' })
    expect(validerReponse('libre', { texte: 'Oui' })).toEqual({ texte: 'Oui' })
    expect(() => validerReponse(texte, { texte: ' ​ ' })).toThrow('Écrivez votre réponse.')
    expect(() => validerReponse('libre', { texte: 'x'.repeat(4001) })).toThrow('4 000 caractères au plus')
    expect(() => validerReponse(choix, { valeur: 'Jour', commentaire: 'x'.repeat(4001) })).toThrow('4 000 caractères au plus')
  })

  it('ignore les champs qui ne concernent pas le type', () => {
    expect(validerReponse(texte, { texte: 'a', valeur: 'b' })).toEqual({ texte: 'a' })
  })
})

describe('reponseEnTexte', () => {
  it('rend une réponse lisible pour l\'IA et l\'admin', () => {
    expect(reponseEnTexte({ valeur: ['A', 'C'], commentaire: 'surtout A' })).toBe('A ; C — commentaire : surtout A')
    expect(reponseEnTexte({ valeur: 4 })).toBe('4 / 5')
    expect(reponseEnTexte({ texte: 'Sur papier' })).toBe('Sur papier')
  })
})
