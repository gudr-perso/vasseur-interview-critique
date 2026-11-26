import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as cadrage from '../../functions/api/admin/projets/[id]/cadrage/index'
import * as note from '../../functions/api/admin/projets/[id]/cadrage/note'
import * as resume from '../../functions/api/admin/projets/[id]/cadrage/resume'
import * as tour from '../../functions/api/admin/projets/[id]/cadrage/tour'
import { route } from '../../server/api'
import { lireGuide } from '../../server/guides'
import {
  consigneCadrage, MESSAGE_PLAFOND, repondreNoteCadrage, repondreResumeContexte, repondreTourCadrage, SECTION_ADMIN,
  type OptionsAppelIa,
} from '../../server/ia/cadrage'
import { ajouterMessage, contexteCadrage, listerMessages } from '../../server/services/cadrage'
import { ajouterDocument, creerProjet, lireProjet, modifierProjet } from '../../server/services/projets'
import type { EnteteTourCadrage, EtatDialogue, SuccesTourCadrage } from '../../shared/cadrage'
import { creerBaseDeTest } from '../helpers/d1'
import { analyserFlux, apiSimulee, contexteRoute, reponseCoupee, reponseJson, reponseSse } from '../helpers/api-messages'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
beforeAll(async () => { base = await creerBaseDeTest() })
afterAll(async () => { await base.fermer() })

const MODELE = 'claude-modele-cadrage-du-projet'
type Handler = (contexte: never) => Promise<Response>
type TypeDemande = 'evolution_simple' | 'amelioration' | 'nouvelle_fonctionnalite'

async function nouveauProjet(type_demande: TypeDemande = 'nouvelle_fonctionnalite', avecDocument = true) {
  const projet = await creerProjet(base.db, {
    titre: 'Saisie des temps', type_demande, description: 'Les comptables saisissent trop lentement.', modeles: { cadrage: MODELE },
  })
  if (avecDocument) await ajouterDocument(base.db, projet.id, { nom: 'Compte rendu', contenu: 'Réunion du 3 novembre : la saisie prend une heure par jour.' })
  return projet.id
}

const avec = (repondre: (c: never, o: OptionsAppelIa) => Promise<Response>, options: OptionsAppelIa) =>
  route<'id'>(c => repondre(c as never, { reglages: { intervalleVieMs: 20 }, ...options })) as Handler

async function lancer(handler: Handler, id: string, corps?: unknown, cle?: string) {
  const ctx = contexteRoute(base.db, 'POST', id, corps, cle)
  const reponse = await handler(ctx.valeur)
  return { reponse, ctx }
}

/** Identifiant du dernier message du dialogue, `null` s'il est vide : ce que le client envoie dans `apres`. */
async function dernierId(id: string): Promise<string | null> {
  return (await listerMessages(base.db, id)).at(-1)?.id ?? null
}

/** Lance un tour avec l'API simulée et lit tout le flux ; `apres` est par défaut le dernier message enregistré. */
async function tourAvec(id: string, api: ReturnType<typeof apiSimulee>, corps: { texte?: string; apres?: string | null } = {}) {
  const complet = 'apres' in corps ? corps : { ...corps, apres: await dernierId(id) }
  const { reponse, ctx } = await lancer(avec(repondreTourCadrage, { fetch: api.fetch }), id, complet)
  expect(reponse.status).toBe(200)
  const flux = analyserFlux<EnteteTourCadrage, SuccesTourCadrage>(await reponse.text())
  await ctx.tache()
  return flux
}

const question = (message: string) => () => reponseJson({ fin: false, message })

describe('consigne du cadrage', () => {
  it("reprend le guide sans les outils, puis la section propre à l'admin", () => {
    const consigne = consigneCadrage()
    expect(consigne.startsWith('# Guide de cadrage')).toBe(true)
    expect(consigne.endsWith(SECTION_ADMIN)).toBe(true)
    expect(consigne).not.toContain('Avec les outils')
    for (const outil of ['lire_projet', 'lire_document', 'modifier_projet', 'lire_guide']) expect(consigne).not.toContain(outil)
    for (const repere of ['une seule question à la fois', 'Ne redemande jamais', 'Points encore ouverts']) expect(consigne).toContain(repere)
    // La méthode est celle que lit Claude via le MCP, mot pour mot.
    expect(lireGuide('cadrage').startsWith(consigne.slice(0, consigne.indexOf(SECTION_ADMIN)).trimEnd())).toBe(true)
    for (const repere of ['une seule question à la fois', "N'écris pas la note pendant le dialogue", 'document tronqué', 'sans préambule']) {
      expect(SECTION_ADMIN).toContain(repere)
    }
  })
})

