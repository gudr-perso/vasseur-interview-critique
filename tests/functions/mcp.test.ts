import { Client, StreamableHTTPClientTransport, type ClientOptions } from '@modelcontextprotocol/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { onRequest as parJeton } from '../../functions/mcp/[jeton]'
import { onRequest as parEnTete } from '../../functions/mcp/index'
import { creerBaseDeTest } from '../helpers/d1'

const JETON = 'jeton-de-test-0123456789'
let base: Awaited<ReturnType<typeof creerBaseDeTest>>

beforeAll(async () => { base = await creerBaseDeTest() })
afterAll(async () => { await base.fermer() })

function contexte(requete: Request, jeton?: string, env: object = { MCP_TOKEN: JETON, DB: base.db }) {
  return { request: requete, env, params: jeton === undefined ? {} : { jeton } } as never
}

const corpsListe = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })

function post(url: string, enTetes: Record<string, string> = {}): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...enTetes },
    body: corpsListe,
  })
}

describe('contrôle du jeton', () => {
  it('refuse un mauvais jeton dans l\'URL', async () => {
    const reponse = await parJeton(contexte(post('https://exemple.test/mcp/faux'), 'faux'))
    expect(reponse.status).toBe(401)
  })

  it('refuse une requête sans en-tête Authorization, ou avec un mauvais jeton', async () => {
    expect((await parEnTete(contexte(post('https://exemple.test/mcp')))).status).toBe(401)
    const mauvais = post('https://exemple.test/mcp', { Authorization: 'Bearer faux' })
    expect((await parEnTete(contexte(mauvais))).status).toBe(401)
  })

  it('répond 500 si MCP_TOKEN n\'est pas configuré, même avec un jeton vide', async () => {
    const reponse = await parJeton(contexte(post('https://exemple.test/mcp/'), '', { DB: base.db }))
    expect(reponse.status).toBe(500)
  })
})

/**
 * Le client du SDK parle par défaut le protocole 2025 (poignée de main `initialize`) ;
 * avec `versionNegotiation: { mode: 'auto' }` il sonde le serveur et passe au protocole 2026-07-28.
 * Les deux doivent être servis par les mêmes points d'accès.
 */
const GENERATIONS: { nom: string; options: ClientOptions; ere: string }[] = [
  { nom: 'client 2025 (initialize)', options: {}, ere: 'legacy' },
  { nom: 'client 2026 (négociation de version)', options: { versionNegotiation: { mode: 'auto' } }, ere: 'modern' },
]

describe.each(GENERATIONS)('protocole, via le client officiel — $nom', ({ options, ere }) => {
  /** En-têtes de toutes les réponses reçues par le client, pour contrôler l'absence de session. */
  let reponses: Response[] = []

  async function connecter(url: string, enTetes: Record<string, string>, traiter: (r: Request) => Promise<Response>) {
    reponses = []
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: enTetes },
      fetch: async (entree, init) => {
        const reponse = await traiter(new Request(entree, init))
        reponses.push(reponse)
        return reponse
      },
    })
    const client = new Client({ name: 'test', version: '1.0.0' }, options)
    await client.connect(transport)
    expect(client.getProtocolEra()).toBe(ere)
    return client
  }

  it('liste les outils et en appelle un, jeton dans l\'URL', async () => {
    const client = await connecter(`https://exemple.test/mcp/${JETON}`, {}, r => parJeton(contexte(r, JETON)))
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name)).toContain('creer_projet')
    expect(tools).toHaveLength(12)
    expect(tools.find(t => t.name === 'lire_projet')?.inputSchema.required).toEqual(['projet_id'])
    expect(tools.find(t => t.name === 'creer_projet')?.inputSchema.required).toEqual(['titre', 'type_demande'])
    expect(tools.filter(t => t.annotations?.readOnlyHint).map(t => t.name).sort()).toEqual(
      ['lire_guide', 'lire_logiciel', 'lire_projet', 'lire_questionnaire', 'lister_logiciels', 'lister_projets'],
    )
    for (const outil of tools) expect(outil.annotations?.readOnlyHint, outil.name).toBeTypeOf('boolean')

    const nom = `Zeendoc ${ere}`
    const resultat = await client.callTool({ name: 'enregistrer_logiciel', arguments: { nom } })
    const contenu = resultat.content as { type: string; text: string }[]
    expect(JSON.parse(contenu[0].text)).toMatchObject({ nom })
    await client.close()
  })

  it('fonctionne aussi avec le jeton en en-tête Bearer', async () => {
    const client = await connecter(
      'https://exemple.test/mcp', { Authorization: `Bearer ${JETON}` }, r => parEnTete(contexte(r)),
    )
    const resultat = await client.callTool({ name: 'lister_logiciels', arguments: {} })
    const contenu = resultat.content as { type: string; text: string }[]
    expect((JSON.parse(contenu[0].text) as { nom: string }[]).map(l => l.nom)).toContain(`Zeendoc ${ere}`)
    await client.close()
  })

  it('renvoie une erreur d\'outil lisible, sans casser la session', async () => {
    const client = await connecter(`https://exemple.test/mcp/${JETON}`, {}, r => parJeton(contexte(r, JETON)))
    const resultat = await client.callTool({ name: 'lire_projet', arguments: { projet_id: 'inconnu' } })
    expect(resultat.isError).toBe(true)
    expect((resultat.content as { text: string }[])[0].text).toBe('Projet introuvable : inconnu')

    const invalide = await client.callTool({ name: 'creer_projet', arguments: { titre: 'X', type_demande: 'autre' } })
    expect(invalide.isError).toBe(true)
    expect((invalide.content as { text: string }[])[0].text).toContain('type_demande')

    expect((await client.listTools()).tools).toHaveLength(12)
    await client.close()
  })

  it('ne crée aucune session : chaque requête est servie isolément', async () => {
    const client = await connecter(`https://exemple.test/mcp/${JETON}`, {}, r => parJeton(contexte(r, JETON)))
    await client.listTools()
    await client.close()
    expect(reponses.length).toBeGreaterThan(1)
    for (const reponse of reponses) expect(reponse.headers.get('mcp-session-id')).toBeNull()
  })
})

describe('sans état', () => {
  it('sert un appel d\'outil 2025 sans poignée de main préalable', async () => {
    const requete = post(`https://exemple.test/mcp/${JETON}`)
    const reponse = await parJeton(contexte(requete, JETON))
    expect(reponse.status).toBe(200)
    expect(reponse.headers.get('mcp-session-id')).toBeNull()
    expect(await reponse.text()).toContain('publier_questionnaire')
  })
})
