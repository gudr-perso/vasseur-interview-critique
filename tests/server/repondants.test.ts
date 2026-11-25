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

  it('plafonne les répondants du lien générique', async () => {
    const q = await questionnaire()
    const lignes = Array.from({ length: 300 }, (_, i) =>
      base.db.prepare("INSERT INTO repondants (id, questionnaire_id, jeton, origine) VALUES (?, ?, ?, 'lien_generique')")
        .bind(`g${i}`, q.id, `jeton-g${i}`))
    await base.db.batch(lignes)
    await expect(creerRepondantGenerique(base.db, q.code, identite)).rejects.toMatchObject({
      statut: 409, message: 'Ce questionnaire a atteint son nombre maximal de participants.',
    })
    // Les invitations ne comptent pas dans ce plafond.
    await expect(creerInvitation(base.db, q.id, identite)).resolves.toMatchObject({ statut: 'invite' })
  })
})
