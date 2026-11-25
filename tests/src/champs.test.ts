import { describe, expect, it } from 'vitest'
import { etatLongueur } from '../../src/admin/champs'
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
