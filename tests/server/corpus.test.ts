import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ajouterDocument, creerProjet, modifierProjet } from '../../server/services/projets'
import { enregistrerLogiciel } from '../../server/services/logiciels'
import { enregistrerQuestionnaire, publierQuestionnaire } from '../../server/services/questionnaires'
import { creerInvitation, creerRepondantGenerique, lireRepondantParJeton, supprimerRepondant } from '../../server/services/repondants'
import { construireCorpus, decouper, enteteAnalyse, listerRepondantsPseudonymises } from '../../server/services/corpus'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
let projetId: string
let autreProjetId: string
let qHybride: { id: string; code: string }
let qEntretien: { id: string; code: string }
let qAutre: { id: string }
const ids: Record<'A' | 'B' | 'C' | 'D', { id: string; jeton: string }> = {} as never

const identites = {
  A: { nom: 'Durand', prenom: 'Léa', poste: 'Comptable', entreprise: 'CUMA du Val', mail: 'lea.durand@exemple.fr' },
  B: { nom: 'Martineau', prenom: 'Gaspard', poste: '', entreprise: 'CUMA des Prés', mail: 'gaspard@exemple.fr' },
  C: { nom: 'Bernardin', prenom: 'Zoé', poste: 'Gérante', entreprise: 'CUMA du Nord', mail: 'zoe@exemple.fr' },
  D: { nom: 'Petitjean', prenom: 'Hugo', poste: 'Salarié', entreprise: 'CUMA du Sud', mail: 'hugo@exemple.fr' },
}

async function tour(
  repondantId: string, ordre: number, type: 'question' | 'relance', questionId: string | null,
  question: string, reponse: unknown,
) {
  await base.db.prepare(
    'INSERT INTO tours (id, repondant_id, ordre, question_id, type, question, reponse, cree_le) VALUES (?,?,?,?,?,?,?,?)',
  ).bind(`tour-${repondantId}-${ordre}`, repondantId, ordre, questionId, type, question,
    reponse === null ? null : JSON.stringify(reponse), '2026-11-20T10:00:00.000Z').run()
}

async function fixerStatut(repondantId: string, statut: string, commence: string | null, termine: string | null) {
  await base.db.prepare('UPDATE repondants SET statut = ?, commence_le = ?, termine_le = ? WHERE id = ?')
    .bind(statut, commence, termine, repondantId).run()
}

async function nouveauRepondant(code: string, cle: 'A' | 'B' | 'C') {
  const { jeton } = await creerRepondantGenerique(base.db, code, identites[cle])
  const { repondant } = await lireRepondantParJeton(base.db, jeton)
  ids[cle] = { id: repondant.id, jeton }
}

