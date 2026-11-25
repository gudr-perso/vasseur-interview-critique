import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { creerProjet, lireProjet } from '../../server/services/projets'
import { enregistrerQuestionnaire, lireQuestionnaire, publierQuestionnaire } from '../../server/services/questionnaires'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
let projetId: string

const hybride = { questions: [{ type: 'texte', libelle: 'Que faites-vous ?', objectif: 'Quotidien' }] }
const entretien = { question_ouverture: 'Racontez.', themes: [{ titre: 'Existant', objectif: 'Décrire' }] }

beforeAll(async () => {
  base = await creerBaseDeTest()
  projetId = (await creerProjet(base.db, { titre: 'Projet', type_demande: 'amelioration' })).id
})
afterAll(async () => { await base.fermer() })

describe('questionnaires', () => {
  it('crée un brouillon hybride avec ses valeurs par défaut', async () => {
    const q = await enregistrerQuestionnaire(base.db, {
      projet_id: projetId, public_vise: ' Comptables ', mode: 'hybride', contenu: hybride,
    })
    expect(q).toMatchObject({
      public_vise: 'Comptables', mode: 'hybride', statut: 'brouillon', introduction: '',
      duree_estimee_min: 10, relances_max_par_question: 1, tours_max: 12,
    })
    expect(q.code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/)
    expect(q.contenu).toEqual({ questions: [{ id: 'q1', ...hybride.questions[0] }] })
    expect(await lireQuestionnaire(base.db, q.id)).toEqual(q)
  })

  it('plafonne un entretien à 15 tours par défaut', async () => {
    const q = await enregistrerQuestionnaire(base.db, {
      projet_id: projetId, public_vise: 'Animateurs terrain', mode: 'entretien', contenu: entretien,
    })
    expect(q.tours_max).toBe(15)
  })

  it('remplace un brouillon en gardant son code', async () => {
    const q = await enregistrerQuestionnaire(base.db, {
      projet_id: projetId, public_vise: 'Directeurs', mode: 'hybride', contenu: hybride,
    })
    const maj = await enregistrerQuestionnaire(base.db, {
      id: q.id, projet_id: projetId, public_vise: 'Directeurs', mode: 'entretien', contenu: entretien,
      introduction: 'Bonjour', duree_estimee_min: 20, tours_max: 8,
    })
    expect(maj).toMatchObject({ id: q.id, code: q.code, mode: 'entretien', introduction: 'Bonjour', duree_estimee_min: 20, tours_max: 8 })
  })

  it('refuse un projet inconnu, un public vide, un contenu invalide et des plafonds hors bornes', async () => {
    const saisie = { projet_id: projetId, public_vise: 'X', mode: 'hybride' as const, contenu: hybride }
    await expect(enregistrerQuestionnaire(base.db, { ...saisie, projet_id: 'inconnu' })).rejects.toMatchObject({ statut: 404 })
    await expect(enregistrerQuestionnaire(base.db, { ...saisie, public_vise: ' ' })).rejects.toThrow('public visé')
    await expect(enregistrerQuestionnaire(base.db, { ...saisie, contenu: {} })).rejects.toThrow('au moins une question')
    await expect(enregistrerQuestionnaire(base.db, { ...saisie, relances_max_par_question: 4 })).rejects.toThrow('entre 0 et 3')
    await expect(enregistrerQuestionnaire(base.db, { ...saisie, tours_max: 0 })).rejects.toThrow('entre 1 et 30')
    await expect(enregistrerQuestionnaire(base.db, { ...saisie, duree_estimee_min: 0 })).rejects.toThrow('entre 1 et 120')
    await expect(lireQuestionnaire(base.db, 'inconnu')).rejects.toMatchObject({ statut: 404 })
  })

  it('publie : statut ouvert, URL dédiée, projet en cours', async () => {
    const q = await enregistrerQuestionnaire(base.db, {
      projet_id: projetId, public_vise: 'À publier', mode: 'hybride', contenu: hybride,
    })
    const publie = await publierQuestionnaire(base.db, q.id, 'https://interviews.exemple.fr')
    expect(publie.questionnaire.statut).toBe('ouvert')
    expect(publie.url).toBe(`https://interviews.exemple.fr/q/${q.code}`)
    expect((await lireProjet(base.db, projetId)).statut).toBe('en_cours')

    // Republier ne change rien et redonne la même URL.
    expect((await publierQuestionnaire(base.db, q.id, 'https://interviews.exemple.fr')).url).toBe(publie.url)

    // Un questionnaire publié n'est plus remplaçable.
    await expect(enregistrerQuestionnaire(base.db, {
      id: q.id, projet_id: projetId, public_vise: 'À publier', mode: 'hybride', contenu: hybride,
    })).rejects.toMatchObject({ statut: 409 })
  })

  it('refuse de publier un questionnaire clos', async () => {
    const q = await enregistrerQuestionnaire(base.db, {
      projet_id: projetId, public_vise: 'Clos', mode: 'hybride', contenu: hybride,
    })
    await base.db.prepare("UPDATE questionnaires SET statut = 'clos' WHERE id = ?").bind(q.id).run()
    await expect(publierQuestionnaire(base.db, q.id, 'https://x.fr')).rejects.toMatchObject({ statut: 409 })
  })

  it("refuse de rattacher un brouillon existant à un autre projet", async () => {
    const autre = (await creerProjet(base.db, { titre: 'Autre', type_demande: 'amelioration' })).id
    const q = await enregistrerQuestionnaire(base.db, {
      projet_id: projetId, public_vise: 'Fixe', mode: 'hybride', contenu: hybride,
    })
    await expect(enregistrerQuestionnaire(base.db, {
      id: q.id, projet_id: autre, public_vise: 'Fixe', mode: 'hybride', contenu: hybride,
    })).rejects.toThrow('appartient à un autre projet')
  })
})
