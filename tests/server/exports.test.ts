import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { creerProjet } from '../../server/services/projets'
import { enregistrerQuestionnaire, publierQuestionnaire } from '../../server/services/questionnaires'
import { creerInvitation, creerRepondantGenerique, lireRepondantParJeton } from '../../server/services/repondants'
import {
  celluleCsv, COLONNES_CSV, enTeteTelechargement, exporterReponses, lireOptionsExport, nomSansAccent,
} from '../../server/services/exports'
import * as exportProjet from '../../functions/api/admin/projets/[id]/export'
import * as exportQuestionnaire from '../../functions/api/admin/questionnaires/[id]/export'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
let projetId: string
let autreProjetId: string
let qHybride: { id: string; code: string }
let qEntretien: { id: string; code: string }
let qAutre: { id: string }
const ids = {} as Record<'A' | 'B' | 'C' | 'D', string>
const MAINTENANT = new Date('2026-11-25T12:00:00.000Z')

async function tour(repondantId: string, ordre: number, type: 'question' | 'relance', questionId: string | null, question: string, reponse: unknown) {
  await base.db.prepare(
    'INSERT INTO tours (id, repondant_id, ordre, question_id, type, question, reponse, cree_le) VALUES (?,?,?,?,?,?,?,?)',
  ).bind(`tour-${repondantId}-${ordre}`, repondantId, ordre, questionId, type, question,
    reponse === null ? null : JSON.stringify(reponse), '2026-11-20T10:00:00.000Z').run()
}

async function fixer(id: string, statut: string, commence: string | null, termine: string | null) {
  await base.db.prepare('UPDATE repondants SET statut = ?, commence_le = ?, termine_le = ? WHERE id = ?')
    .bind(statut, commence, termine, id).run()
}

async function generique(code: string, identite: Record<string, string>) {
  const { jeton } = await creerRepondantGenerique(base.db, code, identite as never)
  return (await lireRepondantParJeton(base.db, jeton)).repondant.id
}