describe('refus avant tout appel', () => {
  it("répond 503 sans clé API, sans rien enregistrer ni appeler l'IA", async () => {
    const id = await nouveauProjet()
    const api = apiSimulee()
    for (const repondre of [repondreTourCadrage, repondreNoteCadrage, repondreResumeContexte]) {
      const { reponse } = await lancer(avec(repondre, { fetch: api.fetch }), id, { texte: 'Bonjour', apres: null }, '')
      expect(reponse.status).toBe(503)
      expect(((await reponse.json()) as { error: { message: string } }).error.message).toMatch(/clé non configurée.*MCP/)
    }
    expect(api.appel).not.toHaveBeenCalled()
    expect(await listerMessages(base.db, id)).toEqual([])
  })

  it('répond 404 pour un projet inconnu', async () => {
    const api = apiSimulee()
    for (const repondre of [repondreTourCadrage, repondreNoteCadrage, repondreResumeContexte]) {
      expect((await lancer(avec(repondre, { fetch: api.fetch }), 'inconnu', { apres: null })).reponse.status).toBe(404)
    }
    expect(api.appel).not.toHaveBeenCalled()
  })

  it("refuse de sauter une question, et une seconde réponse avant celle de l'IA", async () => {
    const id = await nouveauProjet()
    const q = await ajouterMessage(base.db, id, 'question', 'Qui saisit les temps ?')
    const api = apiSimulee()
    const sansTexte = await lancer(avec(repondreTourCadrage, { fetch: api.fetch }), id, { apres: q.id })
    expect(sansTexte.reponse.status).toBe(400)
    const r = await ajouterMessage(base.db, id, 'reponse', 'Le comptable.')
    const deuxieme = await lancer(avec(repondreTourCadrage, { fetch: api.fetch }), id, { texte: 'Et le gérant.', apres: r.id })
    expect(deuxieme.reponse.status).toBe(409)
    expect(api.appel).not.toHaveBeenCalled()
    expect((await listerMessages(base.db, id)).map(m => m.type)).toEqual(['question', 'reponse'])
  })

  it('refuse une réponse vide ou trop longue, sans appeler l\'IA', async () => {
    const id = await nouveauProjet()
    const api = apiSimulee()
    expect((await lancer(avec(repondreTourCadrage, { fetch: api.fetch }), id, { texte: '  ', apres: null })).reponse.status).toBe(400)
    expect((await lancer(avec(repondreTourCadrage, { fetch: api.fetch }), id, { texte: 'x'.repeat(4001), apres: null })).reponse.status).toBe(400)
    expect(api.appel).not.toHaveBeenCalled()
  })
})

