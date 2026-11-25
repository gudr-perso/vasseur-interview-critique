import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ErreurMetier } from '../../server/erreurs'
import { enregistrerLogiciel, lireLogiciel, listerLogiciels } from '../../server/services/logiciels'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
beforeAll(async () => { base = await creerBaseDeTest() })
afterAll(async () => { await base.fermer() })

describe('logiciels', () => {
  it('crée, relit et liste par ordre alphabétique', async () => {
    const zeendoc = await enregistrerLogiciel(base.db, { nom: 'Zeendoc', contexte: 'GED' })
    await enregistrerLogiciel(base.db, { nom: ' myCuma Infinity ' })
    expect((await lireLogiciel(base.db, zeendoc.id)).contexte).toBe('GED')
    expect((await listerLogiciels(base.db)).map(l => l.nom)).toEqual(['myCuma Infinity', 'Zeendoc'])
  })

  it('met à jour par identifiant', async () => {
    const cree = await enregistrerLogiciel(base.db, { nom: 'Divalto' })
    const maj = await enregistrerLogiciel(base.db, { id: cree.id, nom: 'Divalto Infinity', contexte: 'ERP' })
    expect(maj).toMatchObject({ id: cree.id, nom: 'Divalto Infinity', contexte: 'ERP' })
  })

  it('sans identifiant, un nom déjà connu met à jour la fiche au lieu de la dupliquer', async () => {
    const avant = (await listerLogiciels(base.db)).length
    const maj = await enregistrerLogiciel(base.db, { nom: 'zeendoc', contexte: 'GED en ligne' })
    expect(maj.nom).toBe('Zeendoc')
    expect(maj.contexte).toBe('GED en ligne')
    expect((await listerLogiciels(base.db)).length).toBe(avant)
  })

  it('conserve le contexte quand il est omis à la mise à jour', async () => {
    const maj = await enregistrerLogiciel(base.db, { nom: 'Zeendoc' })
    expect(maj.contexte).toBe('GED en ligne')
  })

  it('refuse un nom vide, un identifiant inconnu et un renommage en doublon', async () => {
    await expect(enregistrerLogiciel(base.db, { nom: '  ' })).rejects.toThrow(ErreurMetier)
    await expect(enregistrerLogiciel(base.db, { id: 'inconnu', nom: 'X' })).rejects.toMatchObject({ statut: 404 })
    const autre = await enregistrerLogiciel(base.db, { nom: 'Autre' })
    await expect(enregistrerLogiciel(base.db, { id: autre.id, nom: 'Zeendoc' })).rejects.toMatchObject({ statut: 409 })
    await expect(lireLogiciel(base.db, 'inconnu')).rejects.toMatchObject({ statut: 404 })
  })
})
