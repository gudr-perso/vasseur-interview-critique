import { describe, expect, it } from 'vitest'
import { bornerTexte, etatLongueur } from '../../src/admin/champs'
import { nombre } from '../../src/admin/libelles'

describe('etatLongueur', () => {
  it('ne dit rien sous 80 % de la limite', () => {
    expect(etatLongueur(799, 1000)).toEqual({ compteur: null, atteinte: false })
  })

  it('affiche le compteur dès 80 %', () => {
    expect(etatLongueur(800, 1000)).toEqual({ compteur: `800 / ${nombre(1000)}`, atteinte: false })
  })

  it('signale la limite atteinte', () => {
    expect(etatLongueur(1000, 1000)).toEqual({ compteur: `${nombre(1000)} / ${nombre(1000)}`, atteinte: true })
  })
})

describe('bornerTexte', () => {
  it('laisse un texte qui tient, et coupe un texte trop long en le signalant', () => {
    expect(bornerTexte('abc', 3)).toEqual({ texte: 'abc', coupe: false })
    expect(bornerTexte('abcd', 3)).toEqual({ texte: 'abc', coupe: true })
  })

  it('ne coupe jamais une émoticône en deux', () => {
    expect(bornerTexte('ab😀', 3)).toEqual({ texte: 'ab', coupe: true })
    expect(bornerTexte('a😀b', 3)).toEqual({ texte: 'a😀', coupe: true })
  })
})
