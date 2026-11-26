import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as analysesProjet from '../../functions/api/admin/projets/[id]/analyses'
import * as analyseId from '../../functions/api/admin/analyses/[id]'
import { route } from '../../server/api'
import {
  consigneAnalyse, genererAnalyse, repondreAnalyse, type FinAnalyse, type GenerationAnalyse, type OptionsAnalyse,
} from '../../server/ia/analyse'
import { ErreurIa } from '../../server/ia/types'
import { enregistrerAnalyse, listerAnalyses } from '../../server/services/analyses'
import { FORME_SEPARATEUR, type ControleFluxAnalyse, type EnteteFluxAnalyse } from '../../shared/analyses'
import { creerProjet } from '../../server/services/projets'
import { enregistrerQuestionnaire, publierQuestionnaire } from '../../server/services/questionnaires'
import { creerRepondantGenerique, lireRepondantParJeton } from '../../server/services/repondants'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
let projetId: string
let qComptables: { id: string; code: string }
let qVide: { id: string }
let grosProjetId: string
const MODELE = 'claude-modele-analyse-du-projet'

const identites = {
  A: { nom: 'Durandeau', prenom: 'Léopoldine', poste: 'Comptable', entreprise: 'CUMA du Val', mail: 'leopoldine.durandeau@exemple.fr' },
  B: { nom: 'Martineau', prenom: 'Gaspard', poste: 'Animateur', entreprise: 'CUMA des Prés', mail: 'gaspard.martineau@exemple.fr' },
  C: { nom: 'Bernardin', prenom: 'Zéphyrine', poste: 'Gérante', entreprise: 'CUMA du Nord', mail: 'zephyrine@exemple.fr' },
}
const repondants: Record<keyof typeof identites, { id: string; jeton: string }> = {} as never

const contenu = { questions: [{ id: 'q1', type: 'texte', libelle: 'Que vous manque-t-il ?', objectif: 'repérer les manques' }] }

async function nouveauRepondant(code: string, cle: keyof typeof identites, statut: 'termine' | 'commence', reponse: string) {
  const { jeton } = await creerRepondantGenerique(base.db, code, identites[cle])
  const { repondant } = await lireRepondantParJeton(base.db, jeton)
  repondants[cle] = { id: repondant.id, jeton }
  await base.db.prepare('UPDATE repondants SET statut = ?, commence_le = ?, termine_le = ? WHERE id = ?')
    .bind(statut, `2026-11-0${Object.keys(repondants).length}T09:00:00.000Z`, statut === 'termine' ? '2026-11-20T10:00:00.000Z' : null, repondant.id).run()
  await base.db.prepare(
    'INSERT INTO tours (id, repondant_id, ordre, question_id, type, question, reponse, cree_le) VALUES (?,?,?,?,?,?,?,?)',
  ).bind(`tour-${repondant.id}`, repondant.id, 1, 'q1', 'question', 'Que vous manque-t-il ?', JSON.stringify({ texte: reponse }), '2026-11-20T10:00:00.000Z').run()
}

beforeAll(async () => {
  base = await creerBaseDeTest()
  projetId = (await creerProjet(base.db, { titre: 'Saisie des temps', type_demande: 'amelioration', modeles: { analyse: MODELE } })).id
  qComptables = await enregistrerQuestionnaire(base.db, { projet_id: projetId, public_vise: 'Comptables', mode: 'hybride', contenu })
  qVide = await enregistrerQuestionnaire(base.db, { projet_id: projetId, public_vise: 'Gérants', mode: 'hybride', contenu })
  await publierQuestionnaire(base.db, qComptables.id, 'https://x.fr')
  await nouveauRepondant(qComptables.code, 'A', 'termine', 'Un export vers le tableur.')
  await nouveauRepondant(qComptables.code, 'B', 'termine', 'Une saisie sur téléphone.')
  await nouveauRepondant(qComptables.code, 'C', 'commence', 'Je ne sais pas encore.')

  grosProjetId = (await creerProjet(base.db, { titre: 'Gros projet', type_demande: 'amelioration' })).id
  const qGros = await enregistrerQuestionnaire(base.db, { projet_id: grosProjetId, public_vise: 'Tous', mode: 'hybride', contenu })
  await publierQuestionnaire(base.db, qGros.id, 'https://x.fr')
  const { jeton } = await creerRepondantGenerique(base.db, qGros.code, { nom: 'Long', prenom: 'Bavard', poste: '', entreprise: 'CUMA bavarde', mail: '' })
  const { repondant } = await lireRepondantParJeton(base.db, jeton)
  await base.db.prepare("UPDATE repondants SET statut = 'termine', commence_le = ?, termine_le = ? WHERE id = ?")
    .bind('2026-11-01T09:00:00.000Z', '2026-11-02T09:00:00.000Z', repondant.id).run()
  await base.db.prepare(
    'INSERT INTO tours (id, repondant_id, ordre, question_id, type, question, reponse, cree_le) VALUES (?,?,?,?,?,?,?,?)',
  ).bind('tour-gros', repondant.id, 1, 'q1', 'question', 'Que vous manque-t-il ?', JSON.stringify({ texte: 'x'.repeat(400_001) }), '2026-11-02T09:00:00.000Z').run()
})
afterAll(async () => { await base.fermer() })

