import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as documentsId from '../../functions/api/admin/documents/[id]'
import * as logiciels from '../../functions/api/admin/logiciels/index'
import * as logicielsId from '../../functions/api/admin/logiciels/[id]'
import * as projets from '../../functions/api/admin/projets/index'
import * as projetId from '../../functions/api/admin/projets/[id]/index'
import * as projetDocuments from '../../functions/api/admin/projets/[id]/documents'
import * as projetQuestionnaires from '../../functions/api/admin/projets/[id]/questionnaires'
import * as questionnaireId from '../../functions/api/admin/questionnaires/[id]/index'
import * as clore from '../../functions/api/admin/questionnaires/[id]/clore'
import * as publier from '../../functions/api/admin/questionnaires/[id]/publier'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
beforeAll(async () => { base = await creerBaseDeTest() })
afterAll(async () => { await base.fermer() })

type Handler = (contexte: never) => Promise<Response> | Response

async function appeler(
  handler: Handler | undefined, methode: string, chemin: string, corps?: unknown, id?: string,
): Promise<{ statut: number; donnees: any }> {
  if (!handler) throw new Error(`Aucun handler ${methode} pour ${chemin}`)
  const request = new Request(`https://exemple.test${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const reponse = await handler({ request, env: { DB: base.db }, params: id ? { id } : {} } as never)
  const texte = await reponse.text()
  return { statut: reponse.status, donnees: texte ? JSON.parse(texte) : null }
}

const contenu = { questions: [{ type: 'texte', libelle: 'Que faites-vous ?', objectif: 'Quotidien' }] }

describe('logiciels', () => {
  it('crée, refuse un doublon, lit, met à jour et liste', async () => {
    const cree = await appeler(logiciels.onRequestPost, 'POST', '/api/admin/logiciels', { nom: 'Zeendoc', contexte: 'GED' })
    expect(cree.statut).toBe(201)
    const id = cree.donnees.id

    const doublon = await appeler(logiciels.onRequestPost, 'POST', '/api/admin/logiciels', { nom: 'zeendoc' })
    expect(doublon.statut).toBe(409)

    const maj = await appeler(logicielsId.onRequestPut, 'PUT', `/api/admin/logiciels/${id}`, { nom: 'Zeendoc', contexte: 'GED en ligne' }, id)
    expect(maj.donnees.contexte).toBe('GED en ligne')
    expect((await appeler(logicielsId.onRequestGet, 'GET', `/api/admin/logiciels/${id}`, undefined, id)).donnees.nom).toBe('Zeendoc')
    expect((await appeler(logiciels.onRequestGet, 'GET', '/api/admin/logiciels')).donnees).toHaveLength(1)

    const inconnu = await appeler(logicielsId.onRequestGet, 'GET', '/api/admin/logiciels/x', undefined, 'x')
    expect(inconnu).toEqual({ statut: 404, donnees: { error: { message: 'Logiciel introuvable : x' } } })
  })

  it('refuse un corps invalide', async () => {
    const reponse = await appeler(logiciels.onRequestPost, 'POST', '/api/admin/logiciels', { nom: '' })
    expect(reponse.statut).toBe(400)
    expect(reponse.donnees.error.message).toContain('nom')
  })
})

describe('projets, documents et questionnaires', () => {
  let projet: string
  let questionnaire: string

  it('crée un projet et le retrouve par filtre', async () => {
    const cree = await appeler(projets.onRequestPost, 'POST', '/api/admin/projets', { titre: 'Saisie des temps', type_demande: 'amelioration' })
    expect(cree.statut).toBe(201)
    projet = cree.donnees.id

    expect((await appeler(projets.onRequestGet, 'GET', '/api/admin/projets?statut=brouillon')).donnees).toHaveLength(1)
    expect((await appeler(projets.onRequestGet, 'GET', '/api/admin/projets?statut=clos')).donnees).toHaveLength(0)
    expect((await appeler(projets.onRequestGet, 'GET', '/api/admin/projets?statut=nimporte')).statut).toBe(400)
  })

  it('modifie le projet, y compris ses modèles, et expose le nombre d\'entretiens', async () => {
    const maj = await appeler(projetId.onRequestPut, 'PUT', `/api/admin/projets/${projet}`, {
      note_cadrage: '# Objectif', modeles: { interview: 'claude-haiku-5-5' },
    }, projet)
    expect(maj.donnees).toMatchObject({ statut: 'cadre', modele_interview: 'claude-haiku-5-5' })

    const lu = await appeler(projetId.onRequestGet, 'GET', `/api/admin/projets/${projet}`, undefined, projet)
    expect(lu.donnees.nb_entretiens).toBe(0)
  })

  it('ajoute puis supprime un document', async () => {
    const doc = await appeler(projetDocuments.onRequestPost, 'POST', `/api/admin/projets/${projet}/documents`, { nom: 'a.md', contenu: '# A' }, projet)
    expect(doc.statut).toBe(201)
    const supprime = await appeler(documentsId.onRequestDelete, 'DELETE', `/api/admin/documents/${doc.donnees.id}`, undefined, doc.donnees.id)
    expect(supprime).toEqual({ statut: 204, donnees: null })
  })

  it('crée, remplace, publie et clôt un questionnaire', async () => {
    const cree = await appeler(projetQuestionnaires.onRequestPost, 'POST', `/api/admin/projets/${projet}/questionnaires`, {
      public_vise: 'Comptables', mode: 'hybride', contenu,
    }, projet)
    expect(cree.statut).toBe(201)
    questionnaire = cree.donnees.id

    const remplace = await appeler(questionnaireId.onRequestPut, 'PUT', `/api/admin/questionnaires/${questionnaire}`, {
      public_vise: 'Comptables de CUMA', mode: 'hybride', contenu, introduction: 'Bonjour',
    }, questionnaire)
    expect(remplace.donnees).toMatchObject({ public_vise: 'Comptables de CUMA', introduction: 'Bonjour', projet_id: projet })

    const invalide = await appeler(questionnaireId.onRequestPut, 'PUT', `/api/admin/questionnaires/${questionnaire}`, {
      public_vise: 'X', mode: 'hybride', contenu: { questions: [] },
    }, questionnaire)
    expect(invalide.statut).toBe(400)

    expect((await appeler(publier.onRequestPost, 'POST', `/api/admin/questionnaires/${questionnaire}/publier`, undefined, questionnaire)).donnees.statut).toBe('ouvert')
    expect((await appeler(questionnaireId.onRequestDelete, 'DELETE', `/api/admin/questionnaires/${questionnaire}`, undefined, questionnaire)).statut).toBe(409)
    expect((await appeler(clore.onRequestPost, 'POST', `/api/admin/questionnaires/${questionnaire}/clore`, undefined, questionnaire)).donnees.statut).toBe('clos')
  })

  it('supprime un brouillon de questionnaire puis le projet', async () => {
    const brouillon = await appeler(projetQuestionnaires.onRequestPost, 'POST', `/api/admin/projets/${projet}/questionnaires`, {
      public_vise: 'Terrain', mode: 'hybride', contenu,
    }, projet)
    expect((await appeler(questionnaireId.onRequestDelete, 'DELETE', `/api/admin/questionnaires/${brouillon.donnees.id}`, undefined, brouillon.donnees.id)).statut).toBe(204)

    expect((await appeler(projetId.onRequestDelete, 'DELETE', `/api/admin/projets/${projet}`, undefined, projet)).statut).toBe(204)
    expect((await appeler(projetId.onRequestGet, 'GET', `/api/admin/projets/${projet}`, undefined, projet)).statut).toBe(404)
    expect((await appeler(questionnaireId.onRequestGet, 'GET', `/api/admin/questionnaires/${questionnaire}`, undefined, questionnaire)).statut).toBe(404)
  })
})
