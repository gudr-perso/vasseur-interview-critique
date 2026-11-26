import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { onRequest as garde } from '../../functions/api/admin/_middleware'
import * as couts from '../../functions/api/admin/couts'
import * as coutsDuProjet from '../../functions/api/admin/projets/[id]/couts'
import { enregistrerConsommation } from '../../server/services/couts'
import { creerProjet } from '../../server/services/projets'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
let projet: string

const SONNET = 'claude-sonnet-5-5' // entrée 2 $/M : 1 jeton = 2 micro-dollars
const jetons = (entree: number) => ({ entree, sortie: 0, cache_lecture: 0, cache_ecriture: 0 })

beforeAll(async () => {
  base = await creerBaseDeTest()
  projet = (await creerProjet(base.db, { titre: 'Saisie des temps', type_demande: 'amelioration' })).id
  await enregistrerConsommation(base.db, { poste: 'cadrage', projet_id: projet, modele: SONNET, jetons: jetons(100) })
  await enregistrerConsommation(base.db, { poste: 'analyse', projet_id: projet, modele: SONNET, jetons: jetons(50) })
  await enregistrerConsommation(base.db, { poste: 'interview_critique', projet_id: null, modele: SONNET, jetons: jetons(10) })
  await enregistrerConsommation(base.db, { poste: 'interview', projet_id: projet, modele: 'modele-inconnu', jetons: jetons(10) })
})
afterAll(async () => { await base.fermer() })

type Handler = (contexte: never) => Promise<Response> | Response

async function appeler(handler: Handler | undefined, chemin: string, id?: string): Promise<{ statut: number; donnees: any }> {
  if (!handler) throw new Error(`Aucun handler pour ${chemin}`)
  const request = new Request(`https://exemple.test${chemin}`)
  const reponse = await handler({ request, env: { DB: base.db }, params: id ? { id } : {} } as never)
  return { statut: reponse.status, donnees: JSON.parse(await reponse.text()) }
}

describe('GET /api/admin/couts', () => {
  it('donne le total, le détail par projet, la part hors projet et les tarifs manquants', async () => {
    const { statut, donnees } = await appeler(couts.onRequestGet, '/api/admin/couts')
    expect(statut).toBe(200)
    expect(donnees).toEqual({
      total: 200 + 100 + 20,
      hors_projet: 20,
      projets: [{ projet_id: projet, titre: 'Saisie des temps', supprime: false, cadrage: 200, interview: 0, analyse: 100, total: 300 }],
      tarifs_manquants: ['modele-inconnu'],
    })
  })

  it('accepte un début de mois et en tient compte', async () => {
    const reponse = await appeler(couts.onRequestGet, '/api/admin/couts?depuis=2999-01-01')
    expect(reponse.statut).toBe(200)
    expect(reponse.donnees).toMatchObject({ total: 0, projets: [] })
  })

  it.each(['2026-11-15', '2026-13-01', 'hier', '2026-11-01T00:00:00Z', ''])('refuse « depuis » mal formé : %s', async depuis => {
    const reponse = await appeler(couts.onRequestGet, `/api/admin/couts?depuis=${encodeURIComponent(depuis)}`)
    expect(reponse.statut).toBe(400)
    expect(reponse.donnees.error.message).toContain('depuis')
  })
})

describe('GET /api/admin/projets/:id/couts', () => {
  it('donne les trois postes du projet', async () => {
    const reponse = await appeler(coutsDuProjet.onRequestGet, `/api/admin/projets/${projet}/couts`, projet)
    expect(reponse).toEqual({
      statut: 200,
      donnees: { cadrage: 200, interview: 0, analyse: 100, total: 300, tarifs_manquants: ['modele-inconnu'] },
    })
  })

  it('répond 404 pour un projet inconnu', async () => {
    const reponse = await appeler(coutsDuProjet.onRequestGet, '/api/admin/projets/x/couts', 'x')
    expect(reponse.statut).toBe(404)
  })
})

describe('accès', () => {
  it('répond 401 sans session, par la garde admin', async () => {
    const env = { ADMIN_PASSWORD: 'sésame', SESSION_SECRET: 'secret-de-test' }
    for (const chemin of ['/api/admin/couts', `/api/admin/projets/${projet}/couts`]) {
      const contexte = { request: new Request(`https://exemple.test${chemin}`), env, next: async () => new Response('suite') } as never
      expect((await garde(contexte)).status).toBe(401)
    }
  })

  it('les consommations restent hors des parcours publics et du MCP', () => {
    const fichiers = (dossier: string): string[] => readdirSync(dossier, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? fichiers(join(dossier, e.name)) : [join(dossier, e.name)])
    const dossiers = [join(process.cwd(), 'functions', 'api', 'public'), join(process.cwd(), 'server', 'mcp')]
    const lus = dossiers.flatMap(fichiers)
    expect(lus.length).toBeGreaterThan(0)
    for (const f of lus) {
      const source = readFileSync(f, 'utf8')
      expect(source, f).not.toMatch(/consommation_ia/)
      expect(source, f).not.toMatch(/services\/couts/)
    }
  })
})
