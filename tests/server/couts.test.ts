import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { calculerCout, type Jetons } from '../../shared/tarifs'
import { coutsGlobaux, coutsProjet, enregistrerConsommation } from '../../server/services/couts'
import { creerProjet } from '../../server/services/projets'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
let a: string
let b: string
let supprime: string

const jetons = (entree: number, sortie = 0): Jetons => ({ entree, sortie, cache_lecture: 0, cache_ecriture: 0 })
const SONNET = 'claude-sonnet-5-5' // entrée 2 $/M : 1 jeton = 2 micro-dollars
const MOIS_PRECEDENT = '2026-01-15T10:00:00.000Z'

beforeAll(async () => {
  base = await creerBaseDeTest()
  a = (await creerProjet(base.db, { titre: 'A', type_demande: 'amelioration' })).id
  b = (await creerProjet(base.db, { titre: 'B', type_demande: 'amelioration' })).id
  supprime = (await creerProjet(base.db, { titre: 'Éphémère', type_demande: 'amelioration' })).id
  const { db } = base
  await enregistrerConsommation(db, { poste: 'cadrage', projet_id: a, modele: SONNET, jetons: jetons(100) }) // 200
  await enregistrerConsommation(db, { poste: 'interview', projet_id: a, modele: SONNET, jetons: jetons(50) }) // 100
  await enregistrerConsommation(db, { poste: 'interview', projet_id: a, modele: SONNET, jetons: jetons(50) }) // 100
  await enregistrerConsommation(db, { poste: 'analyse', projet_id: b, modele: SONNET, jetons: jetons(1000) }) // 2000
  await enregistrerConsommation(db, { poste: 'interview_critique', projet_id: null, modele: SONNET, jetons: jetons(10) }) // 20
  await enregistrerConsommation(db, { poste: 'analyse', projet_id: supprime, modele: SONNET, jetons: jetons(500) }) // 1000
  await enregistrerConsommation(db, { poste: 'analyse', projet_id: b, modele: 'modele-inconnu', jetons: jetons(999) }) // NULL
  // Une ligne ancienne : projet A, cadrage, 5000.
  await enregistrerConsommation(db, { poste: 'cadrage', projet_id: a, modele: SONNET, jetons: jetons(2500) })
  await db.prepare("UPDATE consommation_ia SET cree_le = ? WHERE jetons_entree = 2500").bind(MOIS_PRECEDENT).run()
  await db.prepare('DELETE FROM projets WHERE id = ?').bind(supprime).run()
})
afterAll(async () => { await base.fermer() })

describe('enregistrerConsommation', () => {
  it('enregistre le coût calculé, ou NULL sans tarif, et accepte un projet nul', async () => {
    const j = { entree: 1234, sortie: 567, cache_lecture: 89, cache_ecriture: 10 }
    await enregistrerConsommation(base.db, { poste: 'interview_critique', projet_id: null, modele: SONNET, jetons: j })
    const ligne = await base.db.prepare('SELECT * FROM consommation_ia WHERE jetons_entree = 1234').first<Record<string, unknown>>()
    expect(ligne).toMatchObject({ projet_id: null, poste: 'interview_critique', jetons_sortie: 567, cache_lecture: 89, cache_ecriture: 10 })
    expect(ligne!.cout_micro_usd).toBe(calculerCout(SONNET, j))
    expect(ligne!.cout_micro_usd).not.toBeNull()
    await base.db.prepare('DELETE FROM consommation_ia WHERE jetons_entree = 1234').run()
    const sans = await base.db.prepare('SELECT cout_micro_usd FROM consommation_ia WHERE jetons_entree = 999').first()
    expect(sans).toEqual({ cout_micro_usd: null })
  })
})

describe('coutsGlobaux', () => {
  it('cumule par projet et par poste, du plus cher au moins cher, projet supprimé compris', async () => {
    const c = await coutsGlobaux(base.db, {})
    expect(c.projets).toEqual([
      { projet_id: b, titre: 'B', supprime: false, cadrage: 0, interview: 0, analyse: 2000, total: 2000 },
      { projet_id: supprime, titre: 'Projet supprimé', supprime: true, cadrage: 0, interview: 0, analyse: 1000, total: 1000 },
      { projet_id: a, titre: 'A', supprime: false, cadrage: 200 + 5000, interview: 200, analyse: 0, total: 5400 },
    ].sort((x, y) => y.total - x.total))
    expect(c.hors_projet).toBe(20)
    expect(c.total).toBe(5400 + 2000 + 1000 + 20)
    expect(c.tarifs_manquants).toEqual(['modele-inconnu'])
  })

  it('filtre depuis le premier jour d\'un mois', async () => {
    const mois = new Date().toISOString().slice(0, 7) + '-01'
    const c = await coutsGlobaux(base.db, { depuis: mois })
    expect(c.projets.find(p => p.projet_id === a)).toMatchObject({ cadrage: 200, total: 400 })
    expect(c.total).toBe(400 + 2000 + 1000 + 20)
  })
})

describe('coutsProjet', () => {
  it('donne les postes du projet et les modèles sans tarif', async () => {
    expect(await coutsProjet(base.db, a)).toEqual({ cadrage: 5200, interview: 200, analyse: 0, total: 5400, tarifs_manquants: [] })
    expect(await coutsProjet(base.db, b)).toEqual({ cadrage: 0, interview: 0, analyse: 2000, total: 2000, tarifs_manquants: ['modele-inconnu'] })
  })
  it('refuse un projet inconnu', async () => {
    await expect(coutsProjet(base.db, 'inconnu')).rejects.toMatchObject({ statut: 404 })
  })
})
