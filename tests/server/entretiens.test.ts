import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { etapeCourante, relancerSuite, repondre, terminer } from '../../server/services/entretiens'
import { creerProjet, modifierProjet } from '../../server/services/projets'
import { cloreQuestionnaire, enregistrerQuestionnaire, publierQuestionnaire } from '../../server/services/questionnaires'
import { creerInvitation, creerRepondantGenerique } from '../../server/services/repondants'
import { creerBaseDeTest } from '../helpers/d1'
import { espionner } from '../helpers/espion'
import { attendre, iaSimulee } from '../helpers/ia'

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
  // Horloge simulée (Date seulement : les minuteries restent réelles pour les IA lentes).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-25T10:00:00Z'))
})
afterAll(async () => {
  vi.useRealTimers()
  await base.fermer()
})

/** Fait avancer l'horloge simulée. */
function avancer(secondes: number): void {
  vi.setSystemTime(Date.now() + secondes * 1000)
}

async function suiteDe(jeton: string) {
  return base.db.prepare('SELECT suite_debut, suite_essais, statut FROM repondants WHERE jeton = ?')
    .bind(jeton).first<{ suite_debut: string | null; suite_essais: number; statut: string }>()
}

/** Attend que la condition soit vraie (calcul lancé en parallèle). */
async function quand(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condition(); i++) await attendre(10)
  if (!condition()) throw new Error('condition jamais atteinte')
}

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

  it("transmet à l'IA les échanges précédents, relances comprises, et les questions à venir", async () => {
    const { ia, demandes } = iaSimulee(d => (d.question.id === 'frequence'
      ? { relancer: true, question: 'Quel jour ?' }
      : { relancer: false, question: null }))
    const { jeton } = await jetonPour('hybride', { relances_max_par_question: 1, tours_max: 5 })
    await etapeCourante(base.db, jeton)
    await repondre(base.db, ia, jeton, 1, { valeur: 'Semaine' })
    expect(demandes.relance[0].historique).toEqual([])
    expect(demandes.relance[0].questions_a_venir).toEqual(['Comment faites-vous ?'])

    await repondre(base.db, ia, jeton, 2, { texte: 'Le lundi' })
    // La réponse à la relance ne redemande pas de décision : une relance au plus par question.
    expect(demandes.relance).toHaveLength(1)
    await repondre(base.db, ia, jeton, 3, { texte: 'Sur papier' })
    expect(demandes.relance[1].historique).toEqual([
      { question: 'Fréquence ?', reponse: 'Semaine' },
      { question: 'Quel jour ?', reponse: 'Le lundi' },
    ])
    expect(demandes.relance[1].reponse).toBe('Sur papier')
    expect(demandes.relance[1].questions_a_venir).toEqual([])
    // Les questions à venir n'arrivent que par leur libellé, jamais avec leur objectif.
    expect(JSON.stringify(demandes.relance[0])).not.toContain('Pratique réelle')
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
    expect((await repondre(base.db, ia, jeton, 1, { texte: 'Réponse' })).etape).toEqual({ type: 'interrompu', reessai_possible: true })
    expect((await etapeCourante(base.db, jeton)).etape).toEqual({ type: 'interrompu', reessai_possible: true })
    avancer(11)
    expect((await relancerSuite(base.db, ia, jeton)).etape).toEqual({ type: 'interrompu', reessai_possible: true })
    enPanne = false
    avancer(11)
    expect((await relancerSuite(base.db, ia, jeton)).etape).toMatchObject({ question: { ordre: 2, libelle: 'Reprenons ?' } })
    expect(await suiteDe(jeton)).toMatchObject({ suite_debut: null, suite_essais: 0 })

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
    avancer(11)
    await relancerSuite(base.db, ia, jeton)
    avancer(11)
    const reprises = await Promise.allSettled([relancerSuite(base.db, ia, jeton), relancerSuite(base.db, ia, jeton)])
    const etapes = reprises.flatMap(r => (r.status === 'fulfilled' ? [r.value.etape] : []))
    expect(etapes.some(e => e.type === 'question' && e.question.ordre === 2)).toBe(true)
    const { results } = await base.db.prepare(
      'SELECT COUNT(*) AS n FROM tours t JOIN repondants r ON r.id = t.repondant_id WHERE r.jeton = ?',
    ).bind(jeton).all<{ n: number }>()
    expect(results[0].n).toBe(2)
    expect(n).toBe(3)
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

describe('calcul de la suite', () => {
  const lente = (ms: number) => async () => {
    await attendre(ms)
    return { fin: false, question: 'Et ensuite ?', themes_couverts: [] }
  }

  it('deux envois simultanés de la même réponse : un seul appel à l\'IA, et personne ne voit « interrompu »', async () => {
    const { ia, demandes } = iaSimulee(undefined, lente(300))
    const { jeton } = await jetonPour('entretien')
    await etapeCourante(base.db, jeton)
    const etats = await Promise.all([
      repondre(base.db, ia, jeton, 1, { texte: 'Le 30' }),
      repondre(base.db, ia, jeton, 1, { texte: 'Le 30' }),
    ])
    expect(demandes.tour).toHaveLength(1)
    for (const etat of etats) expect(['question', 'attente']).toContain(etat.etape.type)
    expect(etats.some(e => e.etape.type === 'question')).toBe(true)
    expect((await etapeCourante(base.db, jeton)).etape).toMatchObject({ type: 'question', question: { ordre: 2 } })
  })

  it('montre « attente » pendant le calcul, puis « interrompu » si le calcul a expiré', async () => {
    const { ia, demandes } = iaSimulee(undefined, lente(300))
    const { jeton } = await jetonPour('entretien')
    await etapeCourante(base.db, jeton)
    const envoi = repondre(base.db, ia, jeton, 1, { texte: 'Le 30' })
    await quand(() => demandes.tour.length === 1)
    expect((await etapeCourante(base.db, jeton)).etape).toEqual({ type: 'attente' })
    // Un calcul de plus de 60 s est considéré comme abandonné.
    avancer(61)
    expect((await etapeCourante(base.db, jeton)).etape).toEqual({ type: 'interrompu', reessai_possible: true })
    await envoi
  })

  it('20 « suivant » simultanés depuis « interrompu » : un seul nouvel appel à l\'IA', async () => {
    let panne = true
    const { ia, demandes } = iaSimulee(undefined, async () => {
      if (panne) return 'erreur'
      await attendre(300)
      return { fin: false, question: 'Et ensuite ?', themes_couverts: [] }
    })
    const { jeton } = await jetonPour('entretien')
    await etapeCourante(base.db, jeton)
    expect((await repondre(base.db, ia, jeton, 1, { texte: 'Le 30' })).etape.type).toBe('interrompu')
    expect(await suiteDe(jeton)).toMatchObject({ suite_debut: null, suite_essais: 1 })
    panne = false
    avancer(11)
    const reprises = await Promise.allSettled(Array.from({ length: 20 }, () => relancerSuite(base.db, ia, jeton)))
    expect(demandes.tour).toHaveLength(2)
    for (const r of reprises) {
      if (r.status === 'rejected') expect(r.reason).toMatchObject({ statut: 429 })
      else expect(['question', 'attente']).toContain(r.value.etape.type)
    }
    expect((await etapeCourante(base.db, jeton)).etape).toMatchObject({ type: 'question', question: { ordre: 2 } })
    expect(await suiteDe(jeton)).toMatchObject({ suite_debut: null, suite_essais: 0 })
  })

  it('« suivant » : trois nouveaux essais par étape, espacés de 10 secondes', async () => {
    const { ia, demandes } = iaSimulee(undefined, () => 'erreur')
    const { jeton } = await jetonPour('entretien')
    await etapeCourante(base.db, jeton)
    await repondre(base.db, ia, jeton, 1, { texte: 'Le 30' })

    // Trop tôt après l'échec précédent.
    avancer(5)
    await expect(relancerSuite(base.db, ia, jeton)).rejects.toMatchObject({ statut: 429 })
    expect(demandes.tour).toHaveLength(1)

    for (const essais of [2, 3, 4]) {
      avancer(11)
      const etat = await relancerSuite(base.db, ia, jeton)
      expect(etat.etape).toEqual({ type: 'interrompu', reessai_possible: essais < 4 })
      expect(await suiteDe(jeton)).toMatchObject({ suite_debut: null, suite_essais: essais })
    }
    avancer(11)
    await expect(relancerSuite(base.db, ia, jeton)).rejects.toMatchObject({ statut: 429, message: expect.stringMatching(/terminer/i) })
    expect(demandes.tour).toHaveLength(4)
    // Terminer reste possible.
    expect((await terminer(base.db, jeton)).etape).toEqual({ type: 'termine' })
  })

  it('refuse de terminer pendant un calcul en cours', async () => {
    const { ia, demandes } = iaSimulee(undefined, lente(300))
    const { jeton } = await jetonPour('entretien')
    await etapeCourante(base.db, jeton)
    const envoi = repondre(base.db, ia, jeton, 1, { texte: 'Le 30' })
    await quand(() => demandes.tour.length === 1)
    await expect(terminer(base.db, jeton)).rejects.toMatchObject({ statut: 409 })
    expect((await envoi).etape).toMatchObject({ type: 'question', question: { ordre: 2 } })
    expect(await suiteDe(jeton)).toMatchObject({ statut: 'commence' })
  })

  it('ne pose rien si l\'entretien a été clos pendant le calcul', async () => {
    const { ia, demandes } = iaSimulee(undefined, lente(300))
    const { jeton } = await jetonPour('entretien')
    await etapeCourante(base.db, jeton)
    const envoi = repondre(base.db, ia, jeton, 1, { texte: 'Le 30' })
    await quand(() => demandes.tour.length === 1)
    await base.db.prepare("UPDATE repondants SET statut = 'termine' WHERE jeton = ?").bind(jeton).run()
    expect((await envoi).etape).toEqual({ type: 'termine' })
    const { results } = await base.db.prepare(
      'SELECT COUNT(*) AS n FROM tours t JOIN repondants r ON r.id = t.repondant_id WHERE r.jeton = ?',
    ).bind(jeton).all<{ n: number }>()
    expect(results[0].n).toBe(1)
  })

  it('donne « Lien invalide » si le répondant est supprimé pendant le calcul', async () => {
    const { ia, demandes } = iaSimulee(undefined, lente(300))
    const { jeton } = await jetonPour('entretien')
    await etapeCourante(base.db, jeton)
    const envoi = repondre(base.db, ia, jeton, 1, { texte: 'Le 30' })
    await quand(() => demandes.tour.length === 1)
    await base.db.prepare('DELETE FROM repondants WHERE jeton = ?').bind(jeton).run()
    await expect(envoi).rejects.toMatchObject({ statut: 404, message: 'Lien invalide.' })
  })

  it('traduit une contrainte de clé étrangère à l\'insertion d\'un tour en « Lien invalide »', async () => {
    const { ia } = iaSimulee(undefined, () => ({ fin: false, question: 'Et ensuite ?', themes_couverts: [] }))
    const { jeton } = await jetonPour('entretien')
    await etapeCourante(base.db, jeton)
    const { db } = espionner(base.db, sql => {
      if (/INSERT INTO tours/.test(sql)) throw new Error('D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT')
    })
    await expect(repondre(db, ia, jeton, 1, { texte: 'Le 30' })).rejects.toMatchObject({ statut: 404, message: 'Lien invalide.' })
  })
})
