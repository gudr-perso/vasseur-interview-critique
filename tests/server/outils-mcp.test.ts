import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { OUTILS, appelerOutil, type Contexte } from '../../server/mcp/outils'
import { creerProjet } from '../../server/services/projets'
import { enregistrerQuestionnaire, publierQuestionnaire } from '../../server/services/questionnaires'
import { creerInvitation, creerRepondantGenerique, lireRepondantParJeton } from '../../server/services/repondants'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
let ctx: Contexte

beforeAll(async () => {
  base = await creerBaseDeTest()
  ctx = { db: base.db, origine: 'https://interviews.exemple.fr' }
})
afterAll(async () => { await base.fermer() })

async function appeler<T = Record<string, unknown>>(nom: string, args: unknown = {}): Promise<T> {
  const resultat = await appelerOutil(ctx, nom, args)
  if (resultat.isError) throw new Error(resultat.content[0].text)
  return JSON.parse(resultat.content[0].text) as T
}

describe('catalogue des outils', () => {
  it('expose les dix-neuf outils, sans outil de suppression', () => {
    expect(OUTILS.map(o => o.nom).sort()).toEqual([
      'ajouter_document', 'creer_projet', 'enregistrer_analyse', 'enregistrer_logiciel', 'enregistrer_questionnaire',
      'lire_analyse', 'lire_document', 'lire_entretien', 'lire_guide', 'lire_logiciel', 'lire_projet', 'lire_questionnaire',
      'lire_reponses', 'lister_analyses', 'lister_logiciels', 'lister_projets', 'lister_repondants', 'modifier_projet',
      'publier_questionnaire',
    ])
    for (const outil of OUTILS) expect(outil.description.length, outil.nom).toBeGreaterThan(40)
  })

  it('marque en lecture seule les outils qui ne modifient rien', () => {
    const lecture = OUTILS.filter(o => o.lectureSeule).map(o => o.nom).sort()
    expect(lecture).toEqual([
      'lire_analyse', 'lire_document', 'lire_entretien', 'lire_guide', 'lire_logiciel', 'lire_projet', 'lire_questionnaire',
      'lire_reponses', 'lister_analyses', 'lister_logiciels', 'lister_projets', 'lister_repondants',
    ])
  })
})

describe('parcours complet par les outils', () => {
  it('cadre un projet, écrit un questionnaire et le publie', async () => {
    const logiciel = await appeler<{ id: string }>('enregistrer_logiciel', { nom: 'myCuma Infinity', contexte: 'Gestion des CUMA' })
    expect((await appeler<unknown[]>('lister_logiciels')).length).toBe(1)

    const projet = await appeler<{ id: string; statut: string }>('creer_projet', {
      titre: 'Saisie des temps', type_demande: 'amelioration', logiciel_ids: [logiciel.id],
    })
    expect(projet.statut).toBe('brouillon')

    await appeler('ajouter_document', { projet_id: projet.id, nom: 'doc.md', contenu: '# Doc' })
    const guide = await appelerOutil(ctx, 'lire_guide', { etape: 'cadrage' })
    expect(guide.content[0].text).toContain('# Guide de cadrage')

    const cadre = await appeler<{ statut: string }>('modifier_projet', { projet_id: projet.id, note_cadrage: '# Objectif\n…' })
    expect(cadre.statut).toBe('cadre')

    const questionnaire = await appeler<{ id: string; statut: string }>('enregistrer_questionnaire', {
      projet_id: projet.id, public_vise: 'Comptables', mode: 'hybride',
      contenu: { questions: [{ type: 'texte', libelle: 'Que faites-vous ?', objectif: 'Quotidien' }] },
    })
    expect(questionnaire.statut).toBe('brouillon')
    expect((await appeler<{ id: string }>('lire_questionnaire', { questionnaire_id: questionnaire.id })).id).toBe(questionnaire.id)

    const publie = await appeler<{ url: string; statut: string }>('publier_questionnaire', { questionnaire_id: questionnaire.id })
    expect(publie.statut).toBe('ouvert')
    expect(publie.url).toMatch(/^https:\/\/interviews\.exemple\.fr\/q\/[A-HJ-NP-Z2-9]{10}$/)

    const relu = await appeler<{ statut: string; documents: unknown[]; questionnaires: unknown[] }>('lire_projet', { projet_id: projet.id })
    expect(relu).toMatchObject({ statut: 'en_cours' })
    expect(relu.documents).toEqual([{ id: expect.any(String), nom: 'doc.md', taille: 5 }])
    expect(relu.questionnaires).toHaveLength(1)

    expect(await appeler<unknown[]>('lister_projets', { statut: 'en_cours' })).toHaveLength(1)
    expect(await appeler<unknown[]>('lister_projets', { statut: 'clos' })).toHaveLength(0)
  })
})