type Handler = (contexte: never) => Promise<Response> | Response

function contexte(methode: string, chemin: string, corps?: unknown, id?: string, cle: string | undefined = 'sk-test') {
  const enCours: Promise<unknown>[] = []
  const request = new Request(`https://exemple.test${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const env = cle === undefined ? { DB: base.db } : { DB: base.db, ANTHROPIC_API_KEY: cle }
  return {
    valeur: { request, env, params: id ? { id } : {}, waitUntil: (p: Promise<unknown>) => { enCours.push(p) } } as never,
    /** Attend la fin du travail confié à waitUntil. */
    tache: async () => { expect(enCours).toHaveLength(1); await Promise.all(enCours) },
    enCours,
  }
}

async function appeler(handler: Handler | undefined, methode: string, chemin: string, corps?: unknown, id?: string, cle?: string) {
  if (!handler) throw new Error(`Aucun handler ${methode} pour ${chemin}`)
  const reponse = await handler(contexte(methode, chemin, corps, id, cle).valeur)
  const texte = await reponse.text()
  return { statut: reponse.status, donnees: texte ? JSON.parse(texte) : null }
}

interface Scenario {
  morceaux: string[]
  /** Bloque la génération avant le premier morceau, jusqu'à ce que cette promesse soit tenue. */
  avantTout?: Promise<void>
  tronquee?: boolean
  refusee?: boolean
  erreur?: string
  /** Bloque la génération après le premier morceau, jusqu'à ce que cette promesse soit tenue. */
  attente?: Promise<void>
}

/** Génération simulée : produit les morceaux du scénario et garde les demandes reçues. */
function simulation(scenario: Scenario) {
  const demandes: OptionsAnalyse[] = []
  const generer = (options: OptionsAnalyse): GenerationAnalyse => {
    demandes.push(options)
    let finale: FinAnalyse | undefined
    return {
      async *[Symbol.asyncIterator]() {
        let texte = ''
        if (scenario.avantTout) await scenario.avantTout
        for (const [i, morceau] of scenario.morceaux.entries()) {
          if (i === 1 && scenario.attente) await scenario.attente
          texte += morceau
          yield morceau
        }
        if (scenario.erreur) throw new ErreurIa(scenario.erreur)
        finale = { texte, tronquee: !!scenario.tronquee, refusee: !!scenario.refusee }
      },
      async fin() {
        if (!finale) throw new ErreurIa('Génération inachevée.')
        return finale
      },
    }
  }
  return { generer, demandes, post: route<'id'>(c => repondreAnalyse(c, generer, { intervalleVieMs: 20 })) as Handler }
}

/** Découpe un flux complet selon le contrat : en-tête, texte sans les lignes de contrôle, lignes de contrôle. */
function analyserFlux(brut: string) {
  const fin = brut.indexOf('\n')
  const entete = JSON.parse(brut.slice(0, fin)) as EnteteFluxAnalyse
  expect(entete.controle).toMatch(FORME_SEPARATEUR)
  const marque = `\n${entete.controle} `
  const controles: ControleFluxAnalyse[] = []
  let reste = brut.slice(fin + 1)
  let texte = ''
  for (;;) {
    const i = reste.indexOf(marque)
    if (i < 0) break
    const finLigne = reste.indexOf('\n', i + marque.length)
    expect(finLigne, 'ligne de contrôle terminée').toBeGreaterThan(i)
    texte += reste.slice(0, i)
    controles.push(JSON.parse(reste.slice(i + marque.length, finLigne)) as ControleFluxAnalyse)
    reste = reste.slice(finLigne + 1)
  }
  texte += reste
  const derniere = controles.at(-1)
  // Le flux se termine toujours par une ligne de succès ou d'erreur, et rien ne la suit.
  expect(reste).toBe('')
  expect(derniere?.type === 'succes' || derniere?.type === 'erreur').toBe(true)
  expect(controles.slice(0, -1).every(c => c.type === 'vie')).toBe(true)
  return { entete, texte, controles, fin: derniere! }
}

async function generer(sim: ReturnType<typeof simulation>, corps: unknown, id = projetId) {
  const ctx = contexte('POST', `/api/admin/projets/${id}/analyses`, corps, id)
  const reponse = await sim.post(ctx.valeur)
  return { reponse, ctx }
}

const analysesDuProjet = () => listerAnalyses(base.db, { projet_id: projetId })
/** Chaque génération part d'un historique vide : l'analyse enregistrée est alors la seule de la liste. */
const viderAnalyses = async () => { await base.db.prepare('DELETE FROM analyses').run() }

describe('POST /api/admin/projets/:id/analyses — refus avant toute génération', () => {
  it('répond 503 sans clé API', async () => {
    const r = await appeler(analysesProjet.onRequestPost, 'POST', '/x', { type: 'synthese' }, projetId, '')
    expect(r).toEqual({
      statut: 503,
      donnees: { error: { message: "Analyse par l'API indisponible : clé non configurée. Utilisez Claude avec le connecteur MCP." } },
    })
  })

  it('refuse un type inconnu, une fiche sans répondant et une synthèse avec répondant', async () => {
    const sim = simulation({ morceaux: ['x'] })
    for (const corps of [
      { type: 'resume' },
      { type: 'fiche_repondant' },
      { type: 'synthese', repondant_id: 'r' },
    ]) {
      const { reponse } = await generer(sim, corps)
      expect(reponse.status).toBe(400)
    }
    expect(sim.demandes).toHaveLength(0)
  })

  it('répond 404 pour un projet ou un questionnaire inconnu', async () => {
    const sim = simulation({ morceaux: ['x'] })
    expect((await generer(sim, { type: 'synthese' }, 'inconnu')).reponse.status).toBe(404)
    expect((await generer(sim, { type: 'synthese', questionnaire_id: 'inconnu' })).reponse.status).toBe(404)
    expect(sim.demandes).toHaveLength(0)
  })

  it("répond 400 quand la portée n'a aucun entretien", async () => {
    const sim = simulation({ morceaux: ['x'] })
    const { reponse } = await generer(sim, { type: 'synthese', questionnaire_id: qVide.id })
    expect(reponse.status).toBe(400)
    expect(await reponse.json()).toEqual({ error: { message: 'Aucun entretien à analyser pour cette portée.' } })
    expect(sim.demandes).toHaveLength(0)
  })

  it('répond 413 au-delà de 400 000 caractères d\'entretiens, en orientant vers un questionnaire ou vers Claude', async () => {
    const sim = simulation({ morceaux: ['x'] })
    const { reponse } = await generer(sim, { type: 'synthese' }, grosProjetId)
    expect(reponse.status).toBe(413)
    const { error } = await reponse.json() as { error: { message: string } }
    expect(error.message).toContain('400 000')
    expect(error.message).toContain('questionnaire par questionnaire')
    expect(error.message).toContain('MCP')
    expect(sim.demandes).toHaveLength(0)
  })
})

describe('POST /api/admin/projets/:id/analyses — génération en flux', () => {
  beforeEach(viderAnalyses)

  it("diffuse l'en-tête puis le texte, et enregistre l'analyse avec le modèle du projet", async () => {
    const avant = (await analysesDuProjet()).length
    const sim = simulation({ morceaux: ['## Constats\n', '2 répondants sur 2 ', 'veulent un export.'] })
    const { reponse, ctx } = await generer(sim, { type: 'synthese', questionnaire_id: qComptables.id })
    expect(reponse.status).toBe(200)
    expect(reponse.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8')
    expect(reponse.headers.get('Cache-Control')).toContain('no-store')
    const flux = analyserFlux(await reponse.text())
    expect(flux.entete.nb_entretiens).toBe(2)
    expect(flux.texte).toBe('## Constats\n2 répondants sur 2 veulent un export.')
    await ctx.tache()

    const [demande] = sim.demandes
    expect(demande.modele).toBe(MODELE)
    expect(demande.cleApi).toBe('sk-test')
    expect(demande.consigne).toBe(consigneAnalyse('synthese'))
    expect(demande.message).toContain('# Projet : Saisie des temps')
    expect(demande.message).toContain('## Répondant 1 — Comptable, CUMA du Val')
    expect(demande.message).not.toContain('Je ne sais pas encore.')

    const analyses = await analysesDuProjet()
    expect(analyses).toHaveLength(avant + 1)
    expect(analyses[0]).toMatchObject({
      type: 'synthese', source: MODELE, nb_entretiens: 2, questionnaire_id: qComptables.id, repondant_id: null,
    })
    expect(flux.fin).toEqual({ type: 'succes', analyse_id: analyses[0].id })
    const lue = await appeler(analyseId.onRequestGet, 'GET', '/x', undefined, analyses[0].id)
    expect(lue.donnees.contenu).toBe('## Constats\n2 répondants sur 2 veulent un export.')
  })

  it('inclut les entretiens en cours sur demande', async () => {
    const sim = simulation({ morceaux: ['## Synthèse'] })
    const { reponse, ctx } = await generer(sim, { type: 'expression_besoin', inclure_en_cours: true })
    expect(analyserFlux(await reponse.text()).entete.nb_entretiens).toBe(3)
    await ctx.tache()
    expect(sim.demandes[0].message).toContain('Je ne sais pas encore.')
    expect(sim.demandes[0].consigne).toBe(consigneAnalyse('expression_besoin'))
    expect((await analysesDuProjet())[0]).toMatchObject({ type: 'expression_besoin', nb_entretiens: 3, questionnaire_id: null })
  })

  it("rattache une fiche à son répondant, même quand l'entretien est en cours", async () => {
    const sim = simulation({ morceaux: ['## Profil'] })
    const { reponse, ctx } = await generer(sim, { type: 'fiche_repondant', repondant_id: repondants.C.id })
    const flux = analyserFlux(await reponse.text())
    expect([flux.entete.nb_entretiens, flux.texte]).toEqual([1, '## Profil'])
    await ctx.tache()
    expect(sim.demandes[0].consigne).toBe(consigneAnalyse('fiche_repondant'))
    expect((await analysesDuProjet())[0]).toMatchObject({ type: 'fiche_repondant', repondant_id: repondants.C.id, nb_entretiens: 1 })
  })

  it('enregistre une réponse tronquée avec la mention finale, aussi montrée dans le flux', async () => {
    const sim = simulation({ morceaux: ['## Début'], tronquee: true })
    const { reponse, ctx } = await generer(sim, { type: 'synthese' })
    const mention = '\n\n*(Analyse interrompue : longueur maximale atteinte.)*'
    expect(analyserFlux(await reponse.text()).texte).toBe(`## Début${mention}`)
    await ctx.tache()
    const [derniere] = await analysesDuProjet()
    expect((await appeler(analyseId.onRequestGet, 'GET', '/x', undefined, derniere.id)).donnees.contenu).toBe(`## Début${mention}`)
  })

  it("n'enregistre ni un refus du modèle, ni une réponse vide, ni une génération en échec", async () => {
    const cas: [Scenario, RegExp][] = [
      [{ morceaux: ['Je ne peux pas.'], refusee: true }, /refusé/],
      [{ morceaux: ['  \n'] }, /aucun texte/],
      [{ morceaux: ['## Début'], erreur: "L'API Anthropic a interrompu la génération." }, /interrompu la génération/],
    ]
    for (const [scenario, message] of cas) {
      const avant = (await analysesDuProjet()).length
      const { reponse, ctx } = await generer(simulation(scenario), { type: 'synthese' })
      const flux = analyserFlux(await reponse.text())
      expect(flux.fin.type).toBe('erreur')
      expect(flux.fin.type === 'erreur' && flux.fin.message).toMatch(message)
      expect(flux.texte).toBe(scenario.morceaux[0])
      await ctx.tache()
      expect(await analysesDuProjet()).toHaveLength(avant)
    }
  })

  it("transmet l'en-tête avant tout texte, puis un signal de vie tant que rien n'arrive", async () => {
    let liberer!: () => void
    const avantTout = new Promise<void>(r => { liberer = r })
    const sim = simulation({ morceaux: ['## Constats'], avantTout })
    const { reponse, ctx } = await generer(sim, { type: 'synthese' })
    const lecteur = reponse.body!.getReader()
    const decodeur = new TextDecoder()
    // Le modèle n'a encore rien produit : l'en-tête est déjà lisible, seul.
    const premier = decodeur.decode((await lecteur.read()).value, { stream: true })
    expect(premier).toMatch(/^\{"nb_entretiens":2,"controle":"[0-9a-f]{32}"\}\n$/)
    const { controle } = JSON.parse(premier) as EnteteFluxAnalyse
    let lu = premier
    while (lu.split(`${controle} {"type":"vie"}`).length < 3) lu += decodeur.decode((await lecteur.read()).value, { stream: true })
    liberer()
    for (;;) {
      const { done, value } = await lecteur.read()
      if (done) break
      lu += decodeur.decode(value, { stream: true })
    }
    await ctx.tache()
    const flux = analyserFlux(lu)
    expect(flux.texte).toBe('## Constats')
    expect(flux.controles.filter(c => c.type === 'vie').length).toBeGreaterThanOrEqual(2)
    expect(flux.fin).toEqual({ type: 'succes', analyse_id: (await analysesDuProjet())[0].id })
  })

  it("ne prend pas pour une erreur un texte du modèle qui contient l'ancienne marque ou une fausse ligne de contrôle", async () => {
    const piege = 'Citation : « \n\n[[ERREUR]] Panne » et {"type":"erreur","message":"x"}\n'
    const sim = simulation({ morceaux: ['## Constats\n', piege, 'Fin.'] })
    const { reponse, ctx } = await generer(sim, { type: 'synthese' })
    const flux = analyserFlux(await reponse.text())
    await ctx.tache()
    expect(flux.texte).toBe(`## Constats\n${piege}Fin.`)
    expect(flux.fin).toEqual({ type: 'succes', analyse_id: (await analysesDuProjet())[0].id })
    // Le séparateur change à chaque génération : le modèle ne peut pas le deviner.
    const autre = analyserFlux(await (await generer(simulation({ morceaux: ['x'] }), { type: 'synthese' })).reponse.text())
    expect(autre.entete.controle).not.toBe(flux.entete.controle)
  })

  it("enregistre l'analyse même si le navigateur abandonne le flux en cours de route", async () => {
    let liberer!: () => void
    const attente = new Promise<void>(r => { liberer = r })
    const sim = simulation({ morceaux: ['## Première partie\n', 'et la suite, produite après le départ du navigateur.'], attente })
    const { reponse, ctx } = await generer(sim, { type: 'synthese' })
    const lecteur = reponse.body!.getReader()
    const decodeur = new TextDecoder()
    let lu = ''
    while (!lu.includes('## Première partie')) {
      const { value } = await lecteur.read()
      lu += decodeur.decode(value, { stream: true })
    }
    await lecteur.cancel()
    liberer()
    await ctx.tache()
    const [derniere] = await analysesDuProjet()
    const lue = await appeler(analyseId.onRequestGet, 'GET', '/x', undefined, derniere.id)
    expect(lue.donnees.contenu).toBe('## Première partie\net la suite, produite après le départ du navigateur.')
  })

  it("ne suspend pas la génération quand personne ne lit le flux", async () => {
    const morceaux = Array.from({ length: 500 }, (_, i) => `Paragraphe ${i} : ${'texte '.repeat(40)}\n`)
    const sim = simulation({ morceaux })
    const { ctx } = await generer(sim, { type: 'synthese' })
    // Le corps de la réponse n'est jamais lu : la génération doit aller au bout malgré tout.
    await ctx.tache()
    const [derniere] = await analysesDuProjet()
    expect((await appeler(analyseId.onRequestGet, 'GET', '/x', undefined, derniere.id)).donnees.contenu).toBe(morceaux.join(''))
  })
})