describe('POST …/cadrage/tour', () => {
  it('envoie la consigne, le contexte en bloc mis en cache, le modèle du projet, une sortie structurée et un effort moyen', async () => {
    const id = await nouveauProjet()
    const api = apiSimulee(question('Qui fait cette saisie aujourd\'hui, et à quel moment ?'))
    const flux = await tourAvec(id, api)
    expect(flux.entete).toMatchObject({ plafond: 12, questions_posees: 0, contexte_tronque: false })
    expect(flux.texte).toBe('')
    expect(flux.fin).toMatchObject({ type: 'succes', fin: false, message: 'Qui fait cette saisie aujourd\'hui, et à quel moment ?' })

    const [corps] = api.lus()
    expect(corps.model).toBe(MODELE)
    expect(corps.stream).toBe(true)
    expect(corps).not.toHaveProperty('thinking')
    expect(corps.system).toEqual([
      { type: 'text', text: consigneCadrage() },
      { type: 'text', text: (await contexteCadrage(base.db, id)).texte, cache_control: { type: 'ephemeral' } },
    ])
    expect(corps.system[1].text).toContain('la saisie prend une heure par jour')
    expect(corps.output_config.effort).toBe('medium')
    expect(corps.output_config.format.type).toBe('json_schema')
    expect(corps.output_config.format.schema).toMatchObject({
      type: 'object', required: ['fin', 'message'], additionalProperties: false,
      properties: { fin: { type: 'boolean' }, message: { type: 'string' } },
    })
    expect(corps.messages.at(-1)).toEqual({ role: 'user', content: expect.stringContaining('Questions déjà posées : 0 sur 12') })

    const messages = await listerMessages(base.db, id)
    expect(messages.map(m => [m.role, m.type, m.contenu])).toEqual([['ia', 'question', 'Qui fait cette saisie aujourd\'hui, et à quel moment ?']])
  })

  it("enregistre la réponse puis la question suivante, et garde d'un tour à l'autre un préfixe identique octet pour octet", async () => {
    const id = await nouveauProjet()
    const api = apiSimulee(question('Qui saisit ?'), question('Avec quel écran ?'))
    await tourAvec(id, api)
    const flux = await tourAvec(id, api, { texte: '  Le comptable, chaque soir.  ' })
    expect(flux.entete).toMatchObject({ plafond: 12, questions_posees: 1 })
    expect(flux.fin).toMatchObject({ type: 'succes', fin: false, message: 'Avec quel écran ?' })
    // La charge utile porte les messages écrits pendant ce tour : de quoi compléter le fil si sa relecture échoue.
    const ecrits = await listerMessages(base.db, id)
    expect(flux.fin.type === 'succes' && flux.fin.messages).toEqual(ecrits.slice(1))

    // Préfixe mis en cache : tout ce qui précède les messages, bloc de contexte et son marqueur compris.
    const [brut1, brut2] = api.corps
    const finPrefixe = brut1.indexOf(',"messages":')
    expect(finPrefixe).toBeGreaterThan(0)
    expect(brut2.slice(0, finPrefixe)).toBe(brut1.slice(0, finPrefixe))
    expect(brut1.slice(0, finPrefixe)).toContain('"cache_control":{"type":"ephemeral"}')
    // Les messages ne font que s'allonger : l'historique du premier tour (sans son rappel) ouvre celui du second.
    const [tour1, tour2] = api.lus()
    const historique1 = tour1.messages.slice(0, -1)
    expect(tour2.messages.slice(0, historique1.length)).toEqual(historique1)
    expect(tour2.messages.slice(historique1.length, -1)).toEqual([
      { role: 'assistant', content: JSON.stringify({ fin: false, message: 'Qui saisit ?' }) },
      { role: 'user', content: 'Le comptable, chaque soir.' },
    ])

    expect((await listerMessages(base.db, id)).map(m => [m.type, m.contenu])).toEqual([
      ['question', 'Qui saisit ?'], ['reponse', 'Le comptable, chaque soir.'], ['question', 'Avec quel écran ?'],
    ])
  })

  it("enregistre la conclusion de l'IA ; le dialogue est alors conclu, même après rechargement", async () => {
    const id = await nouveauProjet('amelioration')
    const api = apiSimulee(question('Qui saisit ?'), () => reponseJson({ fin: true, message: "J'ai assez d'éléments : le cadrage peut être conclu." }))
    await tourAvec(id, api)
    const flux = await tourAvec(id, api, { texte: 'Le comptable.' })
    expect(flux.fin).toMatchObject({ type: 'succes', fin: true, message: "J'ai assez d'éléments : le cadrage peut être conclu." })

    const etat = await (cadrage.onRequestGet as unknown as Handler)(contexteRoute(base.db, 'GET', id).valeur)
    expect(await etat.json()).toEqual({
      messages: expect.any(Array), plafond: 6, questions_posees: 1, conclu: true,
    } satisfies Record<keyof EtatDialogue, unknown>)
    const suite = await lancer(avec(repondreTourCadrage, { fetch: api.fetch }), id, { texte: 'Autre chose ?', apres: await dernierId(id) })
    expect(suite.reponse.status).toBe(409)
    expect(api.appel).toHaveBeenCalledTimes(2)
  })

  it("conclut sans appeler l'IA quand le plafond est atteint (3 questions pour une évolution simple)", async () => {
    const id = await nouveauProjet('evolution_simple')
    const api = apiSimulee(question('Q1 ?'), question('Q2 ?'), question('Q3 ?'))
    await tourAvec(id, api)
    await tourAvec(id, api, { texte: 'R1' })
    await tourAvec(id, api, { texte: 'R2' })
    expect(api.lus()[2].messages.at(-1).content).toContain("Il ne t'en reste qu'une")
    const flux = await tourAvec(id, api, { texte: 'R3' })
    expect(flux.entete).toMatchObject({ plafond: 3, questions_posees: 3 })
    expect(flux.fin).toMatchObject({ type: 'succes', fin: true, message: MESSAGE_PLAFOND })
    expect(api.appel).toHaveBeenCalledTimes(3)
    const messages = await listerMessages(base.db, id)
    expect(messages.map(m => m.type)).toEqual(['question', 'reponse', 'question', 'reponse', 'question', 'reponse', 'conclusion'])
    expect(messages.at(-1)!.contenu).toBe(MESSAGE_PLAFOND)
  })

  it("signale un refus, une réponse tronquée ou hors format, sans enregistrer de message de l'IA ni refaire l'appel", async () => {
    const cas: [() => Response, RegExp][] = [
      [() => reponseSse(['Je ne peux pas'], 'refusal'), /refusé/],
      [() => reponseSse(['{"fin":false,"mess'], 'max_tokens'), /tronquée/],
      [() => reponseJson('pas du JSON'), /illisible/],
      [() => reponseJson({ fin: false, message: 'x'.repeat(2001) }), /hors du format/],
      [() => reponseCoupee('{"fin":'), /interrompu/],
    ]
    for (const [reponse, motif] of cas) {
      const id = await nouveauProjet()
      const api = apiSimulee(reponse)
      const flux = await tourAvec(id, api, { texte: 'Je commence par vous dire que tout est lent.' })
      expect(flux.fin.type, String(motif)).toBe('erreur')
      expect(flux.fin.type === 'erreur' && flux.fin.message).toMatch(motif)
      expect(api.appel).toHaveBeenCalledTimes(1)
      // La réponse de l'admin reste : un tour sans texte relance l'IA.
      expect((await listerMessages(base.db, id)).map(m => m.type)).toEqual(['reponse'])
    }
  })

  it("relance l'IA par un tour sans texte après un échec", async () => {
    const id = await nouveauProjet()
    const api = apiSimulee(() => reponseSse(['Non'], 'refusal'), question('Qui saisit ?'))
    expect((await tourAvec(id, api, { texte: 'Tout est lent.' })).fin.type).toBe('erreur')
    expect((await tourAvec(id, api, {})).fin).toMatchObject({ type: 'succes', fin: false, message: 'Qui saisit ?' })
    expect((await listerMessages(base.db, id)).map(m => m.type)).toEqual(['reponse', 'question'])
  })

  it('signale dans l\'en-tête un contexte tronqué', async () => {
    const id = await nouveauProjet('amelioration', false)
    await ajouterDocument(base.db, id, { nom: 'Gros', contenu: 'a'.repeat(200_000) })
    await ajouterDocument(base.db, id, { nom: 'Gros 2', contenu: 'b'.repeat(200_000) })
    const flux = await tourAvec(id, apiSimulee(question('Q ?')))
    expect(flux.entete.contexte_tronque).toBe(true)
  })
})

