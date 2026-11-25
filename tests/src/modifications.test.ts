import { describe, expect, it } from 'vitest'
import { champsModifies } from '../../src/admin/modifications'

interface Section {
  titre: string
  description: string
  logiciel_ids: string[]
}

const enregistre: Section = { titre: 'A', description: 'Texte', logiciel_ids: ['l1', 'l2'] }

describe('champsModifies', () => {
  it('ne renvoie rien sans saisie', () => {
    expect(champsModifies(enregistre, {})).toEqual({})
  })

  it('ne renvoie que les champs touchés qui diffèrent de la version enregistrée', () => {
    expect(champsModifies(enregistre, { titre: 'B', description: 'Texte' })).toEqual({ titre: 'B' })
  })

  it('compare les listes sans tenir compte de l\'ordre', () => {
    expect(champsModifies(enregistre, { logiciel_ids: ['l2', 'l1'] })).toEqual({})
    expect(champsModifies(enregistre, { logiciel_ids: ['l1'] })).toEqual({ logiciel_ids: ['l1'] })
    expect(champsModifies(enregistre, { logiciel_ids: ['l1', 'l3'] })).toEqual({ logiciel_ids: ['l1', 'l3'] })
  })

  it('garde un champ vidé', () => {
    expect(champsModifies(enregistre, { description: '' })).toEqual({ description: '' })
  })
})
