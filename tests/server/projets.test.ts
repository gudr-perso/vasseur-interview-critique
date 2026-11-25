import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { enregistrerLogiciel } from '../../server/services/logiciels'
import { ajouterDocument, creerProjet, lireDocument, lireProjet, listerProjets, modifierProjet } from '../../server/services/projets'
import { DEFAUTS } from '../../shared/modeles'
import { LIMITES } from '../../shared/interviews'
import { creerBaseDeTest } from '../helpers/d1'
import { espionner } from '../helpers/espion'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
let infinity: string
let zeendoc: string

beforeAll(async () => {
  base = await creerBaseDeTest()
  infinity = (await enregistrerLogiciel(base.db, { nom: 'myCuma Infinity' })).id
  zeendoc = (await enregistrerLogiciel(base.db, { nom: 'Zeendoc' })).id
})
afterAll(async () => { await base.fermer() })

describe('projets', () => {
  it('crée un projet en brouillon avec les modèles par défaut et ses logiciels', async () => {
    const projet = await creerProjet(base.db, {
      titre: ' Refonte de la saisie des temps ', type_demande: 'amelioration', logiciel_ids: [infinity],
    })
    expect(projet).toMatchObject({
      titre: 'Refonte de la saisie des temps', statut: 'brouillon', note_cadrage: '',
      modele_cadrage: DEFAUTS.cadrage, modele_interview: DEFAUTS.interview, modele_analyse: DEFAUTS.analyse,
    })
    expect(projet.logiciels.map(l => l.nom)).toEqual(['myCuma Infinity'])
    expect(projet.documents).toEqual([])
    expect(projet.questionnaires).toEqual([])
  })

  it('accepte des modèles choisis', async () => {
    const projet = await creerProjet(base.db, {
      titre: 'Avec modèles', type_demande: 'evolution_simple', modeles: { interview: 'claude-haiku-5-5' },
    })
    expect(projet.modele_interview).toBe('claude-haiku-5-5')
    expect(projet.modele_cadrage).toBe(DEFAUTS.cadrage)
  })

  it('applique la même règle aux modèles à la création et à la modification', async () => {
    const trop = 'm'.repeat(LIMITES.modele + 1)
    for (const modele of ['', '   ', trop]) {
      await expect(
        creerProjet(base.db, { titre: 'Modèle', type_demande: 'amelioration', modeles: { analyse: modele } }),
      ).rejects.toMatchObject({ statut: 400 })
    }
    const projet = await creerProjet(base.db, {
      titre: 'Modèle', type_demande: 'amelioration', modeles: { analyse: ' claude-haiku-5-5 ' },
    })
    expect(projet.modele_analyse).toBe('claude-haiku-5-5')
    for (const modele of ['', '   ', trop]) {
      await expect(modifierProjet(base.db, projet.id, { modeles: { analyse: modele } })).rejects.toMatchObject({ statut: 400 })
    }
    const pile = 'm'.repeat(LIMITES.modele)
    expect((await modifierProjet(base.db, projet.id, { modeles: { analyse: pile } })).modele_analyse).toBe(pile)
  })

  it('refuse un titre vide et un logiciel inconnu', async () => {
    await expect(creerProjet(base.db, { titre: ' ', type_demande: 'amelioration' })).rejects.toMatchObject({ statut: 400 })
    await expect(
      creerProjet(base.db, { titre: 'X', type_demande: 'amelioration', logiciel_ids: ['inconnu'] }),
    ).rejects.toThrow('Logiciel introuvable : inconnu')
  })

  it('passe en « cadré » quand la note de cadrage est renseignée', async () => {
    const projet = await creerProjet(base.db, { titre: 'À cadrer', type_demande: 'nouvelle_fonctionnalite' })
    const maj = await modifierProjet(base.db, projet.id, { note_cadrage: '# Cadrage\n…' })
    expect(maj.statut).toBe('cadre')
    expect(maj.note_cadrage).toBe('# Cadrage\n…')
  })

  it('ne modifie que les champs fournis et remplace la liste des logiciels', async () => {
    const projet = await creerProjet(base.db, {
      titre: 'Partiel', type_demande: 'amelioration', description: 'initiale', logiciel_ids: [infinity],
    })
    const maj = await modifierProjet(base.db, projet.id, { titre: 'Partiel 2', logiciel_ids: [zeendoc] })
    expect(maj).toMatchObject({ titre: 'Partiel 2', description: 'initiale', statut: 'brouillon' })
    expect(maj.logiciels.map(l => l.nom)).toEqual(['Zeendoc'])
  })

  it('respecte un statut imposé et refuse un projet inconnu', async () => {
    const projet = await creerProjet(base.db, { titre: 'Clos', type_demande: 'amelioration' })
    expect((await modifierProjet(base.db, projet.id, { statut: 'clos', note_cadrage: 'x' })).statut).toBe('clos')
    await expect(modifierProjet(base.db, 'inconnu', { titre: 'x' })).rejects.toMatchObject({ statut: 404 })
    await expect(lireProjet(base.db, 'inconnu')).rejects.toMatchObject({ statut: 404 })
  })

  it('ajoute des documents au projet', async () => {
    const projet = await creerProjet(base.db, { titre: 'Avec doc', type_demande: 'amelioration' })
    await ajouterDocument(base.db, projet.id, { nom: 'guide.md', contenu: '# Guide' })
    expect((await lireProjet(base.db, projet.id)).documents).toMatchObject([{ nom: 'guide.md', contenu: '# Guide' }])
    await expect(ajouterDocument(base.db, projet.id, { nom: 'vide', contenu: ' ' })).rejects.toMatchObject({ statut: 400 })
    await expect(ajouterDocument(base.db, 'inconnu', { nom: 'a', contenu: 'b' })).rejects.toMatchObject({ statut: 404 })
  })

  it('liste et filtre par logiciel et par statut', async () => {
    const tous = await listerProjets(base.db)
    expect(tous.length).toBeGreaterThanOrEqual(6)
    expect(tous[0].maj_le >= tous[tous.length - 1].maj_le).toBe(true)

    const parLogiciel = await listerProjets(base.db, { logiciel_id: zeendoc })
    expect(parLogiciel.map(p => p.titre)).toEqual(['Partiel 2'])
    expect(parLogiciel[0].logiciels).toBe('Zeendoc')

    const cadres = await listerProjets(base.db, { statut: 'cadre' })
    expect(cadres.map(p => p.titre)).toEqual(['À cadrer'])
  })
})