beforeAll(async () => {
  base = await creerBaseDeTest()
  projetId = (await creerProjet(base.db, { titre: 'Saisie des temps', type_demande: 'amelioration' })).id
  autreProjetId = (await creerProjet(base.db, { titre: 'Autre projet', type_demande: 'evolution_simple' })).id

  qHybride = await enregistrerQuestionnaire(base.db, {
    projet_id: projetId, public_vise: 'Comptables', mode: 'hybride',
    contenu: { questions: [
      { id: 'q1', type: 'choix_unique', libelle: 'À quelle fréquence saisissez-vous les temps ?', options: ['Chaque semaine', 'Chaque mois'], objectif: 'mesurer la charge' },
      { id: 'q2', type: 'texte', libelle: 'Que vous manque-t-il ?', objectif: 'repérer les manques' },
      { id: 'q3', type: 'echelle', libelle: 'Êtes-vous satisfait de la saisie ?', objectif: 'mesurer la satisfaction' },
    ] },
  })
  qEntretien = await enregistrerQuestionnaire(base.db, {
    projet_id: projetId, public_vise: 'Gérants', mode: 'entretien',
    contenu: { question_ouverture: 'Parlez-moi de votre métier.', themes: [{ id: 't1', titre: 'Outils', objectif: 'objectif secret du thème' }] },
  })
  qAutre = await enregistrerQuestionnaire(base.db, {
    projet_id: autreProjetId, public_vise: 'Autres', mode: 'hybride',
    contenu: { questions: [{ id: 'q1', type: 'texte', libelle: 'Une question ?', objectif: 'o' }] },
  })
  for (const q of [qHybride, qEntretien]) await publierQuestionnaire(base.db, q.id, 'https://x.fr')

  // A (Comptables, terminé, n°1), B (Gérants, terminé, n°2), C (Comptables, en cours, n°3), D (invité).
  await nouveauRepondant(qHybride.code, 'A')
  await nouveauRepondant(qEntretien.code, 'B')
  await nouveauRepondant(qHybride.code, 'C')
  const invitation = await creerInvitation(base.db, qHybride.id, identites.D)
  ids.D = { id: invitation.id, jeton: invitation.jeton }
  await fixerStatut(ids.A.id, 'termine', '2026-11-01T09:00:00.000Z', '2026-11-25T10:00:00.000Z')
  await fixerStatut(ids.B.id, 'termine', '2026-11-02T09:00:00.000Z', '2026-11-24T16:30:00.000Z')
  await fixerStatut(ids.C.id, 'commence', '2026-11-03T09:00:00.000Z', null)

  await tour(ids.A.id, 1, 'question', 'q1', 'À quelle fréquence saisissez-vous les temps ?', null)
  await base.db.prepare('UPDATE tours SET reponse = ? WHERE id = ?')
    .bind(JSON.stringify({ valeur: 'Chaque semaine', commentaire: 'surtout en fin de mois' }), `tour-${ids.A.id}-1`).run()
  await tour(ids.A.id, 2, 'relance', 'q1', 'Pouvez-vous donner un exemple ?', { texte: 'Le vendredi soir, avec mon carnet.' })
  await tour(ids.A.id, 3, 'question', 'q2', 'Que vous manque-t-il ?', null)
  await tour(ids.A.id, 4, 'question', 'q3', 'Êtes-vous satisfait de la saisie ?', { valeur: 4 })

  await tour(ids.B.id, 1, 'question', null, 'Parlez-moi de votre métier.', { texte: 'Je gère la CUMA depuis dix ans.' })
  await tour(ids.B.id, 2, 'question', 't1', 'Et côté outils ?', { texte: 'Beaucoup de tableurs.' })

  await tour(ids.C.id, 1, 'question', 'q1', 'À quelle fréquence saisissez-vous les temps ?', { valeur: 'Chaque mois' })
  await tour(ids.D.id, 1, 'question', 'q1', 'Question jamais répondue ?', null)
})
afterAll(async () => { await base.fermer() })