describe('erreurs', () => {
  it('renvoie une erreur lisible pour une règle métier', async () => {
    const resultat = await appelerOutil(ctx, 'lire_projet', { projet_id: 'inconnu' })
    expect(resultat).toEqual({ content: [{ type: 'text', text: 'Projet introuvable : inconnu' }], isError: true })
  })

  it('refuse des arguments invalides en nommant le champ', async () => {
    const resultat = await appelerOutil(ctx, 'creer_projet', { titre: 'X', type_demande: 'autre' })
    expect(resultat.isError).toBe(true)
    expect(resultat.content[0].text).toContain('type_demande')
  })

  it('explique en français un argument du mauvais type', async () => {
    const resultat = await appelerOutil(ctx, 'creer_projet', { titre: 5, type_demande: 'amelioration' })
    expect(resultat.isError).toBe(true)
    expect(resultat.content[0].text).toContain('titre : Entrée invalide : chaîne de caractères attendu, nombre reçu')
  })

  it('refuse un outil inconnu', async () => {
    const resultat = await appelerOutil(ctx, 'supprimer_projet', {})
    expect(resultat).toEqual({ content: [{ type: 'text', text: 'Outil inconnu : supprimer_projet' }], isError: true })
  })
})

describe('documents', () => {
  it('lire_projet ne renvoie ni le contenu des documents ni leur date, seulement id, nom et taille', async () => {
    const projet = await appeler<{ id: string }>('creer_projet', { titre: 'Gros documents', type_demande: 'amelioration' })
    const contenu = 'é'.repeat(50_000)
    const doc = await appeler<{ id: string }>('ajouter_document', { projet_id: projet.id, nom: 'gros.md', contenu })
    const brut = await appelerOutil(ctx, 'lire_projet', { projet_id: projet.id })
    expect(brut.content[0].text.length).toBeLessThan(5_000)
    expect(JSON.parse(brut.content[0].text).documents).toEqual([{ id: doc.id, nom: 'gros.md', taille: 50_000 }])
  })

  it('lire_document lit par morceaux et indique la suite', async () => {
    const projet = await appeler<{ id: string }>('creer_projet', { titre: 'Lecture par morceaux', type_demande: 'amelioration' })
    const contenu = Array.from({ length: 45_000 }, (_, i) => String.fromCharCode(97 + (i % 26))).join('')
    const doc = await appeler<{ id: string }>('ajouter_document', { projet_id: projet.id, nom: 'long.txt', contenu })

    const premier = await appeler<{ id: string; nom: string; taille: number; debut: number; texte: string; suite: number | null }>(
      'lire_document', { document_id: doc.id })
    expect(premier).toMatchObject({ id: doc.id, nom: 'long.txt', taille: 45_000, debut: 0, suite: 20_000 })
    expect(premier.texte).toBe(contenu.slice(0, 20_000))

    const second = await appeler<{ debut: number; texte: string; suite: number | null }>(
      'lire_document', { document_id: doc.id, debut: 20_000 })
    expect(second).toMatchObject({ debut: 20_000, suite: 40_000 })
    expect(second.texte).toBe(contenu.slice(20_000, 40_000))

    const dernier = await appeler<{ texte: string; suite: number | null }>(
      'lire_document', { document_id: doc.id, debut: 40_000, longueur: 10_000 })
    expect(dernier.texte).toBe(contenu.slice(40_000))
    expect(dernier.suite).toBeNull()

    const petit = await appeler<{ texte: string; suite: number | null }>(
      'lire_document', { document_id: doc.id, debut: 100, longueur: 50 })
    expect(petit).toMatchObject({ texte: contenu.slice(100, 150), suite: 150 })

    const apres = await appeler<{ texte: string; suite: number | null }>('lire_document', { document_id: doc.id, debut: 99_999 })
    expect(apres).toMatchObject({ texte: '', suite: null })
  })

  it('lire_document refuse une longueur trop grande, un début négatif et un document inconnu', async () => {
    const trop = await appelerOutil(ctx, 'lire_document', { document_id: 'x', longueur: 20_001 })
    expect(trop.isError).toBe(true)
    expect(trop.content[0].text).toContain('longueur')
    expect((await appelerOutil(ctx, 'lire_document', { document_id: 'x', debut: -1 })).isError).toBe(true)
    expect(await appelerOutil(ctx, 'lire_document', { document_id: 'inconnu' }))
      .toEqual({ content: [{ type: 'text', text: 'Document introuvable : inconnu' }], isError: true })
  })

  it('ne coupe pas un caractère hors plan de base en deux', async () => {
    const projet = await appeler<{ id: string }>('creer_projet', { titre: 'Emoji', type_demande: 'amelioration' })
    const doc = await appeler<{ id: string }>('ajouter_document', { projet_id: projet.id, nom: 'e.txt', contenu: 'a😀b😀c' })
    const lu = await appeler<{ taille: number; texte: string; suite: number | null }>(
      'lire_document', { document_id: doc.id, debut: 1, longueur: 2 })
    expect(lu).toMatchObject({ taille: 5, texte: '😀b', suite: 3 })
  })
})