describe('POST …/cadrage/tour : tours concurrents', () => {
  /** IA simulée lente : la réponse attend `liberer()`. */
  function iaLente(reponse: () => Response) {
    let liberer!: () => void
    const attente = new Promise<void>(r => { liberer = r })
    return { reponse: async () => { await attente; return reponse() }, liberer }
  }

  const tourBrut = (id: string, api: ReturnType<typeof apiSimulee>, corps: unknown) =>
    lancer(avec(repondreTourCadrage, { fetch: api.fetch }), id, corps)

  it('refuse un tour envoyé sur un fil périmé (409), sans appeler l\'IA ni rien écrire', async () => {
    const id = await nouveauProjet()
    const q1 = await ajouterMessage(base.db, id, 'question', 'Q1 ?')
    await ajouterMessage(base.db, id, 'reponse', 'R1')
    await ajouterMessage(base.db, id, 'question', 'Q2 ?')
    const api = apiSimulee()
    for (const corps of [{ texte: 'Réponse à Q1, vue dans un vieil onglet', apres: q1.id }, { apres: null }, { texte: 'R', apres: 'inconnu' }]) {
      const { reponse } = await tourBrut(id, api, corps)
      expect(reponse.status).toBe(409)
      expect(((await reponse.json()) as { error: { message: string } }).error.message).toBe('Le dialogue a changé entre-temps : il a été rechargé.')
    }
    expect(api.appel).not.toHaveBeenCalled()
    expect(await listerMessages(base.db, id)).toHaveLength(3)
  })

  it('deux réponses simultanées à la même question : une seule aboutit, un seul appel, plafond respecté', async () => {
    const id = await nouveauProjet('evolution_simple')
    await ajouterMessage(base.db, id, 'question', 'Q1 ?')
    await ajouterMessage(base.db, id, 'reponse', 'R1')
    const q2 = await ajouterMessage(base.db, id, 'question', 'Q2 ?')
    const lente = iaLente(() => reponseJson({ fin: false, message: 'Q3 ?' }))
    const api = apiSimulee(lente.reponse, question('Q3 bis ?'))
    const [a, b] = await Promise.all([
      tourBrut(id, api, { texte: 'R2 depuis l\'onglet A', apres: q2.id }),
      tourBrut(id, api, { texte: 'R2 depuis l\'onglet B', apres: q2.id }),
    ])
    expect([a.reponse.status, b.reponse.status].sort()).toEqual([200, 409])
    lente.liberer()
    const gagnant = a.reponse.status === 200 ? a : b
    const flux = analyserFlux<EnteteTourCadrage, SuccesTourCadrage>(await gagnant.reponse.text())
    await gagnant.ctx.tache()
    expect(flux.fin).toMatchObject({ type: 'succes', fin: false, message: 'Q3 ?' })
    expect(api.appel).toHaveBeenCalledTimes(1)
    const messages = await listerMessages(base.db, id)
    expect(messages.map(m => m.type)).toEqual(['question', 'reponse', 'question', 'reponse', 'question'])
    expect(messages.filter(m => m.type === 'reponse' && m.contenu.startsWith('R2'))).toHaveLength(1)
  })

  it('deux relances simultanées : seule la première réponse de l\'IA est écrite, la seconde est abandonnée', async () => {
    const id = await nouveauProjet('evolution_simple')
    await ajouterMessage(base.db, id, 'question', 'Q1 ?')
    const r1 = await ajouterMessage(base.db, id, 'reponse', 'R1')
    const premiere = iaLente(() => reponseJson({ fin: false, message: 'Q2 (premier tour) ?' }))
    const seconde = iaLente(() => reponseJson({ fin: false, message: 'Q2 (second tour) ?' }))
    const api = apiSimulee(premiere.reponse, seconde.reponse)
    const [a, b] = await Promise.all([tourBrut(id, api, { apres: r1.id }), tourBrut(id, api, { apres: r1.id })])
    expect([a.reponse.status, b.reponse.status]).toEqual([200, 200])
    // Rien à écrire avant l'appel : les deux tours appellent l'IA, mais un seul message en sort.
    premiere.liberer()
    await vi.waitFor(async () => expect(await listerMessages(base.db, id)).toHaveLength(3))
    seconde.liberer()
    const fins = await Promise.all([a, b].map(async t => {
      const flux = analyserFlux<EnteteTourCadrage, SuccesTourCadrage>(await t.reponse.text())
      await t.ctx.tache()
      return flux.fin
    }))
    expect(fins).toContainEqual(expect.objectContaining({ type: 'succes', message: 'Q2 (premier tour) ?' }))
    expect(fins).toContainEqual({ type: 'erreur', message: 'Le dialogue a changé entre-temps : il a été rechargé.' })
    expect(api.appel).toHaveBeenCalledTimes(2)
    expect((await listerMessages(base.db, id)).map(m => m.contenu)).toEqual(['Q1 ?', 'R1', 'Q2 (premier tour) ?'])
  })

  it("abandonne la réponse de l'IA si le dialogue a été recommencé pendant le tour", async () => {
    const id = await nouveauProjet()
    const q = await ajouterMessage(base.db, id, 'question', 'Q1 ?')
    const lente = iaLente(() => reponseJson({ fin: false, message: 'Q2 ?' }))
    const api = apiSimulee(lente.reponse)
    const { reponse, ctx } = await tourBrut(id, api, { texte: 'R1', apres: q.id })
    expect(reponse.status).toBe(200)
    await (cadrage.onRequestDelete as unknown as Handler)(contexteRoute(base.db, 'DELETE', id).valeur)
    lente.liberer()
    const flux = analyserFlux<EnteteTourCadrage, SuccesTourCadrage>(await reponse.text())
    await ctx.tache()
    expect(flux.fin).toEqual({ type: 'erreur', message: 'Le dialogue a changé entre-temps : il a été rechargé.' })
    expect(await listerMessages(base.db, id)).toEqual([])
  })

  it('deux réponses simultanées au plafond : une seule conclusion, sans appel', async () => {
    const id = await nouveauProjet('evolution_simple')
    for (const [type, contenu] of [['question', 'Q1 ?'], ['reponse', 'R1'], ['question', 'Q2 ?'], ['reponse', 'R2']] as const) {
      await ajouterMessage(base.db, id, type, contenu)
    }
    const q3 = await ajouterMessage(base.db, id, 'question', 'Q3 ?')
    const api = apiSimulee()
    const tours = await Promise.all([tourBrut(id, api, { texte: 'R3 A', apres: q3.id }), tourBrut(id, api, { texte: 'R3 B', apres: q3.id })])
    for (const t of tours) {
      if (t.reponse.status === 200) analyserFlux(await t.reponse.text())
      await t.ctx.tache()
    }
    expect(tours.map(t => t.reponse.status).sort()).toEqual([200, 409])
    expect(api.appel).not.toHaveBeenCalled()
    expect((await listerMessages(base.db, id)).map(m => m.type).slice(-2)).toEqual(['reponse', 'conclusion'])
  })
})