describe('construireCorpus', () => {
  it('prend les entretiens terminés du projet, dans l\'ordre des pseudonymes', async () => {
    const corpus = await construireCorpus(base.db, { projet_id: projetId })
    expect(corpus.nb_entretiens).toBe(2)
    expect(corpus.repondants).toEqual([
      { id: ids.A.id, pseudonyme: 'Répondant 1' },
      { id: ids.B.id, pseudonyme: 'Répondant 2' },
    ])
    const titres = corpus.texte.split('\n').filter(l => l.startsWith('## '))
    expect(titres).toEqual(['## Répondant 1 — Comptable, CUMA du Val', '## Répondant 2 — CUMA des Prés'])
    expect(corpus.texte).toContain('Questionnaire : Comptables · terminé le 25/11/2026')
    expect(corpus.texte).toContain('Questionnaire : Gérants · terminé le 24/11/2026')
  })

  it('produit le format attendu pour un entretien hybride', async () => {
    const { texte } = await construireCorpus(base.db, { projet_id: projetId, repondant_id: ids.A.id })
    expect(texte).toBe([
      '## Répondant 1 — Comptable, CUMA du Val',
      'Questionnaire : Comptables · terminé le 25/11/2026',
      '',
      '**Q1. À quelle fréquence saisissez-vous les temps ?**',
      'Objectif : mesurer la charge',
      '→ Chaque semaine — commentaire : surtout en fin de mois',
      '',
      '**Relance.** Pouvez-vous donner un exemple ?',
      '→ Le vendredi soir, avec mon carnet.',
      '',
      '**Q3. Êtes-vous satisfait de la saisie ?**',
      'Objectif : mesurer la satisfaction',
      '→ 4 / 5',
      '',
    ].join('\n'))
    // La question sans réponse est omise, mais la numérotation ne bouge pas.
    expect(texte).not.toContain('Que vous manque-t-il')
  })

  it('numérote les questions d\'un entretien sans objectif, et omet poste vide', async () => {
    const { texte } = await construireCorpus(base.db, { projet_id: projetId, repondant_id: ids.B.id })
    expect(texte).toContain('**Q1. Parlez-moi de votre métier.**\n→ Je gère la CUMA depuis dix ans.')
    expect(texte).toContain('**Q2. Et côté outils ?**\n→ Beaucoup de tableurs.')
    expect(texte).not.toContain('Objectif')
    expect(texte).not.toContain('objectif secret')
    expect(texte.startsWith('## Répondant 2 — CUMA des Prés\n')).toBe(true)
  })

  it('ajoute les entretiens en cours, marqués inachevés, jamais les invités', async () => {
    const corpus = await construireCorpus(base.db, { projet_id: projetId, inclure_en_cours: true })
    expect(corpus.nb_entretiens).toBe(3)
    expect(corpus.repondants.map(r => r.pseudonyme)).toEqual(['Répondant 1', 'Répondant 2', 'Répondant 3'])
    expect(corpus.texte).toContain('## Répondant 3 — Gérante, CUMA du Nord\nQuestionnaire : Comptables · entretien inachevé')
    expect(corpus.texte).not.toContain('Question jamais répondue')
    expect(corpus.repondants.map(r => r.id)).not.toContain(ids.D.id)
  })

  it('ne contient ni nom, ni prénom, ni mail, ni jeton, ni identifiant interne', async () => {
    const corpus = await construireCorpus(base.db, { projet_id: projetId, inclure_en_cours: true })
    const interdits = [
      ...Object.values(identites).flatMap(i => [i.nom, i.prenom, i.mail]),
      ...Object.values(ids).flatMap(r => [r.id, r.jeton]),
      projetId, qHybride.id, qHybride.code, qEntretien.id, qEntretien.code,
      'tour-', 'lea.durand', '@exemple.fr',
    ]
    for (const valeur of interdits) expect(corpus.texte, valeur).not.toContain(valeur)
    // Idem pour le corpus d'un seul répondant.
    const seul = await construireCorpus(base.db, { projet_id: projetId, repondant_id: ids.A.id })
    for (const valeur of interdits) expect(seul.texte, valeur).not.toContain(valeur)
  })

  it('garde le même pseudonyme quelle que soit la portée', async () => {
    const duProjet = await construireCorpus(base.db, { projet_id: projetId })
    const duQuestionnaire = await construireCorpus(base.db, { projet_id: projetId, questionnaire_id: qEntretien.id })
    const duRepondant = await construireCorpus(base.db, { projet_id: projetId, repondant_id: ids.B.id })
    expect(duQuestionnaire.repondants).toEqual([{ id: ids.B.id, pseudonyme: 'Répondant 2' }])
    expect(duRepondant.repondants).toEqual(duQuestionnaire.repondants)
    expect(duQuestionnaire.nb_entretiens).toBe(1)
    expect(duProjet.texte).toContain(duQuestionnaire.texte.trim())
    const comptables = await construireCorpus(base.db, { projet_id: projetId, questionnaire_id: qHybride.id, inclure_en_cours: true })
    expect(comptables.repondants.map(r => r.pseudonyme)).toEqual(['Répondant 1', 'Répondant 3'])
  })

  it('prend un répondant quel que soit son statut ; un invité n\'a pas d\'entretien', async () => {
    const enCours = await construireCorpus(base.db, { projet_id: projetId, repondant_id: ids.C.id })
    expect(enCours.nb_entretiens).toBe(1)
    expect(enCours.repondants).toEqual([{ id: ids.C.id, pseudonyme: 'Répondant 3' }])
    const invite = await construireCorpus(base.db, { projet_id: projetId, repondant_id: ids.D.id })
    expect(invite).toEqual({ texte: '', nb_entretiens: 0, repondants: [] })
  })

  it('refuse un questionnaire, un répondant ou un projet qui ne se correspondent pas', async () => {
    await expect(construireCorpus(base.db, { projet_id: projetId, questionnaire_id: qAutre.id })).rejects.toMatchObject({ statut: 404 })
    await expect(construireCorpus(base.db, { projet_id: autreProjetId, repondant_id: ids.A.id })).rejects.toMatchObject({ statut: 404 })
    await expect(construireCorpus(base.db, { projet_id: projetId, questionnaire_id: 'inconnu' })).rejects.toMatchObject({ statut: 404 })
    await expect(construireCorpus(base.db, { projet_id: 'inconnu' })).rejects.toMatchObject({ statut: 404 })
  })

  it("garde les pseudonymes après la suppression d'un répondant", async () => {
    const projet = (await creerProjet(base.db, { titre: 'Suppression', type_demande: 'amelioration' })).id
    const q = await enregistrerQuestionnaire(base.db, {
      projet_id: projet, public_vise: 'Chauffeurs', mode: 'hybride',
      contenu: { questions: [{ id: 'q1', type: 'texte', libelle: 'Comment ?', objectif: 'o' }] },
    })
    await publierQuestionnaire(base.db, q.id, 'https://x.fr')
    const suivants: string[] = []
    for (const nom of ['Un', 'Deux', 'Trois']) {
      const { jeton } = await creerRepondantGenerique(base.db, q.code, { nom, prenom: 'X', poste: '', entreprise: `CUMA ${nom}`, mail: '' })
      const { repondant } = await lireRepondantParJeton(base.db, jeton)
      suivants.push(repondant.id)
      await fixerStatut(repondant.id, 'termine', '2026-11-01T09:00:00.000Z', '2026-11-02T09:00:00.000Z')
      await tour(repondant.id, 1, 'question', 'q1', 'Comment ?', { texte: `Réponse ${nom}` })
    }
    await supprimerRepondant(base.db, suivants[0])
    const corpus = await construireCorpus(base.db, { projet_id: projet })
    expect(corpus.repondants).toEqual([
      { id: suivants[1], pseudonyme: 'Répondant 2' },
      { id: suivants[2], pseudonyme: 'Répondant 3' },
    ])
    expect(corpus.texte.split('\n').filter(l => l.startsWith('## '))).toEqual(['## Répondant 2 — CUMA Deux', '## Répondant 3 — CUMA Trois'])
    expect((await listerRepondantsPseudonymises(base.db, q.id)).map(r => r.pseudonyme)).toEqual(['Répondant 2', 'Répondant 3'])
    const seul = await construireCorpus(base.db, { projet_id: projet, repondant_id: suivants[2] })
    expect(seul.repondants).toEqual([{ id: suivants[2], pseudonyme: 'Répondant 3' }])
  })

  it('renvoie un corpus vide pour un projet sans entretien terminé', async () => {
    const corpus = await construireCorpus(base.db, { projet_id: autreProjetId })
    expect(corpus).toEqual({ texte: '', nb_entretiens: 0, repondants: [] })
  })
})