beforeAll(async () => {
  base = await creerBaseDeTest()
  projetId = (await creerProjet(base.db, { titre: 'Saisie des temps : été', type_demande: 'amelioration' })).id
  autreProjetId = (await creerProjet(base.db, { titre: 'Autre projet', type_demande: 'evolution_simple' })).id
  qHybride = await enregistrerQuestionnaire(base.db, {
    projet_id: projetId, public_vise: 'Comptables', mode: 'hybride',
    contenu: { questions: [
      { id: 'q1', type: 'choix_multiple', libelle: 'Quels outils ?', options: ['A', 'B', 'C'], objectif: 'objectif secret un' },
      { id: 'q2', type: 'texte', libelle: 'Que vous manque-t-il ?', objectif: 'objectif secret deux' },
      { id: 'q3', type: 'echelle', libelle: 'Satisfait ?', objectif: 'objectif secret trois' },
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

  ids.A = await generique(qHybride.code, { nom: 'Durand', prenom: 'Léa', poste: 'Comptable', entreprise: 'CUMA du Val', mail: 'lea@exemple.fr' })
  ids.B = await generique(qEntretien.code, { nom: 'Martineau', prenom: 'Gaspard', poste: '', entreprise: 'CUMA des Prés', mail: 'gaspard@exemple.fr' })
  ids.C = await generique(qHybride.code, { nom: 'Bernardin', prenom: 'Zoé', poste: 'Gérante', entreprise: 'CUMA du Nord', mail: 'zoe@exemple.fr' })
  ids.D = (await creerInvitation(base.db, qHybride.id, { nom: 'Petitjean', prenom: 'Hugo', poste: '', entreprise: 'CUMA du Sud', mail: 'hugo@exemple.fr' })).id
  await fixer(ids.A, 'termine', '2026-11-01T09:00:00.000Z', '2026-11-25T10:00:00.000Z')
  await fixer(ids.B, 'termine', '2026-11-02T09:00:00.000Z', '2026-11-24T16:30:00.000Z')
  await fixer(ids.C, 'commence', '2026-11-03T09:00:00.000Z', null)

  await tour(ids.A, 1, 'question', 'q1', 'Quels outils ?', { valeur: ['A', 'C'], commentaire: 'surtout A' })
  await tour(ids.A, 2, 'relance', 'q1', 'Un exemple ?', { texte: '=1+1' })
  await tour(ids.A, 3, 'question', 'q2', 'Que vous manque-t-il ?', { texte: 'Du rapide ; du "simple"\net du clair' })
  await tour(ids.A, 4, 'question', 'q3', 'Satisfait ?', { valeur: 4 })
  await tour(ids.B, 1, 'question', null, 'Parlez-moi de votre métier.', { texte: 'Je gère la CUMA.' })
  await tour(ids.B, 2, 'question', 't1', 'Et côté outils ?', null)
  await tour(ids.C, 1, 'question', 'q1', 'Quels outils ?', { valeur: ['B'] })
  await tour(ids.D, 1, 'question', 'q1', 'Jamais répondue ?', null)
})
afterAll(async () => { await base.fermer() })

/** Découpe un CSV simple (guillemets doublés, sauts de ligne dans les guillemets) en lignes de cellules. */
function lireCsv(texte: string): string[][] {
  const lignes: string[][] = []
  let ligne: string[] = []
  let cellule = ''
  let guillemets = false
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') { cellule += '"'; i++ }
      else if (c === '"') guillemets = false
      else cellule += c
    } else if (c === '"') guillemets = true
    else if (c === ';') { ligne.push(cellule); cellule = '' }
    else if (c === '\r' && texte[i + 1] === '\n') { ligne.push(cellule); lignes.push(ligne); ligne = []; cellule = ''; i++ }
    else cellule += c
  }
  return lignes
}

const col = (ligne: string[], nom: (typeof COLONNES_CSV)[number]) => ligne[COLONNES_CSV.indexOf(nom)]

describe('celluleCsv', () => {
  it('neutralise les débuts de formule', () => {
    for (const debut of ['=1+1', '+33', '-2', '@SOMME(A1)', '\tx', '\rx']) {
      expect(celluleCsv(debut).replace(/^"/, '')[0]).toBe("'")
    }
    expect(celluleCsv('texte = normal')).toBe('texte = normal')
  })
  it('met entre guillemets et double les guillemets', () => {
    expect(celluleCsv('a;b')).toBe('"a;b"')
    expect(celluleCsv('dit "oui"')).toBe('"dit ""oui"""')
    expect(celluleCsv('l1\nl2')).toBe('"l1\nl2"')
  })
})

describe('export CSV', () => {
  it('a le BOM UTF-8, les fins de ligne \\r\\n et les colonnes prévues', async () => {
    const e = await exporterReponses(base.db, { projet_id: projetId, inclure_en_cours: false }, 'csv', MAINTENANT)
    const octets = new TextEncoder().encode(e.contenu)
    expect([...octets.slice(0, 3)]).toEqual([0xEF, 0xBB, 0xBF])
    expect(e.contenu.endsWith('\r\n')).toBe(true)
    expect(e.contenu.slice(1).split('\r\n')[0]).toBe(
      'projet;questionnaire;public;mode;nom;prenom;poste;entreprise;mail;origine;statut;commence_le;termine_le;ordre;type;question_id;question;reponse;valeur;commentaire;repondu_le')
  })

  it('donne une ligne par question posée des entretiens terminés, sans les invités ni les entretiens en cours', async () => {
    const e = await exporterReponses(base.db, { projet_id: projetId, inclure_en_cours: false }, 'csv', MAINTENANT)
    const [, ...lignes] = lireCsv(e.contenu.slice(1))
    expect(lignes).toHaveLength(6) // A : 4 tours, B : 2 tours (dont une question sans réponse)
    expect(lignes.map(l => col(l, 'prenom'))).toEqual(['Léa', 'Léa', 'Léa', 'Léa', 'Gaspard', 'Gaspard'])
    expect(lignes.every(l => l.length === COLONNES_CSV.length)).toBe(true)
    expect(col(lignes[0], 'projet')).toBe('Saisie des temps : été')
    expect(col(lignes[0], 'public')).toBe('Comptables')
    expect(col(lignes[0], 'mode')).toBe('hybride')
    expect(col(lignes[0], 'origine')).toBe('lien_generique')
    expect(col(lignes[0], 'statut')).toBe('termine')
    expect(col(lignes[0], 'termine_le')).toBe('2026-11-25T10:00:00.000Z')
  })

  it('rend un choix multiple « A | C », la note, le commentaire et le type', async () => {
    const e = await exporterReponses(base.db, { projet_id: projetId, inclure_en_cours: false }, 'csv', MAINTENANT)
    const [, ...lignes] = lireCsv(e.contenu.slice(1))
    expect(col(lignes[0], 'valeur')).toBe('A | C')
    expect(col(lignes[0], 'reponse')).toBe('A ; C')
    expect(col(lignes[0], 'commentaire')).toBe('surtout A')
    expect(col(lignes[0], 'type')).toBe('question')
    expect(col(lignes[1], 'type')).toBe('relance')
    expect(col(lignes[3], 'valeur')).toBe('4')
    expect(col(lignes[3], 'reponse')).toBe('4 / 5')
    // Question posée sans réponse : la ligne existe, réponse vide.
    expect(col(lignes[5], 'question')).toBe('Et côté outils ?')
    expect(col(lignes[5], 'reponse')).toBe('')
    expect(col(lignes[5], 'repondu_le')).toBe('')
  })

  it('échappe ; guillemets et sauts de ligne, et neutralise =1+1', async () => {
    const e = await exporterReponses(base.db, { projet_id: projetId, inclure_en_cours: false }, 'csv', MAINTENANT)
    expect(e.contenu).toContain('"Du rapide ; du ""simple""\net du clair"')
    const [, ...lignes] = lireCsv(e.contenu.slice(1))
    expect(col(lignes[1], 'reponse')).toBe("'=1+1")
    expect(col(lignes[2], 'reponse')).toBe('Du rapide ; du "simple"\net du clair')
  })

  it('neutralise aussi les noms saisis par un répondant', async () => {
    const id = await generique(qHybride.code, { nom: '@cmd', prenom: '-Eve', poste: '+1', entreprise: 'X', mail: '=a@b.fr' })
    await fixer(id, 'termine', '2026-11-05T09:00:00.000Z', '2026-11-06T09:00:00.000Z')
    await tour(id, 1, 'question', 'q1', 'Quels outils ?', { valeur: ['A'] })
    const e = await exporterReponses(base.db, { projet_id: projetId, inclure_en_cours: false }, 'csv', MAINTENANT)
    const ligne = lireCsv(e.contenu.slice(1)).find(l => col(l, 'mail') === "'=a@b.fr")!
    expect([col(ligne, 'nom'), col(ligne, 'prenom'), col(ligne, 'poste'), col(ligne, 'entreprise')])
      .toEqual(["'@cmd", "'-Eve", "'+1", 'X'])
    await base.db.prepare('DELETE FROM repondants WHERE id = ?').bind(id).run()
  })

  it('inclut les entretiens en cours sur demande', async () => {
    const e = await exporterReponses(base.db, { projet_id: projetId, inclure_en_cours: true }, 'csv', MAINTENANT)
    const [, ...lignes] = lireCsv(e.contenu.slice(1))
    expect(lignes).toHaveLength(7)
    const enCours = lignes.find(l => col(l, 'prenom') === 'Zoé')!
    expect(col(enCours, 'statut')).toBe('commence')
    expect(col(enCours, 'termine_le')).toBe('')
    expect(col(enCours, 'valeur')).toBe('B')
  })

  it('se limite à un questionnaire, et refuse celui d\'un autre projet', async () => {
    const e = await exporterReponses(base.db, { projet_id: projetId, questionnaire_id: qEntretien.id, inclure_en_cours: true }, 'csv', MAINTENANT)
    const [, ...lignes] = lireCsv(e.contenu.slice(1))
    expect(lignes.map(l => col(l, 'prenom'))).toEqual(['Gaspard', 'Gaspard'])
    await expect(exporterReponses(base.db, { projet_id: projetId, questionnaire_id: qAutre.id, inclure_en_cours: false }, 'csv'))
      .rejects.toMatchObject({ statut: 404 })
  })

  it('ne contient que l\'en-tête quand rien n\'est à exporter', async () => {
    const e = await exporterReponses(base.db, { projet_id: autreProjetId, inclure_en_cours: true }, 'csv', MAINTENANT)
    expect(lireCsv(e.contenu.slice(1))).toHaveLength(1)
  })
})

describe('export Markdown', () => {
  it('a un entretien par section, avec les vrais noms et sans objectifs', async () => {
    const e = await exporterReponses(base.db, { projet_id: projetId, inclure_en_cours: false }, 'md', MAINTENANT)
    expect(e.contenu).toContain('# Saisie des temps : été')
    expect(e.contenu).toContain('Export du 25/11/2026 · 2 entretiens')
    expect(e.contenu).toContain('## Léa Durand — Comptable, CUMA du Val (terminé)')
    expect(e.contenu).toContain('## Gaspard Martineau — CUMA des Prés (terminé)')
    expect(e.contenu).toContain('**Q1. Quels outils ?**')
    expect(e.contenu).toContain('→ A ; C — commentaire : surtout A')
    expect(e.contenu).toContain('**Relance.** Un exemple ?')
    expect(e.contenu).not.toContain('Objectif')
    expect(e.contenu).not.toContain('objectif secret')
    expect(e.contenu).not.toContain('Répondant 1')
    expect(e.contenu).not.toContain('Zoé')
    expect(e.type_mime).toBe('text/markdown; charset=utf-8')
  })

  it('marque un entretien en cours', async () => {
    const e = await exporterReponses(base.db, { projet_id: projetId, questionnaire_id: qHybride.id, inclure_en_cours: true }, 'md', MAINTENANT)
    expect(e.contenu).toContain('Questionnaire : Comptables')
    expect(e.contenu).toContain('## Zoé Bernardin — Gérante, CUMA du Nord (en cours)')
    expect(e.contenu).toContain('entretien inachevé')
  })

  it("n'exporte pas un entretien commencé sans aucune réponse", async () => {
    const projet = (await creerProjet(base.db, { titre: 'Silence', type_demande: 'amelioration' })).id
    const q = await enregistrerQuestionnaire(base.db, {
      projet_id: projet, public_vise: 'Chauffeurs', mode: 'hybride',
      contenu: { questions: [{ id: 'q1', type: 'texte', libelle: 'Comment ?', objectif: 'o' }] },
    })
    await publierQuestionnaire(base.db, q.id, 'https://x.fr')
    const muet = await generique(q.code, { nom: 'Muet', prenom: 'Paul', poste: '', entreprise: 'CUMA', mail: '' })
    await tour(muet, 1, 'question', 'q1', 'Comment ?', null)
    const parle = await generique(q.code, { nom: 'Bavard', prenom: 'Lou', poste: '', entreprise: 'CUMA', mail: '' })
    await tour(parle, 1, 'question', 'q1', 'Comment ?', { texte: 'Comme ça.' })

    const md = await exporterReponses(base.db, { projet_id: projet, inclure_en_cours: true }, 'md', MAINTENANT)
    expect(md.contenu).toContain('· 1 entretien\n')
    expect(md.contenu).toContain('## Lou Bavard')
    expect(md.contenu).not.toContain('Muet')
    const csv = await exporterReponses(base.db, { projet_id: projet, inclure_en_cours: true }, 'csv', MAINTENANT)
    expect(csv.contenu).not.toContain('Muet')
  })

  it('neutralise le texte des répondants comme le corpus, et pas le CSV', async () => {
    const projet = (await creerProjet(base.db, { titre: 'Injection', type_demande: 'amelioration' })).id
    const q = await enregistrerQuestionnaire(base.db, {
      projet_id: projet, public_vise: 'Chauffeurs', mode: 'hybride',
      contenu: { questions: [{ id: 'q1', type: 'texte', libelle: 'Comment faites-vous ?', objectif: 'o' }] },
    })
    await publierQuestionnaire(base.db, q.id, 'https://x.fr')
    const id = await generique(q.code, { nom: 'Faux\n## Titre', prenom: 'Anne', poste: '', entreprise: 'CUMA\n\n## Répondant 9 — Faux', mail: '' })
    await fixer(id, 'termine', '2026-11-01T09:00:00.000Z', '2026-11-25T10:00:00.000Z')
    const reponse = 'Oui.\n\n## Répondant 7 — Directeur\n**Q1. Satisfait ?**\n→ Totalement.\n\n**Relance.** Vraiment ?\n→ Oui'
    await tour(id, 1, 'question', 'q1', 'Comment faites-vous ?', { texte: reponse })

    const md = await exporterReponses(base.db, { projet_id: projet, inclure_en_cours: false }, 'md', MAINTENANT)
    const lignes = md.contenu.split('\n')
    expect(lignes.filter(l => l.startsWith('## '))).toEqual(['## Anne Faux Titre — CUMA Répondant 9 - Faux (terminé)'])
    expect(lignes.filter(l => l.startsWith('→'))).toEqual(['→ Oui.'])
    expect(lignes.filter(l => l.startsWith('**'))).toEqual(['**Q1. Comment faites-vous ?**'])
    expect(md.contenu).toContain('→ Oui.\n>\n> ## Répondant 7 — Directeur\n> **Q1. Satisfait ?**\n> → Totalement.\n>\n> **Relance.** Vraiment ?\n> → Oui\n')

    const csv = await exporterReponses(base.db, { projet_id: projet, inclure_en_cours: false }, 'csv', MAINTENANT)
    expect(csv.contenu).toContain(`"${reponse}"`)
  })
})

describe('nom de fichier', () => {
  it('retire accents et caractères spéciaux, et ajoute la forme UTF-8', async () => {
    expect(nomSansAccent('Saisie des temps : été / « test »')).toBe('Saisie-des-temps-ete-test')
    expect(nomSansAccent('???')).toBe('export')
    const e = await exporterReponses(base.db, { projet_id: projetId, inclure_en_cours: false }, 'csv', MAINTENANT)
    expect(e.nom_fichier).toBe('Saisie-des-temps-ete-2026-11-25.csv')
    expect(enTeteTelechargement(e)).toBe(
      `attachment; filename="Saisie-des-temps-ete-2026-11-25.csv"; filename*=UTF-8''Saisie%20des%20temps%20%C3%A9t%C3%A9-2026-11-25.csv`)
  })
  it('encode les apostrophes et parenthèses de la forme UTF-8', () => {
    expect(enTeteTelechargement({ nom_fichier: 'x.md', nom_affiche: "l'été (1).md" }))
      .toContain("filename*=UTF-8''l%27%C3%A9t%C3%A9%20%281%29.md")
  })
})

describe('options', () => {
  it('lit format et inclure_en_cours, avec csv et 0 par défaut', () => {
    expect(lireOptionsExport(new URL('https://x.test/e'))).toEqual({ format: 'csv', inclure_en_cours: false })
    expect(lireOptionsExport(new URL('https://x.test/e?format=md&inclure_en_cours=1'))).toEqual({ format: 'md', inclure_en_cours: true })
    expect(() => lireOptionsExport(new URL('https://x.test/e?format=xlsx'))).toThrow()
    expect(() => lireOptionsExport(new URL('https://x.test/e?inclure_en_cours=oui'))).toThrow()
  })
})

describe('routes', () => {
  async function appeler(handler: unknown, chemin: string, id: string) {
    return (handler as (c: never) => Promise<Response>)({
      request: new Request(`https://exemple.test${chemin}`), env: { DB: base.db }, params: { id },
    } as never)
  }

  it('exporte un projet en CSV avec les en-têtes de téléchargement', async () => {
    const r = await appeler(exportProjet.onRequestGet, `/api/admin/projets/${projetId}/export?format=csv`, projetId)
    expect(r.status).toBe(200)
    expect(r.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(r.headers.get('Content-Disposition')).toMatch(/^attachment; filename="Saisie-des-temps-ete-\d{4}-\d{2}-\d{2}\.csv"; filename\*=UTF-8''Saisie%20des%20temps%20%C3%A9t%C3%A9-/)
    const octets = new Uint8Array(await r.arrayBuffer())
    expect([...octets.slice(0, 3)]).toEqual([0xEF, 0xBB, 0xBF])
  })

  it('exporte un questionnaire en Markdown', async () => {
    const r = await appeler(exportQuestionnaire.onRequestGet, `/api/admin/questionnaires/${qEntretien.id}/export?format=md`, qEntretien.id)
    expect(r.status).toBe(200)
    expect(r.headers.get('Content-Disposition')).toContain('filename="Gerants-')
    expect(await r.text()).toContain('## Gaspard Martineau')
  })

  it('répond 404 pour un projet ou un questionnaire inconnu, 400 pour un format inconnu', async () => {
    expect((await appeler(exportProjet.onRequestGet, '/api/admin/projets/x/export', 'x')).status).toBe(404)
    expect((await appeler(exportQuestionnaire.onRequestGet, '/api/admin/questionnaires/x/export', 'x')).status).toBe(404)
    expect((await appeler(exportProjet.onRequestGet, `/api/admin/projets/${projetId}/export?format=pdf`, projetId)).status).toBe(400)
  })
})
