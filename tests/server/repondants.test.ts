import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { creerProjet } from '../../server/services/projets'
import { cloreQuestionnaire, enregistrerQuestionnaire, publierQuestionnaire } from '../../server/services/questionnaires'
import {
  creerInvitation, creerRepondantGenerique, lireEntretien, lireRepondantParJeton, listerRepondants,
  modifierIdentite, supprimerRepondant, validerIdentite,
} from '../../server/services/repondants'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
let projetId: string
const contenu = { questions: [{ type: 'texte', libelle: 'Comment ?', objectif: 'o' }] }
const identite = { nom: 'Durand', prenom: 'Léa', poste: 'Comptable', entreprise: 'CUMA du Val', mail: 'lea@exemple.fr' }

beforeAll(async () => {
  base = await creerBaseDeTest()
  projetId = (await creerProjet(base.db, { titre: 'P', type_demande: 'amelioration' })).id
})
afterAll(async () => { await base.fermer() })

async function questionnaire(publier = true) {
  const q = await enregistrerQuestionnaire(base.db, { projet_id: projetId, public_vise: 'Comptables', mode: 'hybride', contenu })
  if (publier) await publierQuestionnaire(base.db, q.id, 'https://x.fr')
  return q
}

describe('validerIdentite', () => {
  it('nettoie et accepte une identité sans poste ni mail', () => {
    expect(validerIdentite({ nom: ' Durand ', prenom: 'Léa', entreprise: 'CUMA', poste: '', mail: '' }))
      .toEqual({ nom: 'Durand', prenom: 'Léa', entreprise: 'CUMA', poste: '', mail: '' })
  })

  it('exige nom, prénom et entreprise, et un mail bien formé s\'il est donné', () => {
    expect(() => validerIdentite({ ...identite, nom: ' ' })).toThrow('Le nom est obligatoire.')
    expect(() => validerIdentite({ ...identite, prenom: '' })).toThrow('Le prénom est obligatoire.')
    expect(() => validerIdentite({ ...identite, entreprise: '' })).toThrow("L'entreprise est obligatoire.")
    expect(() => validerIdentite({ ...identite, mail: 'lea' })).toThrow('Adresse mail invalide.')
    expect(() => validerIdentite({ ...identite, nom: 'x'.repeat(101) })).toThrow('100 caractères au plus')
  })
})

describe('lien générique', () => {
  it('crée un répondant commencé sur un questionnaire ouvert', async () => {
    const q = await questionnaire()
    const { jeton } = await creerRepondantGenerique(base.db, q.code, identite)
    const { repondant } = await lireRepondantParJeton(base.db, jeton)
    expect(repondant).toMatchObject({ ...identite, origine: 'lien_generique', statut: 'commence' })
    expect(repondant.commence_le).toBeTruthy()
  })

  it('traite un brouillon comme un code inconnu, et signale un questionnaire clos', async () => {
    const brouillon = await questionnaire(false)
    await expect(creerRepondantGenerique(base.db, brouillon.code, identite)).rejects.toMatchObject({ statut: 404, message: 'Lien invalide.' })
    await expect(creerRepondantGenerique(base.db, 'INCONNU000', identite)).rejects.toMatchObject({ statut: 404, message: 'Lien invalide.' })
    const clos = await questionnaire()
    await cloreQuestionnaire(base.db, clos.id)
    await expect(creerRepondantGenerique(base.db, clos.code, identite)).rejects.toMatchObject({ statut: 410 })
  })
})

