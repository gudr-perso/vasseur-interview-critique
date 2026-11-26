import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as repondantId from '../../functions/api/admin/repondants/[id]'
import * as questionnaireRepondants from '../../functions/api/admin/questionnaires/[id]/repondants'
import { onRequest as gardeAdmin } from '../../functions/api/admin/_middleware'
import { onRequest as entetesPublics } from '../../functions/api/public/_middleware'
import * as accueil from '../../functions/api/public/q/[code]/index'
import * as inscription from '../../functions/api/public/q/[code]/repondants'
import * as etat from '../../functions/api/public/r/[jeton]/index'
import * as identite from '../../functions/api/public/r/[jeton]/identite'
import * as reponses from '../../functions/api/public/r/[jeton]/reponses'
import * as suivant from '../../functions/api/public/r/[jeton]/suivant'
import * as terminer from '../../functions/api/public/r/[jeton]/terminer'
import { creerProjet, modifierProjet } from '../../server/services/projets'
import { cloreQuestionnaire, enregistrerQuestionnaire, publierQuestionnaire } from '../../server/services/questionnaires'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
let projetId: string
const OBJECTIF = 'OBJECTIF-INTERNE-XYZ'
const coordonnees = { nom: 'Durand', prenom: 'Léa', entreprise: 'CUMA du Val' }

const hybride = { questions: [{ id: 'q1', type: 'texte', libelle: 'Comment faites-vous ?', objectif: OBJECTIF }] }
const entretien = { question_ouverture: 'Racontez.', themes: [{ id: 't1', titre: 'Existant', objectif: OBJECTIF }] }

