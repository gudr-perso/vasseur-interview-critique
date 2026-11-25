import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ajouterDocument, compterEntretiens, creerProjet, lireProjet, modifierProjet, supprimerDocument, supprimerProjet,
} from '../../server/services/projets'
import {
  cloreQuestionnaire, enregistrerQuestionnaire, lireQuestionnaire, publierQuestionnaire, supprimerQuestionnaire,
} from '../../server/services/questionnaires'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
beforeAll(async () => { base = await creerBaseDeTest() })
afterAll(async () => { await base.fermer() })

const contenu = { questions: [{ type: 'texte', libelle: 'Que faites-vous ?', objectif: 'Quotidien' }] }

async function projet(titre: string): Promise<string> {
  return (await creerProjet(base.db, { titre, type_demande: 'amelioration' })).id
}

async function questionnaire(projetId: string, publicVise = 'Comptables') {
  return enregistrerQuestionnaire(base.db, { projet_id: projetId, public_vise: publicVise, mode: 'hybride', contenu })
}

async function repondant(questionnaireId: string, id: string, statut: 'invite' | 'commence' | 'termine') {
  await base.db.prepare(
    "INSERT INTO repondants (id, questionnaire_id, jeton, origine, statut) VALUES (?, ?, ?, 'invitation', ?)",
  ).bind(id, questionnaireId, `jeton-${id}`, statut).run()
}

describe('modèles du projet', () => {
  it('modifie un modèle sans toucher aux autres', async () => {
    const id = await projet('Modèles')
    const avant = await lireProjet(base.db, id)
    const apres = await modifierProjet(base.db, id, { modeles: { interview: 'claude-haiku-5-5' } })
    expect(apres.modele_interview).toBe('claude-haiku-5-5')
    expect(apres.modele_cadrage).toBe(avant.modele_cadrage)
    expect(apres.modele_analyse).toBe(avant.modele_analyse)
  })

  it('refuse un identifiant de modèle vide', async () => {
    const id = await projet('Modèle vide')
    await expect(modifierProjet(base.db, id, { modeles: { analyse: ' ' } })).rejects.toMatchObject({ statut: 400 })
  })
})

describe('documents', () => {
  it('supprime un document et refuse un identifiant inconnu', async () => {
    const id = await projet('Docs')
    const doc = await ajouterDocument(base.db, id, { nom: 'a.md', contenu: 'texte' })
    await supprimerDocument(base.db, doc.id)
    expect((await lireProjet(base.db, id)).documents).toEqual([])
    await expect(supprimerDocument(base.db, doc.id)).rejects.toMatchObject({ statut: 404 })
  })
})

describe('suppression de projet', () => {
  it("compte les entretiens commencés ou terminés, pas les simples invitations", async () => {
    const id = await projet('À compter')
    const q = await questionnaire(id)
    await repondant(q.id, 'r1', 'invite')
    await repondant(q.id, 'r2', 'commence')
    await repondant(q.id, 'r3', 'termine')
    expect(await compterEntretiens(base.db, id)).toBe(2)
    expect(await compterEntretiens(base.db, await projet('Vide'))).toBe(0)
  })

  it('supprime le projet et tout ce qui en dépend', async () => {
    const id = await projet('À supprimer')
    const q = await questionnaire(id)
    await repondant(q.id, 'r4', 'commence')
    await ajouterDocument(base.db, id, { nom: 'a', contenu: 'b' })
    await supprimerProjet(base.db, id)
    await expect(lireProjet(base.db, id)).rejects.toMatchObject({ statut: 404 })
    await expect(lireQuestionnaire(base.db, q.id)).rejects.toMatchObject({ statut: 404 })
    const reste = await base.db.prepare("SELECT COUNT(*) AS n FROM repondants WHERE id = 'r4'").first<{ n: number }>()
    expect(reste!.n).toBe(0)
    await expect(supprimerProjet(base.db, id)).rejects.toMatchObject({ statut: 404 })
  })
})

describe('clôture et suppression de questionnaire', () => {
  it('clôt un questionnaire ouvert, et lui seul', async () => {
    const id = await projet('Clôture')
    const q = await questionnaire(id)
    await expect(cloreQuestionnaire(base.db, q.id)).rejects.toMatchObject({ statut: 409 })
    await publierQuestionnaire(base.db, q.id, 'https://x.fr')
    expect((await cloreQuestionnaire(base.db, q.id)).statut).toBe('clos')
    await expect(cloreQuestionnaire(base.db, q.id)).rejects.toMatchObject({ statut: 409 })
    await expect(cloreQuestionnaire(base.db, 'inconnu')).rejects.toMatchObject({ statut: 404 })
  })

  it('supprime un brouillon, refuse un questionnaire publié', async () => {
    const id = await projet('Suppression')
    const brouillon = await questionnaire(id, 'Brouillon')
    await supprimerQuestionnaire(base.db, brouillon.id)
    await expect(lireQuestionnaire(base.db, brouillon.id)).rejects.toMatchObject({ statut: 404 })

    const publie = await questionnaire(id, 'Publié')
    await publierQuestionnaire(base.db, publie.id, 'https://x.fr')
    await expect(supprimerQuestionnaire(base.db, publie.id)).rejects.toMatchObject({ statut: 409 })
    expect((await lireQuestionnaire(base.db, publie.id)).statut).toBe('ouvert')
  })
})
