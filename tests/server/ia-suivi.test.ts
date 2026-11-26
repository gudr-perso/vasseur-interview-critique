import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fetchSuivi, type Suivi } from '../../server/ia/suivi'
import { calculerCout } from '../../shared/tarifs'
import { creerBaseDeTest } from '../helpers/d1'
import { apiSimulee, reponseCoupee, reponseJson, reponseSse } from '../helpers/api-messages'

const URL_MESSAGES = 'https://api.anthropic.com/v1/messages'
const MODELE = 'claude-opus-5-5'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
beforeAll(async () => { base = await creerBaseDeTest() })
afterAll(async () => { await base.fermer() })
afterEach(async () => {
  await base.db.prepare('DELETE FROM consommation_ia').run()
  vi.restoreAllMocks()
})

function monter(db: D1Database = base.db) {
  const promesses: Promise<unknown>[] = []
  const suivi: Suivi = { db, poste: 'analyse', projet_id: null, attendre: p => { promesses.push(p) } }
  return { suivi, attendre: async () => { await Promise.all(promesses) } }
}

const corps = JSON.stringify({ model: MODELE, stream: true, messages: [] })
const lignes = async () => (await base.db.prepare('SELECT * FROM consommation_ia').all<Record<string, unknown>>()).results

describe('fetchSuivi', () => {
  it('enregistre le flux complet', async () => {
    const api = apiSimulee(() => reponseSse(['a', 'b'], 'end_turn', 'claude-sonnet-5-5', {
      input_tokens: 100, cache_read_input_tokens: 40, cache_creation_input_tokens: 5, output_tokens: 70,
    }))
    const { suivi, attendre } = monter()
    suivi.projet_id = null
    const r = await fetchSuivi(suivi, api.fetch)(URL_MESSAGES, { method: 'POST', body: corps })
    await r.text()
    await attendre()
    const l = await lignes()
    const jetons = { entree: 100, sortie: 70, cache_lecture: 40, cache_ecriture: 5 }
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({
      poste: 'analyse', projet_id: null, modele: 'claude-sonnet-5-5',
      jetons_entree: 100, jetons_sortie: 70, cache_lecture: 40, cache_ecriture: 5,
      cout_micro_usd: calculerCout('claude-sonnet-5-5', jetons),
    })
  })

  it("laisse l'appelant lire le même texte, même statut et même type", async () => {
    const attendu = await reponseSse(['a', 'b']).text()
    const api = apiSimulee(() => reponseSse(['a', 'b']))
    const { suivi, attendre } = monter()
    const r = await fetchSuivi(suivi, api.fetch)(URL_MESSAGES, { method: 'POST', body: corps })
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('text/event-stream')
    expect(await r.text()).toBe(attendu)
    await attendre()
  })

  it('garde les compteurs reçus quand le flux se coupe', async () => {
    const api = apiSimulee(() => reponseCoupee('début'))
    const { suivi, attendre } = monter()
    const r = await fetchSuivi(suivi, api.fetch)(URL_MESSAGES, { method: 'POST', body: corps })
    await r.text()
    await attendre()
    const l = await lignes()
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ jetons_entree: 1, modele: 'x' })
  })

  it('lit les jetons d’une réponse JSON sans toucher au corps', async () => {
    const json = { id: 'm', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 7, output_tokens: 3, cache_read_input_tokens: null } }
    const api = apiSimulee(() => Response.json(json))
    const { suivi, attendre } = monter()
    const r = await fetchSuivi(suivi, api.fetch)(URL_MESSAGES, { method: 'POST', body: corps })
    expect(await r.json()).toEqual(json)
    await attendre()
    const l = await lignes()
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ modele: 'claude-sonnet-5-5', jetons_entree: 7, jetons_sortie: 3, cache_lecture: 0 })
  })

  it('n’enregistre rien sur une réponse en erreur', async () => {
    const api = apiSimulee(() => new Response('{"error":"surcharge"}', { status: 529 }))
    const { suivi, attendre } = monter()
    const r = await fetchSuivi(suivi, api.fetch)(URL_MESSAGES, { method: 'POST', body: corps })
    expect(r.status).toBe(529)
    expect(await r.text()).toBe('{"error":"surcharge"}')
    await attendre()
    expect(await lignes()).toHaveLength(0)
  })

  it('relance telle quelle une exception réseau, sans rien enregistrer', async () => {
    const erreur = new Error('réseau coupé')
    const { suivi, attendre } = monter()
    const sous = (async () => { throw erreur }) as unknown as typeof globalThis.fetch
    await expect(fetchSuivi(suivi, sous)(URL_MESSAGES, { method: 'POST', body: corps })).rejects.toBe(erreur)
    await attendre()
    expect(await lignes()).toHaveLength(0)
  })

  it('ignore les appels qui ne sont pas un POST sur /v1/messages', async () => {
    const api = apiSimulee(() => reponseSse(['a']), () => reponseSse(['a']))
    const { suivi, attendre } = monter()
    const f = fetchSuivi(suivi, api.fetch)
    await (await f('https://api.anthropic.com/v1/models', { method: 'GET' })).text()
    await (await f('https://api.anthropic.com/v1/models', { method: 'POST', body: corps })).text()
    await attendre()
    expect(await lignes()).toHaveLength(0)
  })

  it('accepte une requête sous forme d’objet Request', async () => {
    const api = apiSimulee(() => reponseSse(['a']))
    const { suivi, attendre } = monter()
    const r = await fetchSuivi(suivi, api.fetch)(new Request(URL_MESSAGES, { method: 'POST', body: corps }))
    await r.text()
    await attendre()
    expect(await lignes()).toHaveLength(1)
  })

  it('journalise une base en panne sans gêner l’appelant', async () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {})
    const enPanne = { prepare: () => { throw new Error('base en panne') } } as unknown as D1Database
    const api = apiSimulee(() => reponseSse(['a', 'b']))
    const { suivi, attendre } = monter(enPanne)
    const r = await fetchSuivi(suivi, api.fetch)(URL_MESSAGES, { method: 'POST', body: corps })
    expect(await r.text()).toBe(await reponseSse(['a', 'b']).text())
    await attendre()
    expect(erreur).toHaveBeenCalledWith("Coût de l'IA", 'base en panne')
  })

  it('prend le modèle demandé quand la réponse n’en donne pas', async () => {
    const api = apiSimulee(() => Response.json({ usage: { input_tokens: 4, output_tokens: 2 } }))
    const { suivi, attendre } = monter()
    await (await fetchSuivi(suivi, api.fetch)(URL_MESSAGES, { method: 'POST', body: corps })).text()
    await attendre()
    expect((await lignes())[0]).toMatchObject({ modele: MODELE, jetons_entree: 4 })
  })

  it('ne lève aucune exception sans `attendre`', async () => {
    const api = apiSimulee(() => reponseSse(['a']), () => reponseJson('x'))
    const f = fetchSuivi({ db: base.db, poste: 'cadrage', projet_id: null }, api.fetch)
    await (await f(URL_MESSAGES, { method: 'POST', body: corps })).text()
    await (await f(URL_MESSAGES, { method: 'POST', body: corps })).text()
  })
})