describe('decouper', () => {
  const texte = '## Un\nAAAA\n\n## Deux\nBBBB\n\n## Trois\nCCCC\n'

  it('rend des morceaux qui se recollent exactement', () => {
    for (const longueur of [1, 5, 13, 20, 1000]) {
      let debut = 0
      let recolle = ''
      for (let garde = 0; garde < 500; garde++) {
        const morceau = decouper(texte, debut, longueur)
        expect(morceau.taille).toBe(texte.length)
        expect(morceau.debut).toBe(debut)
        recolle += morceau.texte
        if (morceau.suite === null) break
        expect(morceau.suite).toBeGreaterThan(debut)
        debut = morceau.suite
      }
      expect(recolle, `longueur ${longueur}`).toBe(texte)
    }
  })

  it('coupe de préférence au début d\'un entretien', () => {
    const premier = decouper(texte, 0, 20)
    expect(premier.texte).toBe('## Un\nAAAA\n\n')
    expect(premier.suite).toBe(12)
    expect(decouper(texte, 12, 20).texte).toBe('## Deux\nBBBB\n\n')
  })

  it('coupe à la limite quand aucun entretien ne commence avant', () => {
    const morceau = decouper(texte, 0, 4)
    expect(morceau.texte).toBe('## U')
    expect(morceau.suite).toBe(4)
  })

  it('renvoie suite nul à la fin, et un morceau vide au-delà', () => {
    expect(decouper(texte, 0, 1000).suite).toBeNull()
    expect(decouper(texte, 5000, 10)).toEqual({ texte: '', debut: 5000, taille: texte.length, suite: null })
  })

  it('ne coupe jamais un emoji en deux et compte en caractères entiers', () => {
    const emojis = '😀😀😀😀😀'
    const morceau = decouper(emojis, 1, 2)
    expect(morceau).toEqual({ texte: '😀😀', debut: 1, taille: 5, suite: 3 })
    expect(decouper(emojis, 3, 10).suite).toBeNull()
  })
})

