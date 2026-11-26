import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appliquerMigration, creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>

beforeAll(async () => { base = await creerBaseDeTest() })
afterAll(async () => { await base.fermer() })

const maintenant = '2026-11-25T10:00:00Z'

async function compter(table: string): Promise<number> {
  const ligne = await base.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>()
  return ligne!.n
}

describe('schéma D1', () => {
  it('enregistre un projet complet puis supprime tout en cascade', async () => {
    const { db } = base
    await db.prepare('INSERT INTO logiciels (id, nom, contexte, cree_le, maj_le) VALUES (?,?,?,?,?)')
      .bind('l1', 'myCuma Infinity', 'Gestion des CUMA', maintenant, maintenant).run()
    await db.prepare(
      `INSERT INTO projets (id, titre, type_demande, description, modele_cadrage, modele_interview, modele_analyse, cree_le, maj_le)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind('p1', 'Refonte saisie', 'amelioration', 'desc', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', maintenant, maintenant).run()
    await db.prepare('INSERT INTO projet_logiciels (projet_id, logiciel_id) VALUES (?,?)').bind('p1', 'l1').run()
    await db.prepare('INSERT INTO documents (id, projet_id, nom, contenu, cree_le) VALUES (?,?,?,?,?)')
      .bind('d1', 'p1', 'doc.md', 'texte', maintenant).run()
    await db.prepare(
      `INSERT INTO questionnaires (id, projet_id, public_vise, mode, contenu, code, cree_le, maj_le)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).bind('q1', 'p1', 'Comptables', 'hybride', '{"questions":[]}', 'ABCDEFGHJK', maintenant, maintenant).run()
    await db.prepare(
      `INSERT INTO repondants (id, questionnaire_id, jeton, nom, prenom, poste, entreprise, mail, origine)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind('r1', 'q1', 'jeton-1', 'Durand', 'Léa', 'Comptable', 'CUMA Test', 'lea@example.org', 'lien_generique').run()
    await db.prepare(
      'INSERT INTO tours (id, repondant_id, ordre, type, question, reponse, cree_le) VALUES (?,?,?,?,?,?,?)',
    ).bind('t1', 'r1', 1, 'question', 'Que faites-vous ?', '{"texte":"x"}', maintenant).run()
    await db.prepare(
      'INSERT INTO analyses (id, projet_id, type, contenu, source, nb_entretiens, cree_le) VALUES (?,?,?,?,?,?,?)',
    ).bind('a1', 'p1', 'synthese', '# Synthèse', 'mcp', 1, maintenant).run()
    await db.prepare('INSERT INTO cadrage_messages (id, projet_id, role, type, contenu, cree_le) VALUES (?,?,?,?,?,?)')
      .bind('m1', 'p1', 'ia', 'question', 'Quel est le périmètre ?', maintenant).run()
    await db.prepare(
      `INSERT INTO analyses (id, projet_id, questionnaire_id, repondant_id, type, contenu, source, nb_entretiens, cree_le)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind('a2', 'p1', 'q1', 'r1', 'fiche_repondant', '# Fiche', 'mcp', 1, maintenant).run()

    const projet = await db.prepare('SELECT statut, note_cadrage FROM projets WHERE id = ?').bind('p1')
      .first<{ statut: string; note_cadrage: string }>()
    expect(projet).toEqual({ statut: 'brouillon', note_cadrage: '' })

    await db.prepare('DELETE FROM projets WHERE id = ?').bind('p1').run()

    for (const table of ['projet_logiciels', 'documents', 'cadrage_messages', 'questionnaires', 'repondants', 'tours', 'analyses']) {
      expect(await compter(table), table).toBe(0)
    }
    expect(await compter('logiciels')).toBe(1)
  })

  it('supprime les tours et l\'analyse d\'un répondant supprimé', async () => {
    const { db } = base
    await db.prepare(
      `INSERT INTO projets (id, titre, type_demande, modele_cadrage, modele_interview, modele_analyse, cree_le, maj_le)
       VALUES ('p9','x','amelioration','a','b','c',?,?)`,
    ).bind(maintenant, maintenant).run()
    await db.prepare(
      `INSERT INTO questionnaires (id, projet_id, public_vise, mode, contenu, code, cree_le, maj_le)
       VALUES ('q9','p9','Terrain','hybride','{}','CODE900000',?,?)`,
    ).bind(maintenant, maintenant).run()
    await db.prepare(
      `INSERT INTO repondants (id, questionnaire_id, jeton, origine) VALUES ('r9','q9','jeton-9','invitation')`,
    ).run()
    await db.prepare(
      `INSERT INTO tours (id, repondant_id, ordre, type, question, cree_le) VALUES ('t9','r9',1,'question','Q ?',?)`,
    ).bind(maintenant).run()
    await db.prepare(
      `INSERT INTO analyses (id, projet_id, questionnaire_id, repondant_id, type, contenu, source, cree_le)
       VALUES ('a9','p9','q9','r9','fiche_repondant','x','mcp',?)`,
    ).bind(maintenant).run()

    await db.prepare('DELETE FROM repondants WHERE id = ?').bind('r9').run()

    const restants = (table: string, id: string) =>
      db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE id = ?`).bind(id).first<{ n: number }>()
    expect((await restants('tours', 't9'))!.n).toBe(0)
    expect((await restants('analyses', 'a9'))!.n).toBe(0)
    expect((await restants('questionnaires', 'q9'))!.n).toBe(1)
  })

  it('refuse un type de demande inconnu', async () => {
    await expect(
      base.db.prepare(
        `INSERT INTO projets (id, titre, type_demande, modele_cadrage, modele_interview, modele_analyse, cree_le, maj_le)
         VALUES ('p2','x','inconnu','a','b','c',?,?)`,
      ).bind(maintenant, maintenant).run(),
    ).rejects.toThrow()
  })

  it('refuse deux questionnaires avec le même code', async () => {
    const { db } = base
    await db.prepare(
      `INSERT INTO projets (id, titre, type_demande, modele_cadrage, modele_interview, modele_analyse, cree_le, maj_le)
       VALUES ('p3','x','evolution_simple','a','b','c',?,?)`,
    ).bind(maintenant, maintenant).run()
    const inserer = (id: string) => db.prepare(
      `INSERT INTO questionnaires (id, projet_id, public_vise, mode, contenu, code, cree_le, maj_le)
       VALUES (?, 'p3', 'Terrain', 'entretien', '{}', 'MEMECODE00', ?, ?)`,
    ).bind(id, maintenant, maintenant).run()
    await inserer('q10')
    await expect(inserer('q11')).rejects.toThrow()
  })
})

describe('migration 0003 : numéro des répondants', () => {
  it('numérote les répondants existants par projet, dans l\'ordre de commence_le puis id, sans les invités', async () => {
    const ancienne = await creerBaseDeTest('0003_numero_repondant.sql')
    try {
      const { db } = ancienne
      for (const p of ['p1', 'p2']) {
        await db.prepare(
          `INSERT INTO projets (id, titre, type_demande, modele_cadrage, modele_interview, modele_analyse, cree_le, maj_le)
           VALUES (?,?,?,?,?,?,?,?)`,
        ).bind(p, p, 'amelioration', 'm', 'm', 'm', maintenant, maintenant).run()
      }
      for (const [q, p, code] of [['qa', 'p1', 'AAAAAAAAAA'], ['qb', 'p1', 'BBBBBBBBBB'], ['qc', 'p2', 'CCCCCCCCCC']]) {
        await db.prepare('INSERT INTO questionnaires (id, projet_id, public_vise, mode, contenu, code, cree_le, maj_le) VALUES (?,?,?,?,?,?,?,?)')
          .bind(q, p, 'Public', 'hybride', '{"questions":[]}', code, maintenant, maintenant).run()
      }
      const repondants: [string, string, string, string | null][] = [
        ['r-b', 'qa', 'termine', '2026-11-02T09:00:00Z'],
        ['r-a', 'qb', 'commence', '2026-11-02T09:00:00Z'],
        ['r-c', 'qa', 'commence', '2026-11-01T09:00:00Z'],
        ['r-i', 'qa', 'invite', null],
        ['r-z', 'qc', 'termine', '2026-11-05T09:00:00Z'],
      ]
      for (const [id, q, statut, commence] of repondants) {
        await db.prepare("INSERT INTO repondants (id, questionnaire_id, jeton, origine, statut, commence_le) VALUES (?,?,?,'invitation',?,?)")
          .bind(id, q, `jeton-${id}`, statut, commence).run()
      }
      await appliquerMigration(db, '0003_numero_repondant.sql')
      const { results } = await db.prepare('SELECT id, numero FROM repondants ORDER BY id').all()
      expect(results).toEqual([
        { id: 'r-a', numero: 2 }, { id: 'r-b', numero: 3 }, { id: 'r-c', numero: 1 }, { id: 'r-i', numero: null }, { id: 'r-z', numero: 1 },
      ])
      const { results: registre } = await db.prepare('SELECT projet_id, numero, repondant_id FROM numeros_repondants ORDER BY projet_id, numero').all()
      expect(registre).toEqual([
        { projet_id: 'p1', numero: 1, repondant_id: 'r-c' },
        { projet_id: 'p1', numero: 2, repondant_id: 'r-a' },
        { projet_id: 'p1', numero: 3, repondant_id: 'r-b' },
        { projet_id: 'p2', numero: 1, repondant_id: 'r-z' },
      ])
    } finally {
      await ancienne.fermer()
    }
  })
})

describe('migration 0004 : type des messages de cadrage', () => {
  it('donne un type cohérent aux messages existants, garde leur ordre et la suppression en cascade', async () => {
    const ancienne = await creerBaseDeTest('0004_type_message_cadrage.sql')
    try {
      const { db } = ancienne
      await db.prepare(
        `INSERT INTO projets (id, titre, type_demande, modele_cadrage, modele_interview, modele_analyse, cree_le, maj_le)
         VALUES ('p1','x','amelioration','m','m','m',?,?)`,
      ).bind(maintenant, maintenant).run()
      const messages: [string, string, string][] = [
        ['m-z', 'ia', 'Qui saisit les temps ?'],
        ['m-y', 'admin', 'Le comptable, et vous ?'],
        ['m-x', 'ia', 'Utilisez-vous « Zeendoc » ?»'],
        ['m-w', 'admin', 'Oui.'],
        ['m-v', 'ia', "J'ai assez d'éléments : le cadrage peut être conclu."],
      ]
      for (const [id, role, contenu] of messages) {
        await db.prepare('INSERT INTO cadrage_messages (id, projet_id, role, contenu, cree_le) VALUES (?,?,?,?,?)')
          .bind(id, 'p1', role, contenu, maintenant).run()
      }
      await appliquerMigration(db, '0004_type_message_cadrage.sql')
      const { results } = await db.prepare(
        "SELECT id, role, type FROM cadrage_messages WHERE projet_id = 'p1' ORDER BY cree_le, rowid",
      ).all()
      expect(results).toEqual([
        { id: 'm-z', role: 'ia', type: 'question' },
        { id: 'm-y', role: 'admin', type: 'reponse' },
        { id: 'm-x', role: 'ia', type: 'question' },
        { id: 'm-w', role: 'admin', type: 'reponse' },
        { id: 'm-v', role: 'ia', type: 'conclusion' },
      ])
      const index = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'cadrage_messages'").all()
      expect(index.results).toContainEqual({ name: 'idx_cadrage_projet' })
      await db.prepare("DELETE FROM projets WHERE id = 'p1'").run()
      expect((await db.prepare('SELECT COUNT(*) AS n FROM cadrage_messages').first<{ n: number }>())!.n).toBe(0)
    } finally {
      await ancienne.fermer()
    }
  })
})
