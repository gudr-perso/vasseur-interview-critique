import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { etapeCourante, relancerSuite, repondre, terminer } from '../../server/services/entretiens'
import { creerProjet, modifierProjet } from '../../server/services/projets'
import { cloreQuestionnaire, enregistrerQuestionnaire, publierQuestionnaire } from '../../server/services/questionnaires'
import { creerInvitation, creerRepondantGenerique } from '../../server/services/repondants'
import { creerBaseDeTest } from '../helpers/d1'
import { iaSimulee } from '../helpers/ia'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
let projetId: string
const identite = { nom: 'Durand', prenom: 'Léa', poste: '', entreprise: 'CUMA', mail: '' }

const hybride = {
  questions: [
    { id: 'frequence', type: 'choix_unique', libelle: 'Fréquence ?', options: ['Jour', 'Semaine'], objectif: 'Charge' },
    { id: 'pratique', type: 'texte', libelle: 'Comment faites-vous ?', objectif: 'Pratique réelle' },
  ],
}
const entretien = {
  question_ouverture: 'Racontez votre dernière clôture.',
  themes: [{ id: 'existant', titre: 'Existant', objectif: 'Décrire' }],
}

beforeAll(async () => {
  base = await creerBaseDeTest()
  projetId = (await creerProjet(base.db, { titre: 'Saisie des temps', type_demande: 'amelioration' })).id
  await modifierProjet(base.db, projetId, { note_cadrage: 'HYPOTHESE SECRETE', resume_contexte: 'Résumé public' })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterAll(async () => { await base.fermer() })

async function jetonPour(mode: 'hybride' | 'entretien', reglages: Record<string, number> = {}) {
  const q = await enregistrerQuestionnaire(base.db, {
    projet_id: projetId, public_vise: 'Comptables', mode, contenu: mode === 'hybride' ? hybride : entretien, ...reglages,
  })
  await publierQuestionnaire(base.db, q.id, 'https://x.fr')
  return { questionnaire: q, jeton: (await creerRepondantGenerique(base.db, q.code, identite)).jeton }
}

describe('mode hybride', () => {
  it('pose les questions dans l\'ordre, sans jamais montrer l\'objectif, puis termine', async () => {
    const { ia } = iaSimulee()
    const { jeton } = await jetonPour('hybride', { relances_max_par_question: 0 })

    const premiere = await etapeCourante(base.db, jeton)
    expect(premiere.etape).toEqual({
      type: 'question',
      question: { ordre: 1, type: 'choix_unique', libelle: 'Fréquence ?', options: ['Jour', 'Semaine'] },
      progression: { faites: 0, total: 2 },
    })
    expect(JSON.stringify(premiere)).not.toContain('Charge')

    const seconde = await repondre(base.db, ia, jeton, 1, { valeur: 'Jour' })
    expect(seconde.etape).toMatchObject({ type: 'question', question: { ordre: 2, libelle: 'Comment faites-vous ?' }, progression: { faites: 1, total: 2 } })

    const fin = await repondre(base.db, ia, jeton, 2, { texte: 'Sur papier' })
    expect(fin.etape).toEqual({ type: 'termine' })
  })

  it('relance quand l\'IA le décide, dans la limite des plafonds, avec le bon contexte', async () => {
    const { ia, demandes } = iaSimulee(() => ({ relancer: true, question: 'Un exemple ?' }))
    const { jeton } = await jetonPour('hybride', { relances_max_par_question: 1, tours_max: 1 })

    const relance = await repondre(base.db, ia, jeton, 1, { valeur: 'Jour', commentaire: 'parfois' })
    expect(relance.etape).toMatchObject({
      type: 'question',
      question: { ordre: 2, type: 'relance', libelle: 'Un exemple ?', rappel: { question: 'Fréquence ?', reponse: 'Jour — commentaire : parfois' } },
    })
    expect(demandes.relance[0].contexte).toEqual({ titre_projet: 'Saisie des temps', public_vise: 'Comptables', logiciels: [], resume_contexte: 'Résumé public' })
    expect(JSON.stringify(demandes.relance[0])).not.toContain('HYPOTHESE SECRETE')

    // Une relance par question au plus : la réponse à la relance mène à la question suivante.
    const suivante = await repondre(base.db, ia, jeton, 2, { texte: 'Le lundi' })
    expect(suivante.etape).toMatchObject({ question: { ordre: 3, libelle: 'Comment faites-vous ?' } })

    // Plafond total atteint (tours_max = 1) : plus aucune relance, même si l'IA en voudrait.
    expect((await repondre(base.db, ia, jeton, 3, { texte: 'Sur papier' })).etape).toEqual({ type: 'termine' })
    expect(demandes.relance).toHaveLength(1)
  })

  it('passe à la suite sans relance si l\'IA échoue', async () => {
    const { ia } = iaSimulee(() => 'erreur')
    const { jeton } = await jetonPour('hybride')
    const etat = await repondre(base.db, ia, jeton, 1, { valeur: 'Jour' })
    expect(etat.etape).toMatchObject({ question: { ordre: 2, libelle: 'Comment faites-vous ?' } })
  })

  it('ignore un double envoi et refuse une question périmée ou une réponse invalide', async () => {
    const { ia } = iaSimulee()
    const { jeton } = await jetonPour('hybride', { relances_max_par_question: 0 })
    await etapeCourante(base.db, jeton)
    await repondre(base.db, ia, jeton, 1, { valeur: 'Jour' })
    const encore = await repondre(base.db, ia, jeton, 1, { valeur: 'Semaine' })
    expect(encore.etape).toMatchObject({ question: { ordre: 2 } })
    await expect(repondre(base.db, ia, jeton, 5, { texte: 'x' })).rejects.toMatchObject({ statut: 409 })
    await expect(repondre(base.db, ia, jeton, 2, { texte: ' ' })).rejects.toMatchObject({ statut: 400 })
  })
})

describe('mode entretien', () => {
  it('ouvre par la question d\'ouverture, suit l\'IA, et termine à sa demande', async () => {
    let n = 0
    const { ia, demandes } = iaSimulee(undefined, () => (++n < 2 ? { fin: false, question: 'Et ensuite ?', themes_couverts: [] } : { fin: true, question: null, themes_couverts: ['existant'] }))
    const { jeton } = await jetonPour('entretien')
    expect((await etapeCourante(base.db, jeton)).etape).toEqual({
      type: 'question', question: { ordre: 1, type: 'ouverte', libelle: 'Racontez votre dernière clôture.' }, progression: {},
    })
    expect((await repondre(base.db, ia, jeton, 1, { texte: 'Le 30, au bureau' })).etape).toMatchObject({ question: { ordre: 2, libelle: 'Et ensuite ?' } })
    expect(demandes.tour[0].historique).toEqual([{ question: 'Racontez votre dernière clôture.', reponse: 'Le 30, au bureau' }])
    expect(demandes.tour[0].tours_restants).toBe(14)
    expect((await repondre(base.db, ia, jeton, 2, { texte: 'Je saisis' })).etape).toEqual({ type: 'termine' })
  })

  it('termine au plafond de tours sans appeler l\'IA', async () => {
    const { ia, demandes } = iaSimulee()
    const { jeton } = await jetonPour('entretien', { tours_max: 1 })
    await etapeCourante(base.db, jeton)
    expect((await repondre(base.db, ia, jeton, 1, { texte: 'Réponse' })).etape).toEqual({ type: 'termine' })
    expect(demandes.tour).toHaveLength(0)
  })

  it('passe en « interrompu » si l\'IA échoue, puis reprend ou termine à la demande', async () => {
    let enPanne = true
    const { ia } = iaSimulee(undefined, () => (enPanne ? 'erreur' : { fin: false, question: 'Reprenons ?', themes_couverts: [] }))
    const { jeton } = await jetonPour('entretien')
    await etapeCourante(base.db, jeton)
    expect((await repondre(base.db, ia, jeton, 1, { texte: 'Réponse' })).etape).toEqual({ type: 'interrompu' })
    expect((await etapeCourante(base.db, jeton)).etape).toEqual({ type: 'interrompu' })
    expect((await relancerSuite(base.db, ia, jeton)).etape).toEqual({ type: 'interrompu' })
    enPanne = false
    expect((await relancerSuite(base.db, ia, jeton)).etape).toMatchObject({ question: { ordre: 2, libelle: 'Reprenons ?' } })

    const autre = await jetonPour('entretien')
    enPanne = true
    await etapeCourante(base.db, autre.jeton)
    await repondre(base.db, ia, autre.jeton, 1, { texte: 'Réponse' })
    expect((await terminer(base.db, autre.jeton)).etape).toEqual({ type: 'termine' })
  })
})

describe('états particuliers', () => {
  it('demande l\'identité à un invité, et refuse ses réponses avant', async () => {
    const { ia } = iaSimulee()
    const { questionnaire } = await jetonPour('hybride')
    const invite = await creerInvitation(base.db, questionnaire.id, identite)
    expect((await etapeCourante(base.db, invite.jeton)).etape).toEqual({ type: 'identite' })
    await expect(repondre(base.db, ia, invite.jeton, 1, { valeur: 'Jour' })).rejects.toMatchObject({ statut: 409 })
  })

  it('ne pose qu\'une question quand deux calculs se croisent', async () => {
    let n = 0
    const { ia } = iaSimulee(undefined, () => (++n <= 2 ? 'erreur' : { fin: false, question: `Question ${n}`, themes_couverts: [] }))
    const { jeton } = await jetonPour('entretien')
    const debuts = await Promise.all([etapeCourante(base.db, jeton), etapeCourante(base.db, jeton)])
    expect(debuts.map(e => e.etape)).toEqual([debuts[0].etape, debuts[0].etape])
    await repondre(base.db, ia, jeton, 1, { texte: 'Réponse' })
    await relancerSuite(base.db, ia, jeton)
    const reprises = await Promise.all([relancerSuite(base.db, ia, jeton), relancerSuite(base.db, ia, jeton)])
    for (const reprise of reprises) expect(reprise.etape).toMatchObject({ type: 'question', question: { ordre: 2 } })
    const { results } = await base.db.prepare(
      'SELECT COUNT(*) AS n FROM tours t JOIN repondants r ON r.id = t.repondant_id WHERE r.jeton = ?',
    ).bind(jeton).all<{ n: number }>()
    expect(results[0].n).toBe(2)
  })

  it('affiche « clos » quand le questionnaire est clos en cours de route', async () => {
    const { ia } = iaSimulee()
    const { questionnaire, jeton } = await jetonPour('hybride')
    await etapeCourante(base.db, jeton)
    await cloreQuestionnaire(base.db, questionnaire.id)
    expect((await etapeCourante(base.db, jeton)).etape).toEqual({ type: 'clos' })
    await expect(repondre(base.db, ia, jeton, 1, { valeur: 'Jour' })).rejects.toMatchObject({ statut: 410 })
  })
})
