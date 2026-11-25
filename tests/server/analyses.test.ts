import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LIMITES_ANALYSE } from '../../shared/analyses'
import {
  enregistrerAnalyse, lireAnalyse, listerAnalyses, supprimerAnalyse, type SaisieAnalyse,
} from '../../server/services/analyses'
import { creerProjet } from '../../server/services/projets'
import { enregistrerQuestionnaire, publierQuestionnaire } from '../../server/services/questionnaires'
import { creerRepondantGenerique, lireRepondantParJeton } from '../../server/services/repondants'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
let projetId: string
let autreProjetId: string
let questionnaire: { id: string; code: string }
let questionnaireAutre: { id: string }
let repondantId: string
let repondantAutreId: string
let autreQuestionnaireDuProjet: { id: string }

const contenu = { questions: [{ id: 'q1', type: 'texte', libelle: 'Comment ?', objectif: 'o' }] }

beforeAll(async () => {
  base = await creerBaseDeTest()
  projetId = (await creerProjet(base.db, { titre: 'P', type_demande: 'amelioration' })).id
  autreProjetId = (await creerProjet(base.db, { titre: 'Autre', type_demande: 'amelioration' })).id
  questionnaire = await enregistrerQuestionnaire(base.db, { projet_id: projetId, public_vise: 'Comptables', mode: 'hybride', contenu })
  autreQuestionnaireDuProjet = await enregistrerQuestionnaire(base.db, { projet_id: projetId, public_vise: 'Gérants', mode: 'hybride', contenu })
  questionnaireAutre = await enregistrerQuestionnaire(base.db, { projet_id: autreProjetId, public_vise: 'Autres', mode: 'hybride', contenu })
  await publierQuestionnaire(base.db, questionnaire.id, 'https://x.fr')
  await publierQuestionnaire(base.db, questionnaireAutre.id, 'https://x.fr')
  const identite = { nom: 'Durand', prenom: 'Léa', poste: '', entreprise: 'CUMA du Val', mail: '' }
  const qAutreCode = (await base.db.prepare('SELECT code FROM questionnaires WHERE id = ?').bind(questionnaireAutre.id).first<{ code: string }>())!.code
  const ligne = await base.db.prepare('SELECT code FROM questionnaires WHERE id = ?').bind(questionnaire.id).first<{ code: string }>()
  const a = await creerRepondantGenerique(base.db, ligne!.code, identite)
  repondantId = (await lireRepondantParJeton(base.db, a.jeton)).repondant.id
  const b = await creerRepondantGenerique(base.db, qAutreCode, { ...identite, nom: 'Martin', prenom: 'Paul' })
  repondantAutreId = (await lireRepondantParJeton(base.db, b.jeton)).repondant.id
})
afterAll(async () => { await base.fermer() })

const synthese = (surcharge: Partial<SaisieAnalyse> = {}): SaisieAnalyse => ({
  projet_id: projetId, type: 'synthese', contenu: '# Synthèse', source: 'mcp', nb_entretiens: 2, ...surcharge,
})

describe('enregistrerAnalyse', () => {
  it('enregistre une synthèse de projet et la relit à l\'identique', async () => {
    const analyse = await enregistrerAnalyse(base.db, synthese({ source: ' claude-sonnet-5-5 ' }))
    expect(analyse).toMatchObject({
      projet_id: projetId, questionnaire_id: null, repondant_id: null, type: 'synthese',
      contenu: '# Synthèse', source: 'claude-sonnet-5-5', nb_entretiens: 2,
    })
    expect(analyse.id).toBeTruthy()
    expect(analyse.cree_le).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(await lireAnalyse(base.db, analyse.id)).toEqual(analyse)
  })

  it('exige un répondant pour une fiche, et l\'interdit pour les autres types', async () => {
    await expect(enregistrerAnalyse(base.db, synthese({ type: 'fiche_repondant' }))).rejects.toMatchObject({ statut: 400 })
    await expect(enregistrerAnalyse(base.db, synthese({ repondant_id: repondantId }))).rejects.toMatchObject({ statut: 400 })
    await expect(enregistrerAnalyse(base.db, synthese({ type: 'expression_besoin', repondant_id: repondantId }))).rejects.toMatchObject({ statut: 400 })
    const fiche = await enregistrerAnalyse(base.db, synthese({ type: 'fiche_repondant', repondant_id: repondantId, nb_entretiens: 1 }))
    expect(fiche.repondant_id).toBe(repondantId)
  })

  it('refuse un questionnaire ou un répondant d\'un autre projet, ou inconnu (404)', async () => {
    await expect(enregistrerAnalyse(base.db, synthese({ questionnaire_id: questionnaireAutre.id }))).rejects.toMatchObject({ statut: 404 })
    await expect(enregistrerAnalyse(base.db, synthese({ questionnaire_id: 'inconnu' }))).rejects.toMatchObject({ statut: 404 })
    await expect(enregistrerAnalyse(base.db, synthese({ type: 'fiche_repondant', repondant_id: repondantAutreId }))).rejects.toMatchObject({ statut: 404 })
    await expect(enregistrerAnalyse(base.db, synthese({ projet_id: 'inconnu' }))).rejects.toMatchObject({ statut: 404 })
    // Un répondant qui n'est pas celui du questionnaire indiqué.
    await expect(enregistrerAnalyse(base.db, synthese({
      type: 'fiche_repondant', repondant_id: repondantId, questionnaire_id: autreQuestionnaireDuProjet.id,
    }))).rejects.toMatchObject({ statut: 404 })
  })

  it('refuse un contenu vide ou invisible, trop long, ou une source absente ou trop longue', async () => {
    await expect(enregistrerAnalyse(base.db, synthese({ contenu: ' \n​\t ' }))).rejects.toMatchObject({ statut: 400 })
    await expect(enregistrerAnalyse(base.db, synthese({ contenu: '' }))).rejects.toMatchObject({ statut: 400 })
    await expect(enregistrerAnalyse(base.db, synthese({ contenu: 'x'.repeat(LIMITES_ANALYSE.contenu + 1) })))
      .rejects.toThrow('200000 caractères au plus')
    await expect(enregistrerAnalyse(base.db, synthese({ contenu: 'x'.repeat(LIMITES_ANALYSE.contenu) }))).resolves.toBeTruthy()
    await expect(enregistrerAnalyse(base.db, synthese({ source: '  ' }))).rejects.toMatchObject({ statut: 400 })
    await expect(enregistrerAnalyse(base.db, synthese({ source: 's'.repeat(101) }))).rejects.toThrow('100 caractères au plus')
    await expect(enregistrerAnalyse(base.db, synthese({ source: 's'.repeat(100) }))).resolves.toBeTruthy()
  })

  it('refuse un type inconnu et un nombre d\'entretiens invalide', async () => {
    await expect(enregistrerAnalyse(base.db, synthese({ type: 'rapport' as never }))).rejects.toMatchObject({ statut: 400 })
    await expect(enregistrerAnalyse(base.db, synthese({ nb_entretiens: -1 }))).rejects.toMatchObject({ statut: 400 })
    await expect(enregistrerAnalyse(base.db, synthese({ nb_entretiens: 1.5 }))).rejects.toMatchObject({ statut: 400 })
  })
})