describe('enteteAnalyse', () => {
  it('donne le cadrage, les logiciels et les objectifs, sans le texte des documents', async () => {
    const logiciel = await enregistrerLogiciel(base.db, { nom: 'Compta+', contexte: 'Logiciel de comptabilité des CUMA' })
    await modifierProjet(base.db, projetId, {
      note_cadrage: 'Hypothèse : la saisie hebdomadaire est trop lente.',
      resume_contexte: 'Les CUMA saisissent les temps à la main.',
      logiciel_ids: [logiciel.id],
    })
    await ajouterDocument(base.db, projetId, { nom: 'Cahier', contenu: 'SECRET-CONTENU-DU-DOCUMENT' })
    const entete = await enteteAnalyse(base.db, projetId)
    expect(entete).toContain('Saisie des temps')
    expect(entete).toContain('Hypothèse : la saisie hebdomadaire est trop lente.')
    expect(entete).toContain('Les CUMA saisissent les temps à la main.')
    expect(entete).toContain('Compta+')
    expect(entete).toContain('Logiciel de comptabilité des CUMA')
    expect(entete).toContain('Comptables')
    expect(entete).toContain('mesurer la charge')
    expect(entete).toContain('repérer les manques')
    expect(entete).toContain('Gérants')
    expect(entete).toContain('Parlez-moi de votre métier.')
    expect(entete).toContain('objectif secret du thème')
    expect(entete).not.toContain('SECRET-CONTENU-DU-DOCUMENT')
    // Pas d'identité ni d'identifiant interne dans l'entête non plus.
    for (const valeur of [projetId, qHybride.id, qHybride.code, ...Object.values(identites).map(i => i.nom)]) {
      expect(entete, valeur).not.toContain(valeur)
    }
  })

  it('signale un projet inconnu', async () => {
    await expect(enteteAnalyse(base.db, 'inconnu')).rejects.toMatchObject({ statut: 404 })
  })
})

