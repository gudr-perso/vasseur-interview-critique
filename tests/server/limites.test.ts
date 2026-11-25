import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { enregistrerLogiciel } from '../../server/services/logiciels'
import { ajouterDocument, creerProjet, modifierProjet } from '../../server/services/projets'
import { enregistrerQuestionnaire } from '../../server/services/questionnaires'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
let projetId: string

beforeAll(async () => {
  base = await creerBaseDeTest()
  projetId = (await creerProjet(base.db, { titre: 'Projet', type_demande: 'amelioration' })).id
})
afterAll(async () => { await base.fermer() })

const trop = (n: number) => 'x'.repeat(n + 1)
const hybride = { questions: [{ type: 'texte', libelle: 'Que faites-vous ?', objectif: 'Quotidien' }] }

describe('plafonds de longueur des services', () => {
  it('projet : titre, description à la création', async () => {
    await expect(creerProjet(base.db, { titre: trop(200), type_demande: 'amelioration' }))
      .rejects.toThrow('Titre du projet trop long (200 caractères au plus')
    await expect(creerProjet(base.db, { titre: 'X', type_demande: 'amelioration', description: trop(20_000) }))
      .rejects.toThrow('Description trop longue (20000 caractères au plus')
    await expect(creerProjet(base.db, { titre: 'x'.repeat(200), type_demande: 'amelioration', description: 'x'.repeat(20_000) }))
      .resolves.toBeTruthy()
  })

  it('projet : titre, description, note de cadrage et résumé à la modification', async () => {
    await expect(modifierProjet(base.db, projetId, { titre: trop(200) })).rejects.toThrow('Titre du projet trop long')
    await expect(modifierProjet(base.db, projetId, { description: trop(20_000) })).rejects.toThrow('Description trop longue')
    await expect(modifierProjet(base.db, projetId, { note_cadrage: trop(50_000) }))
      .rejects.toThrow('Note de cadrage trop longue (50000 caractères au plus')
    await expect(modifierProjet(base.db, projetId, { resume_contexte: trop(20_000) }))
      .rejects.toThrow('Résumé de contexte trop long (20000 caractères au plus')
    await expect(modifierProjet(base.db, projetId, { note_cadrage: 'x'.repeat(50_000), resume_contexte: 'x'.repeat(20_000) }))
      .resolves.toBeTruthy()
  })

  it('logiciel : nom et contexte', async () => {
    await expect(enregistrerLogiciel(base.db, { nom: trop(200) }))
      .rejects.toThrow('Nom du logiciel trop long (200 caractères au plus')
    await expect(enregistrerLogiciel(base.db, { nom: 'Logiciel', contexte: trop(20_000) }))
      .rejects.toThrow('Contexte du logiciel trop long (20000 caractères au plus')
  })

  it('questionnaire : public visé et introduction', async () => {
    const saisie = { projet_id: projetId, public_vise: 'Comptables', mode: 'hybride' as const, contenu: hybride }
    await expect(enregistrerQuestionnaire(base.db, { ...saisie, public_vise: trop(200) }))
      .rejects.toThrow('Public visé trop long (200 caractères au plus')
    await expect(enregistrerQuestionnaire(base.db, { ...saisie, introduction: trop(2_000) }))
      .rejects.toThrow('Introduction trop longue (2000 caractères au plus')
    await expect(enregistrerQuestionnaire(base.db, { ...saisie, public_vise: 'x'.repeat(200), introduction: 'x'.repeat(2_000) }))
      .resolves.toBeTruthy()
  })

  it('document : nom et contenu', async () => {
    await expect(ajouterDocument(base.db, projetId, { nom: trop(200), contenu: 'a' }))
      .rejects.toThrow('Nom du document trop long (200 caractères au plus')
    await expect(ajouterDocument(base.db, projetId, { nom: 'a', contenu: trop(200_000) }))
      .rejects.toThrow('Contenu du document trop long (200000 caractères au plus')
    await expect(ajouterDocument(base.db, projetId, { nom: 'a', contenu: 'x'.repeat(200_000) })).resolves.toBeTruthy()
  })
})