describe('POST …/cadrage/note et …/cadrage/resume', () => {
  it("n'envoie jamais la note de cadrage pour le résumé de contexte", async () => {
    const id = await nouveauProjet()
    const repere = 'REPERE-HYPOTHESE-INTERNE-7f3a'
    await modifierProjet(base.db, id, { note_cadrage: `## Hypothèses à vérifier\n${repere} : le trésorier pense que la saisie est inutile.` })
    const api = apiSimulee(() => reponseSse(['Résumé.']))
    const { reponse, ctx } = await lancer(avec(repondreResumeContexte, { fetch: api.fetch }), id)
    analyserFlux(await reponse.text())
    await ctx.tache()
    expect(api.corps).toHaveLength(1)
    expect(api.corps[0]).not.toContain(repere)
    expect(api.corps[0]).not.toContain('Note de cadrage existante')
    expect(api.lus()[0].system[1].text).toContain('la saisie prend une heure par jour')
  })

  it("rédige la note au fil de l'eau d'après le contexte et le dialogue, sans rien enregistrer", async () => {
    const id = await nouveauProjet()
    await modifierProjet(base.db, id, { note_cadrage: 'Ancienne note.' })
    await ajouterMessage(base.db, id, 'question', 'Qui saisit ?')
    await ajouterMessage(base.db, id, 'reponse', 'Le comptable.')
    const avant = await lireProjet(base.db, id)
    const api = apiSimulee(() => reponseSse(['## Objectif\n', 'Saisir plus vite.']))
    const { reponse, ctx } = await lancer(avec(repondreNoteCadrage, { fetch: api.fetch }), id)
    const flux = analyserFlux(await reponse.text())
    await ctx.tache()
    expect(flux.entete).toMatchObject({ contexte_tronque: false })
    expect(flux.texte).toBe('## Objectif\nSaisir plus vite.')
    expect(flux.fin).toEqual({ type: 'succes', tronquee: false })

    const [corps] = api.lus()
    expect(corps.model).toBe(MODELE)
    expect(corps.output_config).toEqual({ effort: 'high' })
    expect(corps).not.toHaveProperty('thinking')
    // Même consigne et même contexte que le dialogue : le préfixe mis en cache est partagé.
    expect(corps.system[0].text).toBe(consigneCadrage())
    expect(corps.system[1]).toEqual({ type: 'text', text: (await contexteCadrage(base.db, id)).texte, cache_control: { type: 'ephemeral' } })
    expect(corps.system[1].text).toContain('Ancienne note.')
    expect(corps.messages.slice(1, 3)).toEqual([
      { role: 'assistant', content: JSON.stringify({ fin: false, message: 'Qui saisit ?' }) },
      { role: 'user', content: 'Le comptable.' },
    ])
    expect(corps.messages.at(-1).content).toContain('Rédige maintenant la note de cadrage')

    const apres = await lireProjet(base.db, id)
    expect(apres.note_cadrage).toBe('Ancienne note.')
    expect(apres.maj_le).toBe(avant.maj_le)
    expect(await listerMessages(base.db, id)).toHaveLength(2)
  })

  it('rédige le résumé sans le dialogue, sans rien enregistrer, et signale une réponse tronquée', async () => {
    const id = await nouveauProjet()
    await ajouterMessage(base.db, id, 'question', 'Question à ne pas transmettre ?')
    const api = apiSimulee(() => reponseSse(['La demande porte sur la saisie des temps.'], 'max_tokens'))
    const { reponse, ctx } = await lancer(avec(repondreResumeContexte, { fetch: api.fetch }), id)
    const flux = analyserFlux(await reponse.text())
    await ctx.tache()
    expect(flux.texte).toBe('La demande porte sur la saisie des temps.')
    expect(flux.fin).toEqual({ type: 'succes', tronquee: true })
    const [corps] = api.lus()
    expect(corps.output_config).toEqual({ effort: 'medium' })
    expect(corps.system[1].cache_control).toEqual({ type: 'ephemeral' })
    expect(corps.messages).toHaveLength(1)
    expect(corps.messages[0].content).toContain('vingtaine de lignes')
    expect(JSON.stringify(corps.messages)).not.toContain('Question à ne pas transmettre')
    expect((await lireProjet(base.db, id)).resume_contexte).toBe('')
  })

  it('refuse le résumé d\'un projet sans description ni document', async () => {
    const projet = await creerProjet(base.db, { titre: 'Vide', type_demande: 'amelioration' })
    const api = apiSimulee()
    expect((await lancer(avec(repondreResumeContexte, { fetch: api.fetch }), projet.id)).reponse.status).toBe(400)
    expect(api.appel).not.toHaveBeenCalled()
  })

  it('signale un refus ou un texte vide par une ligne d\'erreur', async () => {
    for (const [repondre, simulee, motif] of [
      [repondreNoteCadrage, () => reponseSse(['Je ne peux pas.'], 'refusal'), /refusé de rédiger la note de cadrage/],
      [repondreResumeContexte, () => reponseSse(['  \n']), /aucun texte/],
    ] as const) {
      const id = await nouveauProjet()
      const { reponse, ctx } = await lancer(avec(repondre as never, { fetch: apiSimulee(simulee).fetch }), id)
      const flux = analyserFlux(await reponse.text())
      await ctx.tache()
      expect(flux.fin.type === 'erreur' && flux.fin.message).toMatch(motif)
    }
  })
})

