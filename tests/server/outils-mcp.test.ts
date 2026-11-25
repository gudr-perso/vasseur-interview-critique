import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { OUTILS, appelerOutil, type Contexte } from '../../server/mcp/outils'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
let ctx: Contexte

beforeAll(async () => {
  base = await creerBaseDeTest()
  ctx = { db: base.db, origine: 'https://interviews.exemple.fr' }
})
afterAll(async () => { await base.fermer() })

async function appeler<T = Record<string, unknown>>(nom: string, args: unknown = {}): Promise<T> {
  const resultat = await appelerOutil(ctx, nom, args)
  if (resultat.isError) throw new Error(resultat.content[0].text)
  return JSON.parse(resultat.content[0].text) as T
}

describe('catalogue des outils', () => {
  it('expose les douze outils du lot, sans outil de suppression', () => {
    expect(OUTILS.map(o => o.nom).sort()).toEqual([
      'ajouter_document', 'creer_projet', 'enregistrer_logiciel', 'enregistrer_questionnaire',
      'lire_guide', 'lire_logiciel', 'lire_projet', 'lire_questionnaire',
      'lister_logiciels', 'lister_projets', 'modifier_projet', 'publier_questionnaire',
    ])
    for (const outil of OUTILS) expect(outil.description.length, outil.nom).toBeGreaterThan(40)
  })

  it('marque en lecture seule les outils qui ne modifient rien', () => {
    const lecture = OUTILS.filter(o => o.lectureSeule).map(o => o.nom).sort()
    expect(lecture).toEqual(['lire_guide', 'lire_logiciel', 'lire_projet', 'lire_questionnaire', 'lister_logiciels', 'lister_projets'])
  })
})

describe('parcours complet par les outils', () => {
  it('cadre un projet, écrit un questionnaire et le publie', async () => {
    const logiciel = await appeler<{ id: string }>('enregistrer_logiciel', { nom: 'myCuma Infinity', contexte: 'Gestion des CUMA' })
    expect((await appeler<unknown[]>('lister_logiciels')).length).toBe(1)

    const projet = await appeler<{ id: string; statut: string }>('creer_projet', {
      titre: 'Saisie des temps', type_demande: 'amelioration', logiciel_ids: [logiciel.id],
    })
    expect(projet.statut).toBe('brouillon')

    await appeler('ajouter_document', { projet_id: projet.id, nom: 'doc.md', contenu: '# Doc' })
    const guide = await appelerOutil(ctx, 'lire_guide', { etape: 'cadrage' })
    expect(guide.content[0].text).toContain('# Guide de cadrage')

    const cadre = await appeler<{ statut: string }>('modifier_projet', { projet_id: projet.id, note_cadrage: '# Objectif\n…' })
    expect(cadre.statut).toBe('cadre')

    const questionnaire = await appeler<{ id: string; statut: string }>('enregistrer_questionnaire', {
      projet_id: projet.id, public_vise: 'Comptables', mode: 'hybride',
      contenu: { questions: [{ type: 'texte', libelle: 'Que faites-vous ?', objectif: 'Quotidien' }] },
    })
    expect(questionnaire.statut).toBe('brouillon')
    expect((await appeler<{ id: string }>('lire_questionnaire', { questionnaire_id: questionnaire.id })).id).toBe(questionnaire.id)

    const publie = await appeler<{ url: string; statut: string }>('publier_questionnaire', { questionnaire_id: questionnaire.id })
    expect(publie.statut).toBe('ouvert')
    expect(publie.url).toMatch(/^https:\/\/interviews\.exemple\.fr\/q\/[A-HJ-NP-Z2-9]{10}$/)

    const relu = await appeler<{ statut: string; documents: unknown[]; questionnaires: unknown[] }>('lire_projet', { projet_id: projet.id })
    expect(relu).toMatchObject({ statut: 'en_cours' })
    expect(relu.documents).toHaveLength(1)
    expect(relu.questionnaires).toHaveLength(1)

    expect(await appeler<unknown[]>('lister_projets', { statut: 'en_cours' })).toHaveLength(1)
    expect(await appeler<unknown[]>('lister_projets', { statut: 'clos' })).toHaveLength(0)
  })
})

describe('erreurs', () => {
  it('renvoie une erreur lisible pour une règle métier', async () => {
    const resultat = await appelerOutil(ctx, 'lire_projet', { projet_id: 'inconnu' })
    expect(resultat).toEqual({ content: [{ type: 'text', text: 'Projet introuvable : inconnu' }], isError: true })
  })

  it('refuse des arguments invalides en nommant le champ', async () => {
    const resultat = await appelerOutil(ctx, 'creer_projet', { titre: 'X', type_demande: 'autre' })
    expect(resultat.isError).toBe(true)
    expect(resultat.content[0].text).toContain('type_demande')
  })

  it('refuse un outil inconnu', async () => {
    const resultat = await appelerOutil(ctx, 'supprimer_projet', {})
    expect(resultat).toEqual({ content: [{ type: 'text', text: 'Outil inconnu : supprimer_projet' }], isError: true })
  })
})
