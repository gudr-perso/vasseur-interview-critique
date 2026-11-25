import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { enregistrerLogiciel } from '../../server/services/logiciels'
import { ajouterDocument, creerProjet, lireProjet, listerProjets, modifierProjet } from '../../server/services/projets'
import { DEFAUTS } from '../../shared/modeles'
import { creerBaseDeTest } from '../helpers/d1'

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