describe('invitations et suivi', () => {
  it('crée une invitation, la passe en commencé à la validation de l\'identité, et la liste', async () => {
    const q = await questionnaire()
    const invite = await creerInvitation(base.db, q.id, { ...identite, prenom: 'Marc' })
    expect(invite).toMatchObject({ origine: 'invitation', statut: 'invite', commence_le: null, nb_reponses: 0 })
    await modifierIdentite(base.db, invite.jeton, { ...identite, prenom: 'Marc', poste: 'Directeur' })
    const liste = await listerRepondants(base.db, q.id)
    expect(liste).toHaveLength(1)
    expect(liste[0]).toMatchObject({ prenom: 'Marc', poste: 'Directeur', statut: 'commence' })
  })

  it('refuse une invitation sur un brouillon', async () => {
    const q = await questionnaire(false)
    await expect(creerInvitation(base.db, q.id, identite)).rejects.toMatchObject({ statut: 409 })
  })

  it('lit un entretien avec ses réponses, puis supprime le répondant', async () => {
    const q = await questionnaire()
    const invite = await creerInvitation(base.db, q.id, identite)
    await base.db.prepare(
      `INSERT INTO tours (id, repondant_id, ordre, question_id, type, question, reponse, cree_le)
       VALUES ('t1', ?, 1, 'q1', 'question', 'Comment ?', '{"texte":"Sur papier"}', '2026-11-25T10:00:00Z')`,
    ).bind(invite.id).run()
    const entretien = await lireEntretien(base.db, invite.id)
    expect(entretien.tours).toEqual([
      { ordre: 1, type: 'question', question_id: 'q1', question: 'Comment ?', reponse: { texte: 'Sur papier' }, cree_le: '2026-11-25T10:00:00Z' },
    ])
    expect(entretien.repondant.nb_reponses).toBe(1)
    await supprimerRepondant(base.db, invite.id)
    await expect(lireEntretien(base.db, invite.id)).rejects.toMatchObject({ statut: 404 })
    const reste = await base.db.prepare("SELECT COUNT(*) AS n FROM tours WHERE id = 't1'").first<{ n: number }>()
    expect(reste!.n).toBe(0)
  })

  it('refuse de modifier l\'identité d\'un répondant qui a terminé, et un jeton inconnu', async () => {
    const q = await questionnaire()
    const invite = await creerInvitation(base.db, q.id, identite)
    await base.db.prepare("UPDATE repondants SET statut = 'termine' WHERE id = ?").bind(invite.id).run()
    await expect(modifierIdentite(base.db, invite.jeton, identite)).rejects.toMatchObject({ statut: 409 })
    await expect(lireRepondantParJeton(base.db, 'inconnu')).rejects.toMatchObject({ statut: 404 })
  })

  it("refuse qu'un invité commence ou modifie son identité sur un questionnaire clos", async () => {
    const q = await questionnaire()
    const invite = await creerInvitation(base.db, q.id, identite)
    await cloreQuestionnaire(base.db, q.id)
    await expect(modifierIdentite(base.db, invite.jeton, identite)).rejects.toMatchObject({ statut: 410 })
    const ligne = await base.db.prepare('SELECT statut, numero FROM repondants WHERE id = ?')
      .bind(invite.id).first<{ statut: string; numero: number | null }>()
    expect(ligne).toEqual({ statut: 'invite', numero: null })
    const inscrit = await base.db.prepare('SELECT COUNT(*) AS n FROM numeros_repondants WHERE repondant_id = ?')
      .bind(invite.id).first<{ n: number }>()
    expect(inscrit!.n).toBe(0)
  })

  it('plafonne les répondants du lien générique à 300, sans compter les invitations', async () => {
    const q = await questionnaire()
    // Une seule instruction pour 299 lignes : un lot de 300 instructions est instable sous charge.
    await base.db.prepare(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 299)
       INSERT INTO repondants (id, questionnaire_id, jeton, origine)
       SELECT ?1 || '-g' || i, ?1, ?1 || '-jeton-g' || i, 'lien_generique' FROM n`,
    ).bind(q.id).run()
    await creerInvitation(base.db, q.id, identite)
    const compte = (origine: string) => base.db.prepare(
      'SELECT COUNT(*) AS n FROM repondants WHERE questionnaire_id = ? AND origine = ?',
    ).bind(q.id, origine).first<{ n: number }>()
    expect(await compte('lien_generique')).toEqual({ n: 299 })
    expect(await compte('invitation')).toEqual({ n: 1 })

    // Le 300e générique passe : l'invitation ne compte pas dans le plafond.
    await expect(creerRepondantGenerique(base.db, q.code, identite)).resolves.toMatchObject({ jeton: expect.any(String) })
    await expect(creerRepondantGenerique(base.db, q.code, identite)).rejects.toMatchObject({
      statut: 409, message: 'Ce questionnaire a atteint son nombre maximal de participants.',
    })
    expect(await compte('lien_generique')).toEqual({ n: 300 })
  })
})

describe('numéro de pseudonyme', () => {
  const numero = async (id: string) =>
    (await base.db.prepare('SELECT numero FROM repondants WHERE id = ?').bind(id).first<{ numero: number | null }>())!.numero
  const idDuJeton = async (jeton: string) => (await lireRepondantParJeton(base.db, jeton)).repondant.id

  it('est attribué au démarrage, une fois, à la suite des numéros du projet', async () => {
    const projet = (await creerProjet(base.db, { titre: 'Numéros', type_demande: 'amelioration' })).id
    const q1 = await enregistrerQuestionnaire(base.db, { projet_id: projet, public_vise: 'A', mode: 'hybride', contenu })
    const q2 = await enregistrerQuestionnaire(base.db, { projet_id: projet, public_vise: 'B', mode: 'hybride', contenu })
    for (const q of [q1, q2]) await publierQuestionnaire(base.db, q.id, 'https://x.fr')

    const premier = await idDuJeton((await creerRepondantGenerique(base.db, q1.code, identite)).jeton)
    const invite = await creerInvitation(base.db, q2.id, identite)
    expect(await numero(invite.id)).toBeNull()
    const second = await idDuJeton((await creerRepondantGenerique(base.db, q2.code, identite)).jeton)
    await modifierIdentite(base.db, invite.jeton, identite)
    expect([await numero(premier), await numero(second), await numero(invite.id)]).toEqual([1, 2, 3])
    // Corriger son identité ne change pas le numéro.
    await modifierIdentite(base.db, invite.jeton, { ...identite, poste: 'Directeur' })
    expect(await numero(invite.id)).toBe(3)
  })

  it('ne réattribue jamais le numéro d\'un répondant supprimé, même le dernier', async () => {
    const projet = (await creerProjet(base.db, { titre: 'Suppression', type_demande: 'amelioration' })).id
    const q = await enregistrerQuestionnaire(base.db, { projet_id: projet, public_vise: 'A', mode: 'hybride', contenu })
    await publierQuestionnaire(base.db, q.id, 'https://x.fr')
    const ids: string[] = []
    for (let i = 0; i < 3; i++) ids.push(await idDuJeton((await creerRepondantGenerique(base.db, q.code, identite)).jeton))
    await supprimerRepondant(base.db, ids[0])
    expect([await numero(ids[1]), await numero(ids[2])]).toEqual([2, 3])
    await supprimerRepondant(base.db, ids[2])
    const nouveau = await idDuJeton((await creerRepondantGenerique(base.db, q.code, identite)).jeton)
    expect(await numero(nouveau)).toBe(4)
  })

  it('reste distinct pour des démarrages simultanés', async () => {
    const projet = (await creerProjet(base.db, { titre: 'Simultanés', type_demande: 'amelioration' })).id
    const q = await enregistrerQuestionnaire(base.db, { projet_id: projet, public_vise: 'A', mode: 'hybride', contenu })
    await publierQuestionnaire(base.db, q.id, 'https://x.fr')
    const invitations = await Promise.all(Array.from({ length: 4 }, () => creerInvitation(base.db, q.id, identite)))
    const demarrages = await Promise.all([
      ...invitations.map(i => modifierIdentite(base.db, i.jeton, identite).then(() => i.id)),
      ...Array.from({ length: 4 }, () => creerRepondantGenerique(base.db, q.code, identite).then(r => idDuJeton(r.jeton))),
    ])
    const numeros = await Promise.all(demarrages.map(numero))
    expect([...numeros].sort((a, b) => a! - b!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})