describe('GET et DELETE …/cadrage, routes', () => {
  it('lit le dialogue et son état, puis l\'efface sans toucher à la note', async () => {
    const id = await nouveauProjet('evolution_simple')
    await modifierProjet(base.db, id, { note_cadrage: 'Note gardée.' })
    await ajouterMessage(base.db, id, 'question', 'Qui saisit ?')
    await ajouterMessage(base.db, id, 'reponse', 'Le comptable.')
    const lire = async () => {
      const reponse = await (cadrage.onRequestGet as unknown as Handler)(contexteRoute(base.db, 'GET', id).valeur)
      return { statut: reponse.status, donnees: await reponse.json() as EtatDialogue }
    }
    const { statut, donnees } = await lire()
    expect(statut).toBe(200)
    expect(donnees).toMatchObject({ plafond: 3, questions_posees: 1, conclu: false })
    expect(donnees.messages.map(m => [m.role, m.type, m.contenu])).toEqual([['ia', 'question', 'Qui saisit ?'], ['admin', 'reponse', 'Le comptable.']])

    const efface = await (cadrage.onRequestDelete as unknown as Handler)(contexteRoute(base.db, 'DELETE', id).valeur)
    expect(efface.status).toBe(204)
    expect((await lire()).donnees).toEqual({ messages: [], plafond: 3, questions_posees: 0, conclu: false })
    expect((await lireProjet(base.db, id)).note_cadrage).toBe('Note gardée.')
    const inconnu = await (cadrage.onRequestGet as unknown as Handler)(contexteRoute(base.db, 'GET', 'inconnu').valeur)
    expect(inconnu.status).toBe(404)
  })

  it('expose les trois routes en flux', () => {
    for (const module of [tour, note, resume]) expect(typeof module.onRequestPost).toBe('function')
  })
})