describe('erreurs inattendues', () => {
  it('journalise et renvoie un message générique, sans fuite du message brut', async () => {
    const erreurJournal = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cassee = { prepare() { throw new Error('D1_ERROR: no such table: secret_interne') } } as unknown as D1Database
    const resultat = await appelerOutil({ db: cassee, origine: 'https://x.fr' }, 'lister_logiciels', {})
    expect(resultat).toEqual({
      content: [{ type: 'text', text: 'Erreur interne du serveur. Réessayez ; si le problème persiste, consultez les journaux.' }],
      isError: true,
    })
    expect(erreurJournal).toHaveBeenCalledTimes(1)
    expect(String(erreurJournal.mock.calls[0][0])).toContain('lister_logiciels')
    expect((erreurJournal.mock.calls[0][1] as Error).message).toContain('secret_interne')
    erreurJournal.mockRestore()
  })

  it('garde le message des erreurs métier, sans journal', async () => {
    const erreurJournal = vi.spyOn(console, 'error').mockImplementation(() => {})
    const resultat = await appelerOutil(ctx, 'lire_logiciel', { logiciel_id: 'inconnu' })
    expect(resultat.content[0].text).toBe('Logiciel introuvable : inconnu')
    expect(erreurJournal).not.toHaveBeenCalled()
    erreurJournal.mockRestore()
  })
})

describe('descriptions', () => {
  it('dit que les champs facultatifs omis sont conservés au remplacement', () => {
    const description = OUTILS.find(o => o.nom === 'enregistrer_questionnaire')!.description
    expect(description).toContain('conservent leur valeur')
    expect(description).toContain('défaut du nouveau mode')
  })

  it('lire_projet annonce que les documents sont listés sans contenu', () => {
    const description = OUTILS.find(o => o.nom === 'lire_projet')!.description
    expect(description).toContain('lire_document')
  })
})