describe('atomicité des écritures de projet', () => {
  async function nombreDeProjets(): Promise<number> {
    return (await base.db.prepare('SELECT COUNT(*) AS n FROM projets').first<{ n: number }>())!.n
  }

  it('ne laisse aucun projet après un refus pour logiciel inconnu, et n\'en écrit même aucun', async () => {
    const avant = await nombreDeProjets()
    const espion = espionner(base.db)
    await expect(
      creerProjet(espion.db, { titre: 'Fantôme', type_demande: 'amelioration', logiciel_ids: [infinity, 'inconnu'] }),
    ).rejects.toThrow('Logiciel introuvable : inconnu')
    expect(await nombreDeProjets()).toBe(avant)
    expect(espion.preparees.filter(sql => /^\s*(INSERT|DELETE|UPDATE)/i.test(sql))).toEqual([])
  })

  it('insère le projet et ses liens dans un seul lot, sans suppression compensatoire', async () => {
    const espion = espionner(base.db)
    const projet = await creerProjet(espion.db, {
      titre: 'En un lot', type_demande: 'amelioration', logiciel_ids: [infinity, zeendoc, infinity],
    })
    expect(espion.lots).toHaveLength(1)
    expect(espion.lots[0].filter(sql => sql.includes('INSERT INTO projets '))).toHaveLength(1)
    expect(espion.lots[0].filter(sql => sql.includes('INSERT INTO projet_logiciels'))).toHaveLength(2)
    expect(espion.preparees.some(sql => /DELETE/i.test(sql))).toBe(false)
    expect(projet.logiciels.map(l => l.nom)).toEqual(['myCuma Infinity', 'Zeendoc'])
  })

  it('met à jour le projet et remplace ses liens dans un seul lot', async () => {
    const projet = await creerProjet(base.db, { titre: 'À modifier', type_demande: 'amelioration', logiciel_ids: [infinity] })
    const espion = espionner(base.db)
    await modifierProjet(espion.db, projet.id, { titre: 'Modifié', logiciel_ids: [zeendoc] })
    expect(espion.lots).toHaveLength(1)
    expect(espion.lots[0].some(sql => sql.startsWith('UPDATE projets'))).toBe(true)
    expect(espion.lots[0].some(sql => sql.includes('DELETE FROM projet_logiciels'))).toBe(true)
    expect(espion.lots[0].some(sql => sql.includes('INSERT INTO projet_logiciels'))).toBe(true)
  })

  it('ne change rien quand un logiciel est inconnu à la modification', async () => {
    const projet = await creerProjet(base.db, { titre: 'Intact', type_demande: 'amelioration', logiciel_ids: [infinity] })
    await expect(modifierProjet(base.db, projet.id, { titre: 'Changé', logiciel_ids: ['inconnu'] }))
      .rejects.toThrow('Logiciel introuvable')
    const relu = await lireProjet(base.db, projet.id)
    expect(relu.titre).toBe('Intact')
    expect(relu.logiciels.map(l => l.nom)).toEqual(['myCuma Infinity'])
  })

  it('vide la liste des logiciels avec logiciel_ids: []', async () => {
    const projet = await creerProjet(base.db, { titre: 'À vider', type_demande: 'amelioration', logiciel_ids: [infinity, zeendoc] })
    expect(projet.logiciels).toHaveLength(2)
    const maj = await modifierProjet(base.db, projet.id, { logiciel_ids: [] })
    expect(maj.logiciels).toEqual([])
    expect(maj.titre).toBe('À vider')
  })
})

describe('lireDocument', () => {
  it('renvoie le document complet, ou une erreur 404', async () => {
    const projet = await creerProjet(base.db, { titre: 'Docs', type_demande: 'amelioration' })
    const doc = await ajouterDocument(base.db, projet.id, { nom: 'guide.md', contenu: '# Guide\nSuite' })
    expect(await lireDocument(base.db, doc.id)).toMatchObject({ id: doc.id, nom: 'guide.md', contenu: '# Guide\nSuite' })
    await expect(lireDocument(base.db, 'inconnu')).rejects.toMatchObject({ statut: 404 })
  })
})
