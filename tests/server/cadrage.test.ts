import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ajouterMessage, contexteCadrage, dialogueConclu, effacerDialogue, listerMessages, MAX_CONTEXTE, plafondQuestions, questionsPosees,
} from '../../server/services/cadrage'
import { enregistrerLogiciel } from '../../server/services/logiciels'
import { ajouterDocument, creerProjet, modifierProjet } from '../../server/services/projets'
import { enregistrerQuestionnaire, publierQuestionnaire } from '../../server/services/questionnaires'
import { creerRepondantGenerique, lireRepondantParJeton } from '../../server/services/repondants'
import { LIMITES } from '../../shared/interviews'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
afterAll(async () => { await base.fermer() })
beforeAll(async () => { base = await creerBaseDeTest() })

const nouveauProjet = (titre = 'Saisie des temps', type_demande: 'amelioration' | 'evolution_simple' | 'nouvelle_fonctionnalite' = 'amelioration') =>
  creerProjet(base.db, { titre, type_demande }).then(p => p.id)

describe('messages du dialogue', () => {
  it('les liste dans l\'ordre d\'écriture, même à la même milliseconde', async () => {
    const id = await nouveauProjet()
    await ajouterMessage(base.db, id, 'question', 'Quel est le besoin ?')
    await ajouterMessage(base.db, id, 'reponse', 'Saisir les temps plus vite.')
    await ajouterMessage(base.db, id, 'conclusion', 'Le cadrage peut être conclu.')
    const messages = await listerMessages(base.db, id)
    expect(messages.map(m => [m.role, m.type, m.contenu])).toEqual([
      ['ia', 'question', 'Quel est le besoin ?'],
      ['admin', 'reponse', 'Saisir les temps plus vite.'],
      ['ia', 'conclusion', 'Le cadrage peut être conclu.'],
    ])
    expect(messages[0].cree_le).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('ne mélange pas les projets et efface le dialogue d\'un seul', async () => {
    const a = await nouveauProjet('A')
    const b = await nouveauProjet('B')
    await ajouterMessage(base.db, a, 'question', 'Question A ?')
    await ajouterMessage(base.db, b, 'question', 'Question B ?')
    await effacerDialogue(base.db, a)
    expect(await listerMessages(base.db, a)).toEqual([])
    expect((await listerMessages(base.db, b)).map(m => m.contenu)).toEqual(['Question B ?'])
  })

  it('refuse un projet inconnu (404) pour l\'ajout comme pour l\'effacement', async () => {
    await expect(ajouterMessage(base.db, 'inconnu', 'reponse', 'Bonjour')).rejects.toMatchObject({ statut: 404 })
    await expect(effacerDialogue(base.db, 'inconnu')).rejects.toMatchObject({ statut: 404 })
  })

  it('refuse un message vide ou invisible', async () => {
    const id = await nouveauProjet()
    await expect(ajouterMessage(base.db, id, 'reponse', '   ')).rejects.toThrow(/vide/)
    await expect(ajouterMessage(base.db, id, 'admin', '​ ')).rejects.toThrow(/vide/)
    expect(await listerMessages(base.db, id)).toEqual([])
  })

  it('borne la longueur : 4 000 caractères pour l\'admin, 2 000 pour l\'IA', async () => {
    const id = await nouveauProjet()
    expect(LIMITES.message_cadrage_admin).toBe(4000)
    expect(LIMITES.message_cadrage_ia).toBe(2000)
    await expect(ajouterMessage(base.db, id, 'reponse', 'x'.repeat(4000))).resolves.toBeTruthy()
    await expect(ajouterMessage(base.db, id, 'reponse', 'x'.repeat(4001))).rejects.toThrow(/4000 caractères au plus/)
    await expect(ajouterMessage(base.db, id, 'question', 'x'.repeat(2000))).resolves.toBeTruthy()
    await expect(ajouterMessage(base.db, id, 'question', 'x'.repeat(2001))).rejects.toThrow(/2000 caractères au plus/)
    await expect(ajouterMessage(base.db, id, 'conclusion', 'x'.repeat(2001))).rejects.toThrow(/2000 caractères au plus/)
    expect(await listerMessages(base.db, id)).toHaveLength(2)
  })

  it('refuse en base un type sans rapport avec l\'auteur ou inconnu', async () => {
    const id = await nouveauProjet()
    const inserer = (role: string, type: string) => base.db.prepare(
      'INSERT INTO cadrage_messages (id, projet_id, role, type, contenu, cree_le) VALUES (?,?,?,?,?,?)',
    ).bind(`m-${role}-${type}`, id, role, type, 'Texte', '2026-11-26T10:00:00.000Z').run()
    for (const [role, type] of [['admin', 'question'], ['admin', 'conclusion'], ['ia', 'reponse'], ['ia', 'autre']]) {
      await expect(inserer(role, type), `${role}/${type}`).rejects.toThrow(/CHECK/)
    }
    await expect(base.db.prepare('INSERT INTO cadrage_messages (id, projet_id, role, contenu, cree_le) VALUES (?,?,?,?,?)')
      .bind('m-sans-type', id, 'ia', 'Texte', '2026-11-26T10:00:00.000Z').run()).rejects.toThrow(/NOT NULL/)
    expect(await listerMessages(base.db, id)).toEqual([])
  })
})

describe('plafond de questions', () => {
  it('vaut 3, 6 ou 12 selon le type de demande', () => {
    expect(plafondQuestions('evolution_simple')).toBe(3)
    expect(plafondQuestions('amelioration')).toBe(6)
    expect(plafondQuestions('nouvelle_fonctionnalite')).toBe(12)
  })

  it('compte les questions d\'après leur type enregistré, pas les réponses de l\'admin ni les conclusions', () => {
    expect(questionsPosees([])).toBe(0)
    expect(questionsPosees([
      { type: 'question' }, { type: 'reponse' }, { type: 'question' }, { type: 'reponse' }, { type: 'question' }, { type: 'conclusion' },
    ])).toBe(3)
  })

  it('ne devine rien d\'après le texte : une question sans « ? » compte, une réponse qui en finit par un ne compte pas', async () => {
    const id = await nouveauProjet()
    await ajouterMessage(base.db, id, 'question', 'Décrivez la saisie actuelle.')
    await ajouterMessage(base.db, id, 'reponse', 'Et si on le faisait ?')
    await ajouterMessage(base.db, id, 'conclusion', 'Faut-il aller plus loin ? Non : le cadrage peut être conclu ?')
    const messages = await listerMessages(base.db, id)
    expect(questionsPosees(messages)).toBe(1)
    expect(dialogueConclu(messages)).toBe(true)
  })

  it('dit si le dialogue est conclu : seulement quand le dernier message est une conclusion', () => {
    expect(dialogueConclu([])).toBe(false)
    expect(dialogueConclu([{ type: 'question' }])).toBe(false)
    expect(dialogueConclu([{ type: 'question' }, { type: 'reponse' }])).toBe(false)
    expect(dialogueConclu([{ type: 'question' }, { type: 'reponse' }, { type: 'conclusion' }])).toBe(true)
  })
})

describe('contexteCadrage', () => {
  it('contient titre, type, description, fiches des logiciels, note existante et documents complets', async () => {
    const logiciel = await enregistrerLogiciel(base.db, { nom: 'myCuma', contexte: 'Gestion des adhérents et des temps.' })
    const projet = await creerProjet(base.db, {
      titre: 'Saisie des temps', type_demande: 'nouvelle_fonctionnalite',
      description: 'Les comptables saisissent trop lentement.', logiciel_ids: [logiciel.id],
    })
    await modifierProjet(base.db, projet.id, { note_cadrage: '## Objectif\nGagner du temps.' })
    await ajouterDocument(base.db, projet.id, { nom: 'Compte rendu', contenu: 'Texte complet du compte rendu.\nDeuxième ligne.' })
    await ajouterDocument(base.db, projet.id, { nom: 'Mail', contenu: 'Bonjour, voici le besoin.' })

    const { texte, tronquee } = await contexteCadrage(base.db, projet.id)
    expect(tronquee).toBe(false)
    expect(texte).toBe([
      '# Projet : Saisie des temps',
      'Type de demande : nouvelle fonctionnalité',
      '',
      '## Demande',
      'Les comptables saisissent trop lentement.',
      '',
      '## Logiciels',
      '- myCuma : Gestion des adhérents et des temps.',
      '',
      '## Note de cadrage existante',
      '## Objectif',
      'Gagner du temps.',
      '',
      '## Documents',
      '',
      '### Compte rendu',
      'Texte complet du compte rendu.',
      'Deuxième ligne.',
      '',
      '### Mail',
      'Bonjour, voici le besoin.',
      '',
    ].join('\n'))
    console.log('--- Contexte produit ---\n' + texte)
  })

  it('omet la note de cadrage vide ou blanche, la description vide et les sections sans objet', async () => {
    const id = await nouveauProjet('Simple')
    await modifierProjet(base.db, id, { note_cadrage: '  \n ' })
    const { texte } = await contexteCadrage(base.db, id)
    expect(texte).toBe('# Projet : Simple\nType de demande : amélioration\n')
  })

  it('refuse un projet inconnu', async () => {
    await expect(contexteCadrage(base.db, 'inconnu')).rejects.toMatchObject({ statut: 404 })
  })

  it('tronque proportionnellement au-delà de 300 000 caractères, en caractères entiers, avec la mention', async () => {
    const projet = await creerProjet(base.db, { titre: 'Gros dossier', type_demande: 'amelioration' })
    const entete = (await contexteCadrage(base.db, projet.id)).texte.replace(/\n$/, '')
    // 2 documents de 200 000 caractères, dont un d'émoticônes (2 unités UTF-16 chacune), et un de 100 000.
    await ajouterDocument(base.db, projet.id, { nom: 'Gros', contenu: 'a'.repeat(200_000) })
    await ajouterDocument(base.db, projet.id, { nom: 'Emojis', contenu: '😀'.repeat(100_000) })
    await ajouterDocument(base.db, projet.id, { nom: 'Court', contenu: 'b'.repeat(100_000) })

    const { texte, tronquee } = await contexteCadrage(base.db, projet.id)
    expect(tronquee).toBe(true)
    const budget = MAX_CONTEXTE - Array.from(entete).length
    const garde = (n: number) => Math.floor(n * budget / 400_000)
    expect(texte).toContain(`*(document tronqué : ${garde(200_000)} caractères sur 200000)*`)
    expect(texte).toContain(`*(document tronqué : ${garde(100_000)} caractères sur 100000)*`)
    expect(texte.match(/document tronqué/g)).toHaveLength(3)

    // Le texte gardé a exactement le nombre de caractères annoncé, et aucune émoticône n'est coupée.
    expect(texte).toContain('😀'.repeat(garde(100_000)) + '\n*(')
    expect(texte).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/)
    expect(Array.from(texte.split('### Gros\n')[1].split('\n')[0])).toHaveLength(garde(200_000))
    // Le contexte entier tient dans le budget (hors titres et mentions de documents).
    const mentions = texte.length - texte.replace(/\n\n### [^\n]+\n|\n\*\(document tronqué[^\n]*\n?/g, '').length
    expect(Array.from(texte).length - mentions).toBeLessThanOrEqual(MAX_CONTEXTE + 40)
  })

  it('ne tronque rien jusqu\'à 300 000 caractères', async () => {
    const projet = await creerProjet(base.db, { titre: 'Juste', type_demande: 'amelioration' })
    const entete = (await contexteCadrage(base.db, projet.id)).texte.replace(/\n$/, '')
    const reste = MAX_CONTEXTE - Array.from(entete).length
    await ajouterDocument(base.db, projet.id, { nom: 'Plein', contenu: 'c'.repeat(150_000) })
    await ajouterDocument(base.db, projet.id, { nom: 'Reste', contenu: 'e'.repeat(reste - 150_000) })
    const { texte, tronquee } = await contexteCadrage(base.db, projet.id)
    expect(tronquee).toBe(false)
    expect(texte).not.toContain('tronqué')
    expect(texte).toContain('c'.repeat(150_000))
    expect(texte).toContain('e'.repeat(reste - 150_000))
    await ajouterDocument(base.db, projet.id, { nom: 'Un de plus', contenu: 'd' })
    expect((await contexteCadrage(base.db, projet.id)).tronquee).toBe(true)
  })

  it('ne contient jamais de donnée de répondant, même si le projet a des entretiens', async () => {
    const projet = await creerProjet(base.db, { titre: 'Avec entretiens', type_demande: 'amelioration', description: 'Demande interne.' })
    await ajouterDocument(base.db, projet.id, { nom: 'Doc', contenu: 'Document interne.' })
    const q = await enregistrerQuestionnaire(base.db, {
      projet_id: projet.id, public_vise: 'Comptables', mode: 'hybride',
      contenu: { questions: [{ id: 'q1', type: 'texte', libelle: 'Libellé confidentiel du questionnaire ?', objectif: 'objectif secret' }] },
    })
    await publierQuestionnaire(base.db, q.id, 'https://x.fr')
    const { jeton } = await creerRepondantGenerique(base.db, q.code, {
      nom: 'Zorglub', prenom: 'Hildegarde', poste: 'Comptable en chef', entreprise: 'CUMA de la Brume', mail: 'hilde@exemple.fr',
    })
    const { repondant } = await lireRepondantParJeton(base.db, jeton)
    await base.db.prepare("UPDATE repondants SET statut = 'termine', commence_le = ?, termine_le = ? WHERE id = ?")
      .bind('2026-11-01T09:00:00.000Z', '2026-11-02T09:00:00.000Z', repondant.id).run()
    await base.db.prepare(
      'INSERT INTO tours (id, repondant_id, ordre, question_id, type, question, reponse, cree_le) VALUES (?,?,?,?,?,?,?,?)',
    ).bind('t1', repondant.id, 1, 'q1', 'question', 'Libellé confidentiel du questionnaire ?',
      JSON.stringify({ texte: 'Réponse très personnelle du répondant.' }), '2026-11-01T10:00:00.000Z').run()
    expect(repondant.id).toBeTruthy()

    const { texte } = await contexteCadrage(base.db, projet.id)
    expect(texte).toContain('Demande interne.')
    for (const interdit of [
      'Zorglub', 'Hildegarde', 'Comptable en chef', 'CUMA de la Brume', 'hilde@exemple.fr', jeton, repondant.id,
      'Réponse très personnelle', 'Répondant 1', 'Libellé confidentiel', 'objectif secret',
    ]) {
      expect(texte, interdit).not.toContain(interdit)
    }
  })
})