describe('listerAnalyses', () => {
  let projetListe: string
  const ids: Record<string, string> = {}

  beforeAll(async () => {
    projetListe = (await creerProjet(base.db, { titre: 'Liste', type_demande: 'amelioration' })).id
    const q = await enregistrerQuestionnaire(base.db, { projet_id: projetListe, public_vise: 'Gérants', mode: 'hybride', contenu })
    await publierQuestionnaire(base.db, q.id, 'https://x.fr')
    const { code } = (await base.db.prepare('SELECT code FROM questionnaires WHERE id = ?').bind(q.id).first<{ code: string }>())!
    const { jeton } = await creerRepondantGenerique(base.db, code, { nom: 'Martin', prenom: 'Paul', poste: '', entreprise: 'CUMA', mail: '' })
    const repondant = (await lireRepondantParJeton(base.db, jeton)).repondant.id

    const creer = async (cle: string, saisie: Partial<SaisieAnalyse>, date: string) => {
      const a = await enregistrerAnalyse(base.db, { projet_id: projetListe, type: 'synthese', contenu: 'ééé', source: 'mcp', nb_entretiens: 1, ...saisie })
      await base.db.prepare('UPDATE analyses SET cree_le = ? WHERE id = ?').bind(date, a.id).run()
      ids[cle] = a.id
    }
    await creer('ancienne', { type: 'expression_besoin' }, '2026-11-01T10:00:00.000Z')
    await creer('questionnaire', { questionnaire_id: q.id }, '2026-11-02T10:00:00.000Z')
    await creer('fiche', { type: 'fiche_repondant', repondant_id: repondant }, '2026-11-03T10:00:00.000Z')
    ids.questionnaireId = q.id
    ids.repondantId = repondant
  })

  it('classe les plus récentes d\'abord, avec portée lisible, taille en caractères et sans contenu', async () => {
    const liste = await listerAnalyses(base.db, { projet_id: projetListe })
    expect(liste.map(a => a.id)).toEqual([ids.fiche, ids.questionnaire, ids.ancienne])
    expect(liste.map(a => a.portee)).toEqual(['Répondant : Paul Martin', 'Questionnaire : Gérants', 'Projet entier'])
    expect(liste.every(a => a.taille === 3)).toBe(true)
    expect(liste[0]).not.toHaveProperty('contenu')
    expect(liste[0]).toMatchObject({ type: 'fiche_repondant', source: 'mcp', nb_entretiens: 1, repondant_id: ids.repondantId })
  })

  it('filtre par questionnaire, répondant et type', async () => {
    const ids_ = async (filtre: object) =>
      (await listerAnalyses(base.db, { projet_id: projetListe, ...filtre })).map(a => a.id)
    expect(await ids_({ questionnaire_id: ids.questionnaireId })).toEqual([ids.questionnaire])
    expect(await ids_({ repondant_id: ids.repondantId })).toEqual([ids.fiche])
    expect(await ids_({ type: 'expression_besoin' })).toEqual([ids.ancienne])
    expect(await ids_({ type: 'synthese', repondant_id: ids.repondantId })).toEqual([])
  })

  it('ne montre que les analyses du projet demandé, et 404 pour un projet inconnu', async () => {
    const autres = await listerAnalyses(base.db, { projet_id: autreProjetId })
    expect(autres).toEqual([])
    await expect(listerAnalyses(base.db, { projet_id: 'inconnu' })).rejects.toMatchObject({ statut: 404 })
  })
})

describe('lireAnalyse et supprimerAnalyse', () => {
  it('lit, supprime, puis signale 404', async () => {
    const analyse = await enregistrerAnalyse(base.db, synthese({ contenu: 'à supprimer' }))
    await supprimerAnalyse(base.db, analyse.id)
    await expect(lireAnalyse(base.db, analyse.id)).rejects.toMatchObject({ statut: 404 })
    await expect(supprimerAnalyse(base.db, analyse.id)).rejects.toMatchObject({ statut: 404 })
    await expect(lireAnalyse(base.db, 'inconnue')).rejects.toMatchObject({ statut: 404 })
  })
})