describe('analyse des entretiens', () => {
  type Cle = 'A' | 'B' | 'C' | 'D'
  const identites: Record<Cle, { nom: string; prenom: string; poste: string; entreprise: string; mail: string }> = {
    A: { nom: 'Vandenbroucke', prenom: 'Ombeline', poste: 'Comptable', entreprise: 'CUMA du Lac', mail: 'ombeline.v@exemple.fr' },
    B: { nom: 'Quintard', prenom: 'Anatole', poste: 'Trésorier', entreprise: 'CUMA des Saules', mail: 'anatole.q@exemple.fr' },
    C: { nom: 'Lebrethon', prenom: 'Philomène', poste: 'Gérante', entreprise: 'CUMA du Plateau', mail: 'philo@exemple.fr' },
    D: { nom: 'Dussaussoy', prenom: 'Ermengarde', poste: 'Salariée', entreprise: 'CUMA du Bocage', mail: 'ermengarde@exemple.fr' },
  }
  const r = {} as Record<Cle, { id: string; jeton: string }>
  let projetId: string
  let qComptables: string
  let qGerants: string
  /** Tous les textes renvoyés par les outils d'analyse au fil des tests, contrôlés à la fin. */
  const sorties: string[] = []

  async function analyser<T = Record<string, unknown>>(nom: string, args: unknown): Promise<T> {
    const resultat = await appelerOutil(ctx, nom, args)
    sorties.push(resultat.content[0].text)
    if (resultat.isError) throw new Error(resultat.content[0].text)
    return JSON.parse(resultat.content[0].text) as T
  }

  async function tour(repondantId: string, ordre: number, questionId: string | null, question: string, reponse: unknown) {
    await base.db.prepare(
      'INSERT INTO tours (id, repondant_id, ordre, question_id, type, question, reponse, cree_le) VALUES (?,?,?,?,?,?,?,?)',
    ).bind(`${repondantId}-${ordre}`, repondantId, ordre, questionId, 'question', question,
      reponse === null ? null : JSON.stringify(reponse), '2026-11-20T10:00:00.000Z').run()
  }

  async function demarrer(cle: Cle, code: string, statut: 'commence' | 'termine', commence: string) {
    const { jeton } = await creerRepondantGenerique(base.db, code, identites[cle])
    const { repondant } = await lireRepondantParJeton(base.db, jeton)
    r[cle] = { id: repondant.id, jeton }
    await base.db.prepare('UPDATE repondants SET statut = ?, commence_le = ?, termine_le = ? WHERE id = ?')
      .bind(statut, commence, statut === 'termine' ? '2026-11-25T10:00:00.000Z' : null, repondant.id).run()
  }

  beforeAll(async () => {
    projetId = (await creerProjet(base.db, { titre: 'Analyse de la saisie', type_demande: 'amelioration' })).id
    const comptables = await enregistrerQuestionnaire(base.db, {
      projet_id: projetId, public_vise: 'Comptables', mode: 'hybride',
      contenu: { questions: [
        { id: 'q1', type: 'texte', libelle: 'Comment saisissez-vous les temps ?', objectif: 'décrire la pratique' },
        { id: 'q2', type: 'texte', libelle: 'Que vous manque-t-il ?', objectif: 'repérer les manques' },
      ] },
    })
    const gerants = await enregistrerQuestionnaire(base.db, {
      projet_id: projetId, public_vise: 'Gérants', mode: 'entretien',
      contenu: { question_ouverture: 'Racontez votre dernière clôture.', themes: [{ id: 't1', titre: 'Outils', objectif: 'outils utilisés' }] },
    })
    qComptables = comptables.id
    qGerants = gerants.id
    for (const q of [comptables, gerants]) await publierQuestionnaire(base.db, q.id, 'https://x.fr')

    // Numéros attribués dans l'ordre des débuts : A = Répondant 1, C = Répondant 2, B = Répondant 3 ; D, invité, n'en a pas.
    await demarrer('A', comptables.code, 'termine', '2026-11-01T09:00:00.000Z')
    await demarrer('C', gerants.code, 'termine', '2026-11-02T09:00:00.000Z')
    await demarrer('B', comptables.code, 'commence', '2026-11-03T09:00:00.000Z')
    const invitation = await creerInvitation(base.db, comptables.id, identites.D)
    r.D = { id: invitation.id, jeton: invitation.jeton }

    await tour(r.A.id, 1, 'q1', 'Comment saisissez-vous les temps ?', { texte: 'Sur papier, puis je recopie le lundi dans le logiciel.' })
    await tour(r.A.id, 2, 'q2', 'Que vous manque-t-il ?', { texte: 'Une saisie depuis le téléphone, directement au champ.' })
    await tour(r.B.id, 1, 'q1', 'Comment saisissez-vous les temps ?', { texte: 'Je ne saisis rien, ma collègue le fait.' })
    await tour(r.C.id, 1, null, 'Racontez votre dernière clôture.', { texte: 'Trois jours de rapprochements, à la main.' })
    await tour(r.C.id, 2, 't1', 'Et vos outils ?', { texte: 'Un tableur partagé, et beaucoup de coups de fil.' })
  })

  it('lister_repondants donne pseudonyme, profil et statut, sans identité', async () => {
    const liste = await analyser<Record<string, unknown>[]>('lister_repondants', { questionnaire_id: qComptables })
    expect(liste).toEqual([
      {
        repondant_id: r.A.id, pseudonyme: 'Répondant 1', poste: 'Comptable', entreprise: 'CUMA du Lac', statut: 'termine',
        nb_reponses: 2, commence_le: '2026-11-01T09:00:00.000Z', termine_le: '2026-11-25T10:00:00.000Z',
      },
      {
        repondant_id: r.B.id, pseudonyme: 'Répondant 3', poste: 'Trésorier', entreprise: 'CUMA des Saules', statut: 'commence',
        nb_reponses: 1, commence_le: '2026-11-03T09:00:00.000Z', termine_le: null,
      },
      {
        repondant_id: r.D.id, pseudonyme: null, poste: 'Salariée', entreprise: 'CUMA du Bocage', statut: 'invite',
        nb_reponses: 0, commence_le: null, termine_le: null,
      },
    ])
  })

  it('lire_reponses lit les entretiens terminés par morceaux, qui se recollent exactement', async () => {
    type Lecture = { nb_entretiens: number; taille: number; debut: number; texte: string; suite: number | null; repondants: unknown[] }
    const entier = await analyser<Lecture>('lire_reponses', { projet_id: projetId })
    expect(entier).toMatchObject({ nb_entretiens: 2, debut: 0, suite: null })
    expect(entier.repondants).toEqual([
      { pseudonyme: 'Répondant 1', repondant_id: r.A.id },
      { pseudonyme: 'Répondant 2', repondant_id: r.C.id },
    ])
    expect(entier.texte).toContain('## Répondant 1 — Comptable, CUMA du Lac')
    expect(entier.texte).toContain('Objectif : décrire la pratique')
    expect(entier.texte).not.toContain('Répondant 3')
    expect(entier.taille).toBe(Array.from(entier.texte).length)

    let debut = 0
    let recolle = ''
    let morceaux = 0
    for (;;) {
      const morceau = await analyser<Lecture>('lire_reponses', { projet_id: projetId, debut, longueur: 120 })
      expect(Array.from(morceau.texte).length).toBeLessThanOrEqual(120)
      expect(morceau.taille).toBe(entier.taille)
      recolle += morceau.texte
      morceaux++
      if (morceau.suite === null) break
      debut = morceau.suite
    }
    expect(morceaux).toBeGreaterThan(2)
    expect(recolle).toBe(entier.texte)
  })

  it('lire_reponses se limite à un questionnaire et ajoute sur demande les entretiens en cours', async () => {
    const comptables = await analyser<{ nb_entretiens: number; texte: string; repondants: { pseudonyme: string }[] }>(
      'lire_reponses', { projet_id: projetId, questionnaire_id: qComptables, inclure_en_cours: true })
    expect(comptables.nb_entretiens).toBe(2)
    expect(comptables.repondants.map(x => x.pseudonyme)).toEqual(['Répondant 1', 'Répondant 3'])
    expect(comptables.texte).toContain('## Répondant 3 — Trésorier, CUMA des Saules\nQuestionnaire : Comptables · entretien inachevé')
    expect(comptables.texte).not.toContain('Gérants')
  })

  it('lire_entretien rend un seul entretien, avec son projet et son pseudonyme', async () => {
    const entretien = await analyser<Record<string, unknown>>('lire_entretien', { repondant_id: r.C.id })
    expect(entretien).toMatchObject({
      projet_id: projetId, questionnaire_id: qGerants, repondant_id: r.C.id, pseudonyme: 'Répondant 2', nb_entretiens: 1, debut: 0, suite: null,
    })
    expect(entretien.texte).toContain('**Q2. Et vos outils ?**\n→ Un tableur partagé, et beaucoup de coups de fil.')
    const invite = await analyser<Record<string, unknown>>('lire_entretien', { repondant_id: r.D.id })
    expect(invite).toMatchObject({ pseudonyme: null, nb_entretiens: 0, texte: '', taille: 0, suite: null })
  })

  it('enregistre une synthèse et une fiche, les liste par pseudonyme et les relit par morceaux', async () => {
    const contenu = `## Constats\n${'Deux répondants sur deux saisissent à la main. '.repeat(1_000)}`
    const synthese = await analyser<Record<string, unknown>>('enregistrer_analyse', {
      projet_id: projetId, type: 'synthese', contenu, nb_entretiens: 2,
    })
    expect(synthese).toMatchObject({
      projet_id: projetId, questionnaire_id: null, repondant_id: null, type: 'synthese', source: 'mcp', nb_entretiens: 2,
      taille: Array.from(contenu).length,
    })
    expect(synthese).not.toHaveProperty('contenu')

    const fiche = await analyser<{ id: string }>('enregistrer_analyse', {
      projet_id: projetId, type: 'fiche_repondant', repondant_id: r.A.id, questionnaire_id: qComptables,
      contenu: '## Profil\nComptable.', nb_entretiens: 1,
    })

    const liste = await analyser<{ id: string; portee: string; type: string }[]>('lister_analyses', { projet_id: projetId })
    expect(liste.map(a => [a.type, a.portee])).toEqual(expect.arrayContaining([
      ['synthese', 'Projet entier'], ['fiche_repondant', 'Répondant 1'],
    ]))
    expect(liste).toHaveLength(2)
    const fiches = await analyser<{ id: string }[]>('lister_analyses', { projet_id: projetId, type: 'fiche_repondant' })
    expect(fiches.map(a => a.id)).toEqual([fiche.id])
    expect(await analyser<unknown[]>('lister_analyses', { projet_id: projetId, repondant_id: r.C.id })).toEqual([])

    type Morceau = { id: string; type: string; source: string; taille: number; debut: number; texte: string; suite: number | null }
    const premier = await analyser<Morceau>('lire_analyse', { analyse_id: synthese.id })
    expect(premier).toMatchObject({ id: synthese.id, type: 'synthese', source: 'mcp', taille: Array.from(contenu).length, debut: 0, suite: 20_000 })
    expect(premier).not.toHaveProperty('contenu')
    let texte = premier.texte
    let suite = premier.suite
    while (suite !== null) {
      const morceau = await analyser<Morceau>('lire_analyse', { analyse_id: synthese.id, debut: suite })
      texte += morceau.texte
      suite = morceau.suite
    }
    expect(texte).toBe(contenu)
    expect(await analyser<Morceau>('lire_analyse', { analyse_id: fiche.id })).toMatchObject({ texte: '## Profil\nComptable.', suite: null })
  })

  it('renvoie des erreurs lisibles', async () => {
    const erreur = async (nom: string, args: unknown) => {
      const resultat = await appelerOutil(ctx, nom, args)
      sorties.push(resultat.content[0].text)
      expect(resultat.isError, nom).toBe(true)
      return resultat.content[0].text
    }
    expect(await erreur('lire_entretien', { repondant_id: 'inconnu' })).toBe('Répondant introuvable : inconnu')
    expect(await erreur('lister_repondants', { questionnaire_id: 'inconnu' })).toBe('Questionnaire introuvable : inconnu')
    expect(await erreur('lire_analyse', { analyse_id: 'inconnu' })).toBe('Analyse introuvable : inconnu')
    expect(await erreur('lire_reponses', { projet_id: 'inconnu' })).toBe('Projet introuvable : inconnu')
    expect(await erreur('enregistrer_analyse', { projet_id: projetId, type: 'fiche_repondant', contenu: 'Fiche', nb_entretiens: 1 }))
      .toBe('Une fiche de répondant se rattache à un répondant.')
    expect(await erreur('enregistrer_analyse', {
      projet_id: projetId, type: 'synthese', contenu: 'Synthèse', nb_entretiens: 1, repondant_id: r.A.id,
    })).toBe('Seule une fiche de répondant se rattache à un répondant.')
    expect(await erreur('enregistrer_analyse', { projet_id: projetId, type: 'autre', contenu: 'X', nb_entretiens: 1 })).toContain('type')
    expect(await erreur('lire_reponses', { projet_id: projetId, longueur: 20_001 })).toContain('longueur')
  })

  it('aucun résultat d\'outil d\'analyse ne contient le nom, le prénom, le mail ou le jeton d\'un répondant', async () => {
    // Un dernier passage sur chaque outil, toutes portées confondues, en plus des sorties déjà recueillies.
    await analyser('lister_repondants', { questionnaire_id: qGerants })
    await analyser('lire_reponses', { projet_id: projetId, inclure_en_cours: true })
    for (const cle of ['A', 'B', 'C', 'D'] as const) await analyser('lire_entretien', { repondant_id: r[cle].id })
    await analyser('lister_analyses', { projet_id: projetId })

    expect(sorties.length).toBeGreaterThan(20)
    const interdits = Object.entries(identites).flatMap(([cle, i]) => [i.nom, i.prenom, i.mail, r[cle as Cle].jeton])
    for (const sortie of sorties) {
      for (const valeur of interdits) expect(sortie, valeur).not.toContain(valeur)
      for (const champ of ['"nom"', '"prenom"', '"mail"', '"jeton"']) expect(sortie, champ).not.toContain(champ)
    }
  })
})

describe('descriptions des outils d\'analyse', () => {
  it('renvoient au guide à lire avant d\'analyser', () => {
    const description = (nom: string) => OUTILS.find(o => o.nom === nom)!.description
    expect(description('lire_entretien')).toContain('fiche_repondant')
    expect(description('lire_reponses')).toContain('synthese')
    expect(description('lire_reponses')).toContain('expression_besoin')
    expect(description('lire_guide')).toContain('expression_besoin')
  })

  it('enregistrer_analyse exige l\'accord du porteur du projet', () => {
    expect(OUTILS.find(o => o.nom === 'enregistrer_analyse')!.description).toContain('accord explicite du porteur du projet')
  })
})