describe("POST /api/admin/projets/:id/analyses — de bout en bout avec l'API simulée", () => {
  beforeEach(viderAnalyses)

  function sse(e: Record<string, unknown>): string {
    return `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`
  }
  const flux = [
    { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: MODELE, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '## Fiche\n' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Répondant 1 veut un export.' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 20 } },
    { type: 'message_stop' },
  ]

  it("n'envoie à l'API ni nom, ni prénom, ni mail, ni jeton des répondants", async () => {
    const appel = vi.fn(async () => new Response(flux.map(sse).join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    const post = route<'id'>(c => repondreAnalyse(c, options => genererAnalyse({ ...options, fetch: appel as never }))) as Handler
    for (const corps of [
      { type: 'synthese', inclure_en_cours: true },
      { type: 'fiche_repondant', repondant_id: repondants.A.id },
    ]) {
      const ctx = contexte('POST', `/api/admin/projets/${projetId}/analyses`, corps, projetId)
      const reponse = await post(ctx.valeur)
      const lu = analyserFlux(await reponse.text())
      expect(lu.texte).toBe('## Fiche\nRépondant 1 veut un export.')
      expect(lu.fin.type).toBe('succes')
      await ctx.tache()
    }
    expect(appel).toHaveBeenCalledTimes(2)
    for (const [, init] of appel.mock.calls as unknown as [string, RequestInit][]) {
      const corps = init.body as string
      expect(JSON.parse(corps).model).toBe(MODELE)
      expect(corps).toContain('Répondant 1')
      for (const cle of ['A', 'B', 'C'] as const) {
        for (const valeur of [identites[cle].nom, identites[cle].prenom, identites[cle].mail, repondants[cle].jeton, repondants[cle].id]) {
          expect(corps).not.toContain(valeur)
        }
      }
    }
    const enregistrees = await analysesDuProjet()
    expect(enregistrees).toHaveLength(2)
    expect(enregistrees.find(a => a.type === 'fiche_repondant')).toMatchObject({ repondant_id: repondants.A.id, source: MODELE, nb_entretiens: 1 })
    expect(enregistrees.find(a => a.type === 'synthese')).toMatchObject({ source: MODELE, nb_entretiens: 3 })
  })
})

describe('lecture, liste et suppression des analyses', () => {
  it('liste avec filtres, lit, supprime, puis répond 404', async () => {
    const fiche = await enregistrerAnalyse(base.db, {
      projet_id: projetId, type: 'fiche_repondant', repondant_id: repondants.B.id, contenu: '# Fiche B', source: 'mcp', nb_entretiens: 1,
    })
    const tout = await appeler(analysesProjet.onRequestGet, 'GET', `/api/admin/projets/${projetId}/analyses`, undefined, projetId)
    expect(tout.statut).toBe(200)
    expect(tout.donnees.length).toBeGreaterThan(1)
    expect(tout.donnees[0]).not.toHaveProperty('contenu')

    const filtre = await appeler(analysesProjet.onRequestGet, 'GET',
      `/api/admin/projets/${projetId}/analyses?type=fiche_repondant&repondant_id=${repondants.B.id}`, undefined, projetId)
    expect(filtre.donnees).toHaveLength(1)
    expect(filtre.donnees[0]).toMatchObject({ id: fiche.id, portee: 'Répondant : Gaspard Martineau', taille: 9 })

    const parQuestionnaire = await appeler(analysesProjet.onRequestGet, 'GET',
      `/api/admin/projets/${projetId}/analyses?questionnaire_id=${qComptables.id}`, undefined, projetId)
    expect(parQuestionnaire.donnees.every((a: { questionnaire_id: string }) => a.questionnaire_id === qComptables.id)).toBe(true)

    expect((await appeler(analysesProjet.onRequestGet, 'GET', '/x?type=resume', undefined, projetId)).statut).toBe(400)
    expect((await appeler(analysesProjet.onRequestGet, 'GET', '/x', undefined, 'inconnu')).statut).toBe(404)

    const lue = await appeler(analyseId.onRequestGet, 'GET', '/x', undefined, fiche.id)
    expect(lue).toEqual({ statut: 200, donnees: fiche })

    const reponse = await (analyseId.onRequestDelete as Handler)(contexte('DELETE', '/x', undefined, fiche.id).valeur)
    expect(reponse.status).toBe(204)
    expect((await appeler(analyseId.onRequestGet, 'GET', '/x', undefined, fiche.id)).statut).toBe(404)
    expect((await appeler(analyseId.onRequestDelete, 'DELETE', '/x', undefined, fiche.id)).statut).toBe(404)
  })
})