beforeAll(async () => {
  base = await creerBaseDeTest()
  projetId = (await creerProjet(base.db, { titre: 'Saisie des temps', type_demande: 'amelioration' })).id
  await modifierProjet(base.db, projetId, { note_cadrage: 'NOTE-SECRETE' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterAll(async () => { await base.fermer() })

type Handler = (contexte: never) => Promise<Response> | Response

/** Appelle un handler public comme le fait Cloudflare : à travers `_middleware.ts` du dossier public. */
async function appelerPublic(
  handler: Handler | undefined, methode: string, chemin: string, params: Record<string, string>, corps?: unknown,
): Promise<{ statut: number; donnees: any; reponse: Response }> {
  if (!handler) throw new Error(`Aucun handler ${methode} pour ${chemin}`)
  const request = new Request(`https://exemple.test${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const env = { DB: base.db }
  const reponse = await (entetesPublics as Handler)({
    request, env, params, next: () => handler({ request, env, params } as never),
  } as never)
  const texte = await reponse.text()
  return { statut: reponse.status, donnees: texte ? JSON.parse(texte) : null, reponse }
}

async function appelerAdmin(handler: Handler | undefined, methode: string, chemin: string, id: string, corps?: unknown) {
  if (!handler) throw new Error(`Aucun handler ${methode} pour ${chemin}`)
  const request = new Request(`https://exemple.test${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const reponse = await handler({ request, env: { DB: base.db }, params: { id } } as never)
  const texte = await reponse.text()
  return { statut: reponse.status, donnees: texte ? JSON.parse(texte) : null }
}

async function ouvrir(mode: 'hybride' | 'entretien') {
  const q = await enregistrerQuestionnaire(base.db, {
    projet_id: projetId, public_vise: 'Comptables', mode, contenu: mode === 'hybride' ? hybride : entretien,
    introduction: 'Bonjour', duree_estimee_min: 10,
  })
  await publierQuestionnaire(base.db, q.id, 'https://x.fr')
  return q
}

async function sInscrire(code: string) {
  const r = await appelerPublic(inscription.onRequestPost, 'POST', `/api/public/q/${code}/repondants`, { code }, coordonnees)
  expect(r.statut).toBe(201)
  return r.donnees.jeton as string
}

describe('GET /api/public/q/:code', () => {
  it("n'expose que l'accueil, sans cache", async () => {
    const q = await ouvrir('hybride')
    const r = await appelerPublic(accueil.onRequestGet, 'GET', `/api/public/q/${q.code}`, { code: q.code })
    expect(r.statut).toBe(200)
    expect(r.donnees).toEqual({ public_vise: 'Comptables', introduction: 'Bonjour', duree_estimee_min: 10, mode: 'hybride' })
    expect(r.reponse.headers.get('Cache-Control')).toBe('no-store')
  })

  it('répond 404 identique pour un brouillon et un code inconnu, 410 pour un clos, tous sans cache', async () => {
    const brouillon = await enregistrerQuestionnaire(base.db, {
      projet_id: projetId, public_vise: 'X', mode: 'hybride', contenu: hybride,
    })
    const a = await appelerPublic(accueil.onRequestGet, 'GET', '/x', { code: brouillon.code })
    const b = await appelerPublic(accueil.onRequestGet, 'GET', '/x', { code: 'inconnu' })
    expect(a.statut).toBe(404)
    expect(b.statut).toBe(404)
    expect(a.donnees).toEqual({ error: { message: 'Lien invalide.' } })
    expect(b.donnees).toEqual(a.donnees)

    const clos = await ouvrir('hybride')
    await cloreQuestionnaire(base.db, clos.id)
    const c = await appelerPublic(accueil.onRequestGet, 'GET', '/x', { code: clos.code })
    expect(c.statut).toBe(410)
    for (const r of [a, b, c]) expect(r.reponse.headers.get('Cache-Control')).toBe('no-store')
  })

  it('pose no-store aussi sur une erreur interne', async () => {
    const reponse = await (entetesPublics as Handler)({ next: async () => { throw new Error('boum') } } as never)
    expect(reponse.status).toBe(500)
    expect(reponse.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('POST /api/public/q/:code/repondants', () => {
  it('crée le répondant et ne rend que son jeton', async () => {
    const q = await ouvrir('hybride')
    const r = await appelerPublic(inscription.onRequestPost, 'POST', '/x', { code: q.code }, coordonnees)
    expect(r.statut).toBe(201)
    expect(Object.keys(r.donnees)).toEqual(['jeton'])
    expect(r.reponse.headers.get('Cache-Control')).toBe('no-store')
  })

  it('refuse une identité incomplète avec le message du service', async () => {
    const q = await ouvrir('hybride')
    const r = await appelerPublic(inscription.onRequestPost, 'POST', '/x', { code: q.code }, { prenom: 'Léa', entreprise: 'C' })
    expect(r.statut).toBe(400)
    expect(r.donnees.error.message).toBe('Le nom est obligatoire.')
  })
})

describe('parcours', () => {
  it("hybride : identité, réponse, fin, sans relance puisque l'IA est indisponible", async () => {
    const q = await ouvrir('hybride')
    const jeton = await sInscrire(q.code)
    const p = { jeton }
    const premiere = await appelerPublic(etat.onRequestGet, 'GET', '/x', p)
    expect(premiere.statut).toBe(200)
    expect(premiere.donnees.etape).toMatchObject({ type: 'question', question: { ordre: 1, libelle: 'Comment faites-vous ?' } })

    const fin = await appelerPublic(reponses.onRequestPost, 'POST', '/x', p, { ordre: 1, reponse: { texte: 'Sur papier' } })
    expect(fin.statut).toBe(200)
    expect(fin.donnees.etape).toEqual({ type: 'termine' })
    expect(fin.reponse.headers.get('Cache-Control')).toBe('no-store')
  })

  it('entretien : la première réponse interrompt, terminer conclut', async () => {
    const q = await ouvrir('entretien')
    const jeton = await sInscrire(q.code)
    const p = { jeton }
    const interrompu = await appelerPublic(reponses.onRequestPost, 'POST', '/x', p, { ordre: 1, reponse: { texte: 'Voilà' } })
    expect(interrompu.statut).toBe(200)
    expect(interrompu.donnees.etape).toEqual({ type: 'interrompu', reessai_possible: true })

    // Nouvel essai trop rapproché : refusé en 429, avec un message lisible.
    const encore = await appelerPublic(suivant.onRequestPost, 'POST', '/x', p)
    expect(encore.statut).toBe(429)
    expect(encore.donnees.error.message).toMatch(/Patientez/)
    expect(encore.reponse.headers.get('Cache-Control')).toBe('no-store')

    const fin = await appelerPublic(terminer.onRequestPost, 'POST', '/x', p)
    expect(fin.donnees.etape).toEqual({ type: 'termine' })
  })

  it('refuse un corps de plus de 64 Ko en 413', async () => {
    const q = await ouvrir('hybride')
    const jeton = await sInscrire(q.code)
    const r = await appelerPublic(reponses.onRequestPost, 'POST', '/x', { jeton }, { ordre: 1, reponse: { texte: 'a'.repeat(70_000) } })
    expect(r.statut).toBe(413)
    expect(r.donnees.error.message).toMatch(/64 Ko/)
  })

  it('refuse un corps de réponse invalide et un jeton inconnu', async () => {
    const q = await ouvrir('hybride')
    const jeton = await sInscrire(q.code)
    const mauvais = await appelerPublic(reponses.onRequestPost, 'POST', '/x', { jeton }, { ordre: 0, reponse: {} })
    expect(mauvais.statut).toBe(400)
    const inconnu = await appelerPublic(etat.onRequestGet, 'GET', '/x', { jeton: 'nimporte' })
    expect(inconnu.statut).toBe(404)
    expect(inconnu.reponse.headers.get('Cache-Control')).toBe('no-store')
    const inconnuReponse = await appelerPublic(reponses.onRequestPost, 'POST', '/x', { jeton: 'nimporte' }, { ordre: 1, reponse: { texte: 'a' } })
    expect(inconnuReponse.statut).toBe(404)
  })

  it("ne laisse fuiter ni objectif, ni note de cadrage, ni identifiant, ni modèle", async () => {
    for (const mode of ['hybride', 'entretien'] as const) {
      const q = await ouvrir(mode)
      const jeton = await sInscrire(q.code)
      const vus = [
        await appelerPublic(accueil.onRequestGet, 'GET', '/x', { code: q.code }),
        await appelerPublic(etat.onRequestGet, 'GET', '/x', { jeton }),
        await appelerPublic(reponses.onRequestPost, 'POST', '/x', { jeton }, { ordre: 1, reponse: { texte: 'a' } }),
        await appelerPublic(suivant.onRequestPost, 'POST', '/x', { jeton }),
        await appelerPublic(etat.onRequestGet, 'GET', '/x', { jeton }),
      ]
      for (const { reponse, donnees } of vus) {
        const brut = JSON.stringify(donnees)
        expect(brut).not.toContain(OBJECTIF)
        expect(brut).not.toContain('NOTE-SECRETE')
        expect(brut).not.toContain('claude')
        expect(brut).not.toContain(q.id)
        expect(brut).not.toContain(projetId)
        expect(brut).not.toContain('"id"')
        expect(reponse.headers.get('Cache-Control')).toBe('no-store')
      }
    }
  })

  it("PUT /identite fait passer une invitation à l'étape question", async () => {
    const q = await ouvrir('hybride')
    const inv = await appelerAdmin(questionnaireRepondants.onRequestPost, 'POST', '/x', q.id, coordonnees)
    const p = { jeton: inv.donnees.jeton }
    expect((await appelerPublic(etat.onRequestGet, 'GET', '/x', p)).donnees.etape).toEqual({ type: 'identite' })
    const r = await appelerPublic(identite.onRequestPut, 'PUT', '/x', p, { ...coordonnees, poste: 'Comptable' })
    expect(r.statut).toBe(200)
    expect(r.donnees.etape.type).toBe('question')
    expect(r.donnees.identite.poste).toBe('Comptable')
  })
})

describe("coût de l'IA des entretiens", () => {
  const RELANCE = 'Pouvez-vous donner un exemple ?'
  const reponseRelance = () => new Response(JSON.stringify({
    id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: 'end_turn', stop_sequence: null,
    content: [{ type: 'text', text: JSON.stringify({ relancer: true, question: RELANCE }) }],
    usage: { input_tokens: 120, output_tokens: 30 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  /** Comme `appelerPublic`, avec une clé, l'API stubbée et `waitUntil` ; rend aussi le travail confié à waitUntil. */
  async function appelerAvecIa(handler: Handler | undefined, params: Record<string, string>, corps?: unknown) {
    if (!handler) throw new Error('Aucun handler')
    const enCours: Promise<unknown>[] = []
    const request = new Request('https://exemple.test/x', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    })
    const env = { DB: base.db, ANTHROPIC_API_KEY: 'sk-test' }
    const waitUntil = (p: Promise<unknown>) => { enCours.push(p) }
    const reponse = await (entetesPublics as Handler)({
      request, env, params, waitUntil, next: () => handler({ request, env, params, waitUntil } as never),
    } as never)
    const texte = await reponse.text()
    await Promise.all(enCours)
    return { statut: reponse.status, donnees: texte ? JSON.parse(texte) : null, enCours }
  }

  const lignes = async () => (await base.db.prepare('SELECT * FROM consommation_ia').all<Record<string, unknown>>()).results

  afterEach(async () => {
    vi.unstubAllGlobals()
    await base.db.prepare('DELETE FROM consommation_ia').run()
  })

  it('une relance écrit une ligne `interview` du projet, sans rien changer à la réponse publique', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponseRelance()))
    const q = await ouvrir('hybride')
    const jeton = await sInscrire(q.code)
    const r = await appelerAvecIa(reponses.onRequestPost, { jeton }, { ordre: 1, reponse: { texte: 'Sur papier' } })
    expect(r.statut).toBe(200)
    expect(r.donnees.etape).toEqual({
      type: 'question',
      question: { ordre: 2, type: 'relance', libelle: RELANCE, rappel: { question: 'Comment faites-vous ?', reponse: 'Sur papier' } },
      progression: expect.any(Object),
    })
    expect(JSON.stringify(r.donnees)).not.toMatch(/jetons|cout|consommation|projet_id/)
    expect(r.enCours).toHaveLength(1)
    const l = await lignes()
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ poste: 'interview', projet_id: projetId, modele: 'claude-sonnet-5-5', jetons_entree: 120, jetons_sortie: 30 })
  })

  it('base du suivi en panne : la relance est quand même posée', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reponseRelance()))
    const q = await ouvrir('hybride')
    const jeton = await sInscrire(q.code)
    await base.db.prepare('ALTER TABLE consommation_ia RENAME TO consommation_ia_hors_service').run()
    try {
      const r = await appelerAvecIa(reponses.onRequestPost, { jeton }, { ordre: 1, reponse: { texte: 'Sur papier' } })
      expect(r.statut).toBe(200)
      expect(r.donnees.etape.question).toMatchObject({ type: 'relance', libelle: RELANCE })
    } finally {
      await base.db.prepare('ALTER TABLE consommation_ia_hors_service RENAME TO consommation_ia').run()
    }
    expect(await lignes()).toHaveLength(0)
  })

  it('POST /suivant passe aussi le coût à waitUntil', async () => {
    // Mode entretien : la première réponse échoue (IA en panne), le nouvel essai réussit et compte sa ligne.
    const q = await ouvrir('entretien')
    const jeton = await sInscrire(q.code)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"type":"error","error":{"type":"invalid_request_error","message":"x"}}', { status: 400 })))
    const interrompu = await appelerAvecIa(reponses.onRequestPost, { jeton }, { ordre: 1, reponse: { texte: 'Voilà' } })
    expect(interrompu.donnees.etape).toEqual({ type: 'interrompu', reessai_possible: true })
    await base.db.prepare('UPDATE repondants SET suite_essai_le = NULL WHERE jeton = ?').bind(jeton).run()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'msg_2', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text: JSON.stringify({ fin: false, question: 'Et ensuite ?', themes_couverts: [] }) }],
      usage: { input_tokens: 50, output_tokens: 5 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const r = await appelerAvecIa(suivant.onRequestPost, { jeton })
    expect(r.statut).toBe(200)
    expect(r.donnees.etape.question).toMatchObject({ libelle: 'Et ensuite ?' })
    const l = await lignes()
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ poste: 'interview', projet_id: projetId, jetons_entree: 50 })
  })
})

describe('routes admin du suivi', () => {
  it("crée une invitation, liste, lit un entretien, supprime", async () => {
    const q = await ouvrir('hybride')
    const cree = await appelerAdmin(questionnaireRepondants.onRequestPost, 'POST', '/x', q.id, coordonnees)
    expect(cree.statut).toBe(201)
    expect(cree.donnees).toMatchObject({ origine: 'invitation', statut: 'invite', nb_reponses: 0 })
    expect(typeof cree.donnees.jeton).toBe('string')

    const liste = await appelerAdmin(questionnaireRepondants.onRequestGet, 'GET', '/x', q.id)
    expect(liste.donnees.map((r: any) => r.id)).toEqual([cree.donnees.id])
    expect(liste.donnees[0].nb_reponses).toBe(0)

    await appelerPublic(identite.onRequestPut, 'PUT', '/x', { jeton: cree.donnees.jeton }, coordonnees)
    await appelerPublic(reponses.onRequestPost, 'POST', '/x', { jeton: cree.donnees.jeton }, { ordre: 1, reponse: { texte: 'Sur papier' } })
    const lu = await appelerAdmin(repondantId.onRequestGet, 'GET', '/x', cree.donnees.id)
    expect(lu.statut).toBe(200)
    expect(lu.donnees.tours[0].reponse).toEqual({ texte: 'Sur papier' })
    expect((await appelerAdmin(questionnaireRepondants.onRequestGet, 'GET', '/x', q.id)).donnees[0].nb_reponses).toBe(1)

    expect((await appelerAdmin(repondantId.onRequestDelete, 'DELETE', '/x', cree.donnees.id)).statut).toBe(204)
    expect((await appelerAdmin(repondantId.onRequestGet, 'GET', '/x', cree.donnees.id)).statut).toBe(404)
  })

  it("refuse une invitation sur un brouillon et liste un questionnaire inconnu en 404", async () => {
    const brouillon = await enregistrerQuestionnaire(base.db, {
      projet_id: projetId, public_vise: 'X', mode: 'hybride', contenu: hybride,
    })
    expect((await appelerAdmin(questionnaireRepondants.onRequestPost, 'POST', '/x', brouillon.id, coordonnees)).statut).toBe(409)
    expect((await appelerAdmin(questionnaireRepondants.onRequestGet, 'GET', '/x', 'inconnu')).statut).toBe(404)
  })
})

describe('gardes', () => {
  it("la garde de session couvre les routes admin du suivi", async () => {
    const env = { ADMIN_PASSWORD: 'x', SESSION_SECRET: 'secret-de-test' }
    const sansSession = (chemin: string) => ({
      request: new Request(`https://exemple.test${chemin}`), env, next: async () => new Response('suite'),
    }) as never
    expect((await gardeAdmin(sansSession('/api/admin/repondants/abc'))).status).toBe(401)
    expect((await gardeAdmin(sansSession('/api/admin/questionnaires/abc/repondants'))).status).toBe(401)
  })

  it("rien sous functions/api/public n'appelle la garde admin, et seul le dossier admin porte `_middleware`", () => {
    const fichiers = (dossier: string): string[] => readdirSync(dossier, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? fichiers(join(dossier, e.name)) : [join(dossier, e.name)])
    const racine = join(process.cwd(), 'functions', 'api')
    for (const f of fichiers(join(racine, 'public'))) expect(readFileSync(f, 'utf8')).not.toMatch(/exigerAdmin|server\/auth/)
    const gardes = fichiers(racine).filter(f => /_middleware\.ts$/.test(f)).map(f => f.slice(racine.length + 1).split(sep).join('/'))
    expect(gardes.sort()).toEqual(['admin/_middleware.ts', 'public/_middleware.ts'])
  })
})
