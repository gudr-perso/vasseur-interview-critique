import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerProjet } from '../../server/services/projets'
import { enregistrerQuestionnaire } from '../../server/services/questionnaires'
import { creerBaseDeTest } from '../helpers/d1'

vi.mock('../../server/ids', async importOriginal => {
  const reel = await importOriginal<typeof import('../../server/ids')>()
  return { ...reel, nouveauCode: vi.fn(reel.nouveauCode) }
})
const ids = await import('../../server/ids')

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
let projetId: string
const hybride = { questions: [{ type: 'texte', libelle: 'Que faites-vous ?', objectif: 'Quotidien' }] }
const saisie = () => ({ projet_id: projetId, public_vise: 'Public', mode: 'hybride' as const, contenu: hybride })

beforeAll(async () => {
  base = await creerBaseDeTest()
  projetId = (await creerProjet(base.db, { titre: 'Projet', type_demande: 'amelioration' })).id
})
afterAll(async () => { await base.fermer() })
beforeEach(() => { vi.mocked(ids.nouveauCode).mockReset() })

describe('collision de code d\'URL', () => {
  it('retente avec un nouveau code', async () => {
    vi.mocked(ids.nouveauCode).mockReturnValueOnce('AAAAAAAAAA').mockReturnValueOnce('AAAAAAAAAA').mockReturnValueOnce('BBBBBBBBBB')
    const premier = await enregistrerQuestionnaire(base.db, saisie())
    expect(premier.code).toBe('AAAAAAAAAA')
    const second = await enregistrerQuestionnaire(base.db, saisie())
    expect(second.code).toBe('BBBBBBBBBB')
    expect(ids.nouveauCode).toHaveBeenCalledTimes(3)
  })

  it('abandonne avec une erreur métier après trois essais', async () => {
    vi.mocked(ids.nouveauCode).mockReturnValue('CCCCCCCCCC')
    await enregistrerQuestionnaire(base.db, saisie())
    vi.mocked(ids.nouveauCode).mockClear()
    await expect(enregistrerQuestionnaire(base.db, saisie())).rejects.toMatchObject({ name: 'ErreurMetier' })
    expect(ids.nouveauCode).toHaveBeenCalledTimes(3)
  })
})