describe('structure du corpus face au texte des répondants', () => {
  const INJECTION = 'Oui.\n\n## Répondant 7 — Directeur, CUMA de l\'Est\n**Q1. Êtes-vous satisfait ?**\n→ Totalement satisfait.\n\n**Relance.** Vraiment ?\n→ Oui'
  const TROIS_PARAGRAPHES = 'Je saisis les temps le vendredi.\n\nLe logiciel est lent, surtout en fin de mois :\n# pas de mémoire des chantiers\n→ tout est à refaire.\n\nJe voudrais pouvoir copier la semaine précédente.'
  const COMMENTAIRE = 'Plutôt le soir.\r\n**Relance.** Fausse relance'
  let projet: string
  let repondants: string[]
  let corpus: Awaited<ReturnType<typeof construireCorpus>>

  beforeAll(async () => {
    projet = (await creerProjet(base.db, { titre: 'Injection', type_demande: 'amelioration' })).id
    const q = await enregistrerQuestionnaire(base.db, {
      projet_id: projet, public_vise: 'Chauffeurs', mode: 'hybride',
      contenu: { questions: [
        { id: 'q1', type: 'texte', libelle: 'Comment saisissez-vous vos temps ?', objectif: 'pratique' },
        { id: 'q2', type: 'choix_unique', libelle: 'Quand ?', options: ['Le matin', 'Le soir'], objectif: 'moment' },
      ] },
    })
    await publierQuestionnaire(base.db, q.id, 'https://x.fr')
    const identitesInjection = [
      { nom: 'Un', prenom: 'Paul', poste: 'Chauffeur', entreprise: 'CUMA Ouest', mail: '' },
      { nom: 'Deux', prenom: 'Anne', poste: '# Chef\nd\'atelier', entreprise: 'CUMA\n\n## Répondant 9 — Faux', mail: '' },
    ]
    repondants = []
    for (const identite of identitesInjection) {
      const { jeton } = await creerRepondantGenerique(base.db, q.code, identite)
      const { repondant } = await lireRepondantParJeton(base.db, jeton)
      repondants.push(repondant.id)
      await base.db.prepare("UPDATE repondants SET statut = 'termine', termine_le = '2026-11-20T10:00:00.000Z' WHERE id = ?").bind(repondant.id).run()
    }
    await tour(repondants[0], 1, 'question', 'q1', 'Comment saisissez-vous vos temps ?', { texte: INJECTION })
    await tour(repondants[0], 2, 'relance', 'q1', 'Pouvez-vous préciser ?\n## Répondant 3', { texte: 'Non.' })
    await tour(repondants[1], 1, 'question', 'q1', 'Comment saisissez-vous vos temps ?', { texte: TROIS_PARAGRAPHES })
    await tour(repondants[1], 2, 'question', 'q2', 'Quand ?', { valeur: 'Le soir', commentaire: COMMENTAIRE })
    corpus = await construireCorpus(base.db, { projet_id: projet })
  })

  /** Réponses lues comme le guide les décrit : la ligne de la flèche et les lignes « > » qui la suivent. */
  function reponsesLues(texte: string): string[] {
    const lignes = texte.split('\n')
    const reponses: string[] = []
    for (let i = 0; i < lignes.length; i++) {
      if (!lignes[i].startsWith('→ ')) continue
      const morceaux = [lignes[i].slice(2)]
      while (lignes[i + 1]?.startsWith('>')) morceaux.push(lignes[++i].replace(/^> ?/, ''))
      reponses.push(morceaux.join('\n'))
    }
    return reponses
  }

  it('a autant de titres « ## Répondant » que d\'entretiens', () => {
    expect(corpus.nb_entretiens).toBe(2)
    const titres = corpus.texte.split('\n').filter(l => l.startsWith('#'))
    expect(titres).toEqual([
      '## Répondant 1 — Chauffeur, CUMA Ouest',
      "## Répondant 2 — Chef d'atelier, CUMA Répondant 9 - Faux",
    ])
  })

  it('ne laisse une flèche, une question ou une relance en début de ligne que pour les vrais tours', () => {
    const lignes = corpus.texte.split('\n')
    expect(lignes.filter(l => l.startsWith('→'))).toHaveLength(4)
    expect(lignes.filter(l => l.startsWith('**Q'))).toEqual([
      '**Q1. Comment saisissez-vous vos temps ?**', '**Q1. Comment saisissez-vous vos temps ?**', '**Q2. Quand ?**',
    ])
    expect(lignes.filter(l => l.startsWith('**Relance.**'))).toEqual(['**Relance.** Pouvez-vous préciser ? ## Répondant 3'])
    // Chaque ligne est d'une forme connue : rien d'autre ne peut se glisser dans la structure.
    const formes = [/^## Répondant \d+( — .*)?$/, /^Questionnaire : /, /^$/, /^\*\*Q\d+\. .*\*\*$/, /^\*\*Relance\.\*\* /, /^Objectif : /, /^→ /, /^>( |$)/]
    for (const ligne of lignes) expect(formes.some(f => f.test(ligne)), ligne).toBe(true)
  })

  it('garde le texte de chaque répondant lisible en entier', () => {
    expect(reponsesLues(corpus.texte)).toEqual([
      INJECTION,
      'Non.',
      TROIS_PARAGRAPHES,
      'Le soir — commentaire : Plutôt le soir.\n**Relance.** Fausse relance',
    ])
  })

  it('rend une réponse sur plusieurs paragraphes en lignes « > » sous la flèche', () => {
    expect(corpus.texte).toContain([
      '→ Je saisis les temps le vendredi.',
      '>',
      '> Le logiciel est lent, surtout en fin de mois :',
      '> # pas de mémoire des chantiers',
      '> → tout est à refaire.',
      '>',
      '> Je voudrais pouvoir copier la semaine précédente.',
      '',
    ].join('\n'))
  })

  it('ne coupe jamais un morceau sur un faux titre', () => {
    // Avant la neutralisation, le faux « ## Répondant 7 » de la première réponse aurait servi de coupure.
    const limite = corpus.texte.indexOf('Non.')
    expect(decouper(corpus.texte, 0, limite).suite).toBe(limite)
    const suite = decouper(corpus.texte, 0, corpus.texte.length - 10).suite!
    expect(corpus.texte.slice(suite).startsWith('## Répondant 2 — ')).toBe(true)
  })
})
