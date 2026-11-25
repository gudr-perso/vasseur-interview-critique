import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
  it('expose les treize outils du lot, sans outil de suppression', () => {
    expect(OUTILS.map(o => o.nom).sort()).toEqual([
      'ajouter_document', 'creer_projet', 'enregistrer_logiciel', 'enregistrer_questionnaire',
      'lire_document', 'lire_guide', 'lire_logiciel', 'lire_projet', 'lire_questionnaire',
      'lister_logiciels', 'lister_projets', 'modifier_projet', 'publier_questionnaire',
    ])
    for (const outil of OUTILS) expect(outil.description.length, outil.nom).toBeGreaterThan(40)
  })

  it('marque en lecture seule les outils qui ne modifient rien', () => {
    const lecture = OUTILS.filter(o => o.lectureSeule).map(o => o.nom).sort()
    expect(lecture).toEqual(['lire_document', 'lire_guide', 'lire_logiciel', 'lire_projet', 'lire_questionnaire', 'lister_logiciels', 'lister_projets'])
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
    expect(relu.documents).toEqual([{ id: expect.any(String), nom: 'doc.md', taille: 5 }])
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

  it('explique en français un argument du mauvais type', async () => {
    const resultat = await appelerOutil(ctx, 'creer_projet', { titre: 5, type_demande: 'amelioration' })
    expect(resultat.isError).toBe(true)
    expect(resultat.content[0].text).toContain('titre : Entrée invalide : chaîne de caractères attendu, nombre reçu')
  })

  it('refuse un outil inconnu', async () => {
    const resultat = await appelerOutil(ctx, 'supprimer_projet', {})
    expect(resultat).toEqual({ content: [{ type: 'text', text: 'Outil inconnu : supprimer_projet' }], isError: true })
  })
})

describe('documents', () => {
  it('lire_projet ne renvoie ni le contenu des documents ni leur date, seulement id, nom et taille', async () => {
    const projet = await appeler<{ id: string }>('creer_projet', { titre: 'Gros documents', type_demande: 'amelioration' })
    const contenu = 'é'.repeat(50_000)
    const doc = await appeler<{ id: string }>('ajouter_document', { projet_id: projet.id, nom: 'gros.md', contenu })
    const brut = await appelerOutil(ctx, 'lire_projet', { projet_id: projet.id })
    expect(brut.content[0].text.length).toBeLessThan(5_000)
    expect(JSON.parse(brut.content[0].text).documents).toEqual([{ id: doc.id, nom: 'gros.md', taille: 50_000 }])
  })

  it('lire_document lit par morceaux et indique la suite', async () => {
    const projet = await appeler<{ id: string }>('creer_projet', { titre: 'Lecture par morceaux', type_demande: 'amelioration' })
    const contenu = Array.from({ length: 45_000 }, (_, i) => String.fromCharCode(97 + (i % 26))).join('')
    const doc = await appeler<{ id: string }>('ajouter_document', { projet_id: projet.id, nom: 'long.txt', contenu })

    const premier = await appeler<{ id: string; nom: string; taille: number; debut: number; texte: string; suite: number | null }>(
      'lire_document', { document_id: doc.id })
    expect(premier).toMatchObject({ id: doc.id, nom: 'long.txt', taille: 45_000, debut: 0, suite: 20_000 })
    expect(premier.texte).toBe(contenu.slice(0, 20_000))

    const second = await appeler<{ debut: number; texte: string; suite: number | null }>(
      'lire_document', { document_id: doc.id, debut: 20_000 })
    expect(second).toMatchObject({ debut: 20_000, suite: 40_000 })
    expect(second.texte).toBe(contenu.slice(20_000, 40_000))

    const dernier = await appeler<{ texte: string; suite: number | null }>(
      'lire_document', { document_id: doc.id, debut: 40_000, longueur: 10_000 })
    expect(dernier.texte).toBe(contenu.slice(40_000))
    expect(dernier.suite).toBeNull()

    const petit = await appeler<{ texte: string; suite: number | null }>(
      'lire_document', { document_id: doc.id, debut: 100, longueur: 50 })
    expect(petit).toMatchObject({ texte: contenu.slice(100, 150), suite: 150 })

    const apres = await appeler<{ texte: string; suite: number | null }>('lire_document', { document_id: doc.id, debut: 99_999 })
    expect(apres).toMatchObject({ texte: '', suite: null })
  })

  it('lire_document refuse une longueur trop grande, un début négatif et un document inconnu', async () => {
    const trop = await appelerOutil(ctx, 'lire_document', { document_id: 'x', longueur: 20_001 })
    expect(trop.isError).toBe(true)
    expect(trop.content[0].text).toContain('longueur')
    expect((await appelerOutil(ctx, 'lire_document', { document_id: 'x', debut: -1 })).isError).toBe(true)
    expect(await appelerOutil(ctx, 'lire_document', { document_id: 'inconnu' }))
      .toEqual({ content: [{ type: 'text', text: 'Document introuvable : inconnu' }], isError: true })
  })

  it('ne coupe pas un caractère hors plan de base en deux', async () => {
    const projet = await appeler<{ id: string }>('creer_projet', { titre: 'Emoji', type_demande: 'amelioration' })
    const doc = await appeler<{ id: string }>('ajouter_document', { projet_id: projet.id, nom: 'e.txt', contenu: 'a😀b😀c' })
    const lu = await appeler<{ taille: number; texte: string; suite: number | null }>(
      'lire_document', { document_id: doc.id, debut: 1, longueur: 2 })
    expect(lu).toMatchObject({ taille: 5, texte: '😀b', suite: 3 })
  })
})

describe('erreurs inattendues', () => {
  it('journalise et renvoie un message générique, sans fuite du message brut', async () => {
    const erreurJournal = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cassee = { prepare() { throw new Error('D1_ERROR: no such table: secret_interne') } } as unknown as D1Database
    const resultat = await appelerOutil({ db: cassee, origine: 'https://x.fr' }, 'lister_logiciels', {})
    expect(resultat).toEqual({
      content: [{ type: 'text', text: 'Erreur interne du serveur. Réessayez ; si le problème persiste, consultez les journaux.' }],
      isError: true,
    })
    expect(erreurJournal).toHaveBeenCalledTimes(1)
    expect(String(erreurJournal.mock.calls[0][0])).toContain('lister_logiciels')
    expect((erreurJournal.mock.calls[0][1] as Error).message).toContain('secret_interne')
    erreurJournal.mockRestore()
  })

  it('garde le message des erreurs métier, sans journal', async () => {
    const erreurJournal = vi.spyOn(console, 'error').mockImplementation(() => {})
    const resultat = await appelerOutil(ctx, 'lire_logiciel', { logiciel_id: 'inconnu' })
    expect(resultat.content[0].text).toBe('Logiciel introuvable : inconnu')
    expect(erreurJournal).not.toHaveBeenCalled()
    erreurJournal.mockRestore()
  })
})

describe('descriptions', () => {
  it('dit que les champs facultatifs omis sont conservés au remplacement', () => {
    const description = OUTILS.find(o => o.nom === 'enregistrer_questionnaire')!.description
    expect(description).toContain('conservent leur valeur')
    expect(description).toContain('défaut du nouveau mode')
  })

  it('lire_projet annonce que les documents sont listés sans contenu', () => {
    const description = OUTILS.find(o => o.nom === 'lire_projet')!.description
    expect(description).toContain('lire_document')
  })
})
