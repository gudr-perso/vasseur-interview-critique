# Lot 2A — Services métier et serveur MCP : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** pouvoir, depuis Claude et sans token API, créer un projet d'interview, le cadrer, générer ses questionnaires et les publier, via un serveur MCP hébergé avec l'application.

**Architecture :** une couche de services (`server/services/`) porte toutes les règles métier sur D1 ; elle sera réutilisée telle quelle par l'API admin du lot 2B. Les outils MCP (`server/mcp/outils.ts`) sont de simples enveloppes validées par Zod autour de ces services, testables sans réseau. Le transport est celui du SDK officiel, en mode sans état, monté dans une Pages Function protégée par un jeton.

**Tech stack :** Cloudflare Pages Functions, D1, `@modelcontextprotocol/server` (SDK v2), `zod`, Vitest + Miniflare.

**Spec :** `docs/superpowers/specs/2026-11-25-interview-utilisateurs-design.md`, sections 3, 4, 6 et 7.

**Découpage du lot 2 :** ce plan (2A) couvre les services et le MCP. Le lot 2B couvrira l'API admin REST et les écrans (logiciels, projets, édition et publication des questionnaires). Les outils MCP de lecture des réponses et de dépôt d'analyses arrivent au lot 4, avec les réponses elles-mêmes.

**Écart par rapport à la spec :** ajout d'un outil `ajouter_document`, pour verser dans le projet une documentation collée dans Claude. Les outils `lister_repondants`, `lire_entretien`, `lire_reponses` et `enregistrer_analyse` sont reportés au lot 4.

---

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `server/erreurs.ts` | créer — `ErreurMetier` (message destiné à l'utilisateur + statut) |
| `server/ids.ts` | créer — identifiants, codes d'URL, horodatage |
| `server/auth.ts` | modifier — `chainesEgales` pour comparer le jeton MCP |
| `server/env.ts` | modifier — `MCP_TOKEN` |
| `server/services/logiciels.ts` | créer — référentiel des logiciels |
| `server/services/projets.ts` | créer — projets, logiciels associés, documents |
| `server/services/questionnaires.ts` | créer — validation du contenu, brouillon, publication |
| `server/guides.ts` | créer — consignes de cadrage et de rédaction de questionnaire |
| `server/mcp/outils.ts` | créer — définition et exécution des outils |
| `server/mcp/serveur.ts` | créer — branchement sur le SDK MCP |
| `functions/mcp/[jeton].ts`, `functions/mcp/index.ts` | créer — points d'accès (jeton dans l'URL, ou en-tête Bearer) |
| `tests/server/*.test.ts`, `tests/functions/mcp.test.ts` | créer |
| `scripts/verifier-mcp.mjs` | créer — contrôle de bout en bout contre un serveur local |
| `.dev.vars.example`, `CLAUDE.md`, `docs/mcp.md`, spec | docs |

---

### Task 0 : Branche

Le lot 1 vit sur `lot1-socle` (non fusionnée). Une session à part y commite l'identifiant D1 dans `wrangler.toml` : attendre qu'elle ait fini avant de créer la branche.

- [ ] **Step 1**

```bash
git checkout lot1-socle
git status --short        # doit être vide
git checkout -b lot2a-services-mcp
```

---

### Task 1 : Briques communes

**Files :**
- Create : `server/erreurs.ts`, `server/ids.ts`, `tests/server/ids.test.ts`
- Modify : `server/auth.ts`, `server/env.ts`, `tests/server/auth.test.ts`, `package.json`

- [ ] **Step 1 : dépendances**

```bash
npm install @modelcontextprotocol/server zod
npm install -D @modelcontextprotocol/client
```

- [ ] **Step 2 : écrire `tests/server/ids.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { maintenantIso, nouveauCode, nouvelId } from '../../server/ids'

describe('identifiants', () => {
  it('produit des identifiants uniques', () => {
    expect(nouvelId()).not.toBe(nouvelId())
  })

  it('produit des codes de 10 caractères sans caractères ambigus', () => {
    const codes = Array.from({ length: 200 }, nouveauCode)
    for (const code of codes) expect(code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/)
    expect(new Set(codes).size).toBe(200)
  })

  it('horodate en ISO 8601 UTC', () => {
    expect(maintenantIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})
```

Ajouter à la fin de `tests/server/auth.test.ts` (et `chainesEgales` à l'import existant de `../../server/auth`) :

```ts
describe('chainesEgales', () => {
  it('ne reconnaît que deux chaînes identiques et non vides', async () => {
    expect(await chainesEgales('jeton-abc', 'jeton-abc')).toBe(true)
    expect(await chainesEgales('jeton-abc', 'jeton-abd')).toBe(false)
    expect(await chainesEgales('jeton', 'jeton-abc')).toBe(false)
    expect(await chainesEgales('', '')).toBe(false)
  })
})
```

- [ ] **Step 3 : vérifier l'échec**

Run : `npm test -- tests/server/ids.test.ts tests/server/auth.test.ts`
Expected : FAIL (`server/ids` introuvable, `chainesEgales` non exporté).

- [ ] **Step 4 : créer `server/erreurs.ts`**

```ts
/** Erreur dont le message peut être montré tel quel à l'utilisateur (admin ou Claude). */
export class ErreurMetier extends Error {
  constructor(message: string, readonly statut: 400 | 404 | 409 = 400) {
    super(message)
    this.name = 'ErreurMetier'
  }
}
```

- [ ] **Step 5 : créer `server/ids.ts`**

```ts
// 32 caractères, sans I, O, 0, 1 : lisibles dans une URL dictée ou recopiée.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function nouvelId(): string {
  return crypto.randomUUID()
}

/** Code d'URL d'un questionnaire : 10 caractères, soit 50 bits d'aléa. */
export function nouveauCode(): string {
  const octets = crypto.getRandomValues(new Uint8Array(10))
  // 256 est un multiple de 32 : le modulo ne biaise pas le tirage.
  return [...octets].map(o => ALPHABET[o % 32]).join('')
}

export function maintenantIso(): string {
  return new Date().toISOString()
}
```

- [ ] **Step 6 : compléter `server/auth.ts`** (ajouter après `motDePasseValide`)

```ts
/** Compare deux secrets sans fuite de durée. Deux chaînes vides ne sont jamais égales. */
export async function chainesEgales(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false
  const [x, y] = await Promise.all([hmacHex('comparaison', a), hmacHex('comparaison', b)])
  return egalEnTempsConstant(x, y)
}
```

- [ ] **Step 7 : compléter `server/env.ts`**

```ts
export interface Env {
  ANTHROPIC_API_KEY: string
  ADMIN_PASSWORD: string
  SESSION_SECRET: string
  /** Jeton d'accès au serveur MCP. Absent : le serveur MCP répond 500. */
  MCP_TOKEN?: string
  DB: D1Database
}
```

- [ ] **Step 8 : vérifier le succès**

Run : `npm test && npx tsc -b`
Expected : tous les tests passent, aucune erreur de type.

- [ ] **Step 9 : commit**

```bash
git add package.json package-lock.json server/erreurs.ts server/ids.ts server/auth.ts server/env.ts tests/server/ids.test.ts tests/server/auth.test.ts
git commit -m "feat: briques communes des services (erreurs, identifiants, comparaison de secrets)"
```

---

### Task 2 : Service logiciels

**Files :**
- Create : `server/services/logiciels.ts`, `tests/server/logiciels.test.ts`

- [ ] **Step 1 : écrire `tests/server/logiciels.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ErreurMetier } from '../../server/erreurs'
import { enregistrerLogiciel, lireLogiciel, listerLogiciels } from '../../server/services/logiciels'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
beforeAll(async () => { base = await creerBaseDeTest() })
afterAll(async () => { await base.fermer() })

describe('logiciels', () => {
  it('crée, relit et liste par ordre alphabétique', async () => {
    const zeendoc = await enregistrerLogiciel(base.db, { nom: 'Zeendoc', contexte: 'GED' })
    await enregistrerLogiciel(base.db, { nom: ' myCuma Infinity ' })
    expect((await lireLogiciel(base.db, zeendoc.id)).contexte).toBe('GED')
    expect((await listerLogiciels(base.db)).map(l => l.nom)).toEqual(['myCuma Infinity', 'Zeendoc'])
  })

  it('met à jour par identifiant', async () => {
    const cree = await enregistrerLogiciel(base.db, { nom: 'Divalto' })
    const maj = await enregistrerLogiciel(base.db, { id: cree.id, nom: 'Divalto Infinity', contexte: 'ERP' })
    expect(maj).toMatchObject({ id: cree.id, nom: 'Divalto Infinity', contexte: 'ERP' })
  })

  it('sans identifiant, un nom déjà connu met à jour la fiche au lieu de la dupliquer', async () => {
    const avant = (await listerLogiciels(base.db)).length
    const maj = await enregistrerLogiciel(base.db, { nom: 'zeendoc', contexte: 'GED en ligne' })
    expect(maj.nom).toBe('Zeendoc')
    expect(maj.contexte).toBe('GED en ligne')
    expect((await listerLogiciels(base.db)).length).toBe(avant)
  })

  it('conserve le contexte quand il est omis à la mise à jour', async () => {
    const maj = await enregistrerLogiciel(base.db, { nom: 'Zeendoc' })
    expect(maj.contexte).toBe('GED en ligne')
  })

  it('refuse un nom vide, un identifiant inconnu et un renommage en doublon', async () => {
    await expect(enregistrerLogiciel(base.db, { nom: '  ' })).rejects.toThrow(ErreurMetier)
    await expect(enregistrerLogiciel(base.db, { id: 'inconnu', nom: 'X' })).rejects.toMatchObject({ statut: 404 })
    const autre = await enregistrerLogiciel(base.db, { nom: 'Autre' })
    await expect(enregistrerLogiciel(base.db, { id: autre.id, nom: 'Zeendoc' })).rejects.toMatchObject({ statut: 409 })
    await expect(lireLogiciel(base.db, 'inconnu')).rejects.toMatchObject({ statut: 404 })
  })
})
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npm test -- tests/server/logiciels.test.ts`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : créer `server/services/logiciels.ts`**

```ts
import { ErreurMetier } from '../erreurs'
import { maintenantIso, nouvelId } from '../ids'

export interface Logiciel {
  id: string
  nom: string
  contexte: string
  cree_le: string
  maj_le: string
}

export interface SaisieLogiciel {
  id?: string
  nom: string
  /** Omis à la mise à jour : le contexte existant est conservé. */
  contexte?: string
}

export async function listerLogiciels(db: D1Database): Promise<Logiciel[]> {
  const { results } = await db.prepare('SELECT * FROM logiciels ORDER BY nom COLLATE NOCASE').all<Logiciel>()
  return results
}

export async function lireLogiciel(db: D1Database, id: string): Promise<Logiciel> {
  const logiciel = await db.prepare('SELECT * FROM logiciels WHERE id = ?').bind(id).first<Logiciel>()
  if (!logiciel) throw new ErreurMetier(`Logiciel introuvable : ${id}`, 404)
  return logiciel
}

/**
 * Crée ou met à jour une fiche. Sans `id`, un nom déjà connu (casse ignorée) désigne la fiche
 * existante : Claude peut ainsi enrichir un logiciel sans connaître son identifiant.
 */
export async function enregistrerLogiciel(db: D1Database, saisie: SaisieLogiciel): Promise<Logiciel> {
  const nom = saisie.nom.trim()
  if (!nom) throw new ErreurMetier('Le nom du logiciel est obligatoire.')
  const maintenant = maintenantIso()

  const existant = saisie.id
    ? await lireLogiciel(db, saisie.id)
    : await db.prepare('SELECT * FROM logiciels WHERE nom = ? COLLATE NOCASE').bind(nom).first<Logiciel>()

  if (!existant) {
    const id = nouvelId()
    await db.prepare('INSERT INTO logiciels (id, nom, contexte, cree_le, maj_le) VALUES (?,?,?,?,?)')
      .bind(id, nom, saisie.contexte ?? '', maintenant, maintenant).run()
    return lireLogiciel(db, id)
  }

  // Sans `id`, on garde le nom tel qu'il a été saisi la première fois.
  const nouveauNom = saisie.id ? nom : existant.nom
  if (nouveauNom.toLowerCase() !== existant.nom.toLowerCase()) {
    const doublon = await db.prepare('SELECT id FROM logiciels WHERE nom = ? COLLATE NOCASE AND id <> ?')
      .bind(nouveauNom, existant.id).first()
    if (doublon) throw new ErreurMetier(`Un logiciel nommé « ${nouveauNom} » existe déjà.`, 409)
  }
  await db.prepare('UPDATE logiciels SET nom = ?, contexte = ?, maj_le = ? WHERE id = ?')
    .bind(nouveauNom, saisie.contexte ?? existant.contexte, maintenant, existant.id).run()
  return lireLogiciel(db, existant.id)
}
```

- [ ] **Step 4 : vérifier le succès**

Run : `npm test -- tests/server/logiciels.test.ts`
Expected : 5 tests passés.

- [ ] **Step 5 : commit**

```bash
git add server/services/logiciels.ts tests/server/logiciels.test.ts
git commit -m "feat: service du référentiel des logiciels"
```

---

### Task 3 : Service projets

**Files :**
- Create : `server/services/projets.ts`, `tests/server/projets.test.ts`

- [ ] **Step 1 : écrire `tests/server/projets.test.ts`**

```ts
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
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npm test -- tests/server/projets.test.ts`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : créer `server/services/projets.ts`**

```ts
import { DEFAUTS, type Etape } from '../../shared/modeles'
import { ErreurMetier } from '../erreurs'
import { maintenantIso, nouvelId } from '../ids'
import type { Logiciel } from './logiciels'

export const TYPES_DEMANDE = ['evolution_simple', 'amelioration', 'nouvelle_fonctionnalite'] as const
export type TypeDemande = (typeof TYPES_DEMANDE)[number]

export const STATUTS_PROJET = ['brouillon', 'cadre', 'en_cours', 'clos'] as const
export type StatutProjet = (typeof STATUTS_PROJET)[number]

export interface Projet {
  id: string
  titre: string
  type_demande: TypeDemande
  description: string
  note_cadrage: string
  resume_contexte: string
  modele_cadrage: string
  modele_interview: string
  modele_analyse: string
  statut: StatutProjet
  cree_le: string
  maj_le: string
}

export interface DocumentProjet {
  id: string
  nom: string
  contenu: string
  cree_le: string
}

export interface QuestionnaireResume {
  id: string
  public_vise: string
  mode: string
  statut: string
  code: string
}

export interface ProjetComplet extends Projet {
  logiciels: Logiciel[]
  documents: DocumentProjet[]
  questionnaires: QuestionnaireResume[]
}

export interface ProjetResume {
  id: string
  titre: string
  type_demande: TypeDemande
  statut: StatutProjet
  /** Noms des logiciels, séparés par des virgules ; vide si aucun. */
  logiciels: string
  maj_le: string
}

export interface CreationProjet {
  titre: string
  type_demande: TypeDemande
  description?: string
  logiciel_ids?: string[]
  modeles?: Partial<Record<Etape, string>>
}

export interface ModificationProjet {
  titre?: string
  type_demande?: TypeDemande
  description?: string
  note_cadrage?: string
  resume_contexte?: string
  statut?: StatutProjet
  logiciel_ids?: string[]
}

async function lireLigne(db: D1Database, id: string): Promise<Projet> {
  const projet = await db.prepare('SELECT * FROM projets WHERE id = ?').bind(id).first<Projet>()
  if (!projet) throw new ErreurMetier(`Projet introuvable : ${id}`, 404)
  return projet
}

async function associerLogiciels(db: D1Database, projetId: string, ids: string[]): Promise<void> {
  const uniques = [...new Set(ids)]
  for (const id of uniques) {
    const existe = await db.prepare('SELECT id FROM logiciels WHERE id = ?').bind(id).first()
    if (!existe) throw new ErreurMetier(`Logiciel introuvable : ${id}`, 404)
  }
  await db.batch([
    db.prepare('DELETE FROM projet_logiciels WHERE projet_id = ?').bind(projetId),
    ...uniques.map(id =>
      db.prepare('INSERT INTO projet_logiciels (projet_id, logiciel_id) VALUES (?, ?)').bind(projetId, id)),
  ])
}

export async function lireProjet(db: D1Database, id: string): Promise<ProjetComplet> {
  const projet = await lireLigne(db, id)
  const [logiciels, documents, questionnaires] = await Promise.all([
    db.prepare(
      `SELECT l.* FROM logiciels l JOIN projet_logiciels pl ON pl.logiciel_id = l.id
       WHERE pl.projet_id = ? ORDER BY l.nom COLLATE NOCASE`,
    ).bind(id).all<Logiciel>(),
    db.prepare('SELECT id, nom, contenu, cree_le FROM documents WHERE projet_id = ? ORDER BY cree_le')
      .bind(id).all<DocumentProjet>(),
    db.prepare('SELECT id, public_vise, mode, statut, code FROM questionnaires WHERE projet_id = ? ORDER BY cree_le')
      .bind(id).all<QuestionnaireResume>(),
  ])
  return {
    ...projet,
    logiciels: logiciels.results,
    documents: documents.results,
    questionnaires: questionnaires.results,
  }
}

export async function listerProjets(
  db: D1Database, filtre: { logiciel_id?: string; statut?: StatutProjet } = {},
): Promise<ProjetResume[]> {
  const { results } = await db.prepare(
    `SELECT p.id, p.titre, p.type_demande, p.statut, p.maj_le,
            COALESCE((SELECT GROUP_CONCAT(l.nom, ', ') FROM projet_logiciels pl
                      JOIN logiciels l ON l.id = pl.logiciel_id WHERE pl.projet_id = p.id), '') AS logiciels
     FROM projets p
     WHERE (?1 IS NULL OR p.statut = ?1)
       AND (?2 IS NULL OR EXISTS (SELECT 1 FROM projet_logiciels pl
                                  WHERE pl.projet_id = p.id AND pl.logiciel_id = ?2))
     ORDER BY p.maj_le DESC`,
  ).bind(filtre.statut ?? null, filtre.logiciel_id ?? null).all<ProjetResume>()
  return results
}

export async function creerProjet(db: D1Database, saisie: CreationProjet): Promise<ProjetComplet> {
  const titre = saisie.titre.trim()
  if (!titre) throw new ErreurMetier('Le titre du projet est obligatoire.')
  const id = nouvelId()
  const maintenant = maintenantIso()
  await db.prepare(
    `INSERT INTO projets (id, titre, type_demande, description, modele_cadrage, modele_interview, modele_analyse, cree_le, maj_le)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id, titre, saisie.type_demande, saisie.description ?? '',
    saisie.modeles?.cadrage ?? DEFAUTS.cadrage,
    saisie.modeles?.interview ?? DEFAUTS.interview,
    saisie.modeles?.analyse ?? DEFAUTS.analyse,
    maintenant, maintenant,
  ).run()
  try {
    if (saisie.logiciel_ids?.length) await associerLogiciels(db, id, saisie.logiciel_ids)
  } catch (e) {
    // Pas de projet à moitié créé si un logiciel est inconnu.
    await db.prepare('DELETE FROM projets WHERE id = ?').bind(id).run()
    throw e
  }
  return lireProjet(db, id)
}

const CHAMPS_MODIFIABLES = ['titre', 'type_demande', 'description', 'note_cadrage', 'resume_contexte', 'statut'] as const

export async function modifierProjet(
  db: D1Database, id: string, modifs: ModificationProjet,
): Promise<ProjetComplet> {
  const actuel = await lireLigne(db, id)
  const maj: Record<string, string> = {}
  for (const champ of CHAMPS_MODIFIABLES) {
    const valeur = modifs[champ]
    if (valeur !== undefined) maj[champ] = champ === 'titre' ? valeur.trim() : valeur
  }
  if (maj.titre !== undefined && !maj.titre) throw new ErreurMetier('Le titre du projet est obligatoire.')
  // Un projet dont la note de cadrage vient d'être écrite est « cadré », sauf statut imposé.
  if (maj.statut === undefined && maj.note_cadrage?.trim() && actuel.statut === 'brouillon') maj.statut = 'cadre'

  if (modifs.logiciel_ids) await associerLogiciels(db, id, modifs.logiciel_ids)

  maj.maj_le = maintenantIso()
  // Les noms de colonnes viennent de CHAMPS_MODIFIABLES, jamais de la saisie.
  const colonnes = Object.keys(maj)
  await db.prepare(`UPDATE projets SET ${colonnes.map(c => `${c} = ?`).join(', ')} WHERE id = ?`)
    .bind(...colonnes.map(c => maj[c]), id).run()
  return lireProjet(db, id)
}

export async function ajouterDocument(
  db: D1Database, projetId: string, saisie: { nom: string; contenu: string },
): Promise<DocumentProjet> {
  await lireLigne(db, projetId)
  const nom = saisie.nom.trim()
  if (!nom || !saisie.contenu.trim()) throw new ErreurMetier('Le nom et le contenu du document sont obligatoires.')
  const document: DocumentProjet = { id: nouvelId(), nom, contenu: saisie.contenu, cree_le: maintenantIso() }
  await db.prepare('INSERT INTO documents (id, projet_id, nom, contenu, cree_le) VALUES (?,?,?,?,?)')
    .bind(document.id, projetId, document.nom, document.contenu, document.cree_le).run()
  return document
}
```

- [ ] **Step 4 : vérifier le succès**

Run : `npm test -- tests/server/projets.test.ts`
Expected : 8 tests passés. Si D1 refuse les paramètres numérotés `?1` / `?2` de `listerProjets`, les remplacer par quatre `?` et lier chaque valeur deux fois (`statut, statut, logiciel_id, logiciel_id`).

- [ ] **Step 5 : commit**

```bash
git add server/services/projets.ts tests/server/projets.test.ts
git commit -m "feat: service des projets, logiciels associés et documents"
```

---

### Task 4 : Questionnaires — validation du contenu

**Files :**
- Create : `server/services/questionnaires.ts`, `tests/server/questionnaires-contenu.test.ts`

- [ ] **Step 1 : écrire `tests/server/questionnaires-contenu.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { validerContenu } from '../../server/services/questionnaires'

const question = { type: 'texte', libelle: 'Que faites-vous ?', objectif: 'Comprendre le quotidien' }

describe('validerContenu — hybride', () => {
  it('accepte les quatre types et numérote les questions sans identifiant', () => {
    const contenu = validerContenu('hybride', {
      questions: [
        question,
        { id: 'frequence', type: 'choix_unique', libelle: 'À quelle fréquence ?', options: ['Jamais', 'Parfois'], objectif: 'o' },
        { type: 'choix_multiple', libelle: 'Quels outils ?', options: ['A', 'B', 'C'], objectif: 'o' },
        { type: 'echelle', libelle: 'Satisfaction ?', objectif: 'o' },
      ],
    })
    expect(contenu).toEqual({
      questions: [
        { id: 'q1', ...question },
        { id: 'frequence', type: 'choix_unique', libelle: 'À quelle fréquence ?', options: ['Jamais', 'Parfois'], objectif: 'o' },
        { id: 'q3', type: 'choix_multiple', libelle: 'Quels outils ?', options: ['A', 'B', 'C'], objectif: 'o' },
        { id: 'q4', type: 'echelle', libelle: 'Satisfaction ?', objectif: 'o' },
      ],
    })
  })

  it.each([
    ['aucune question', { questions: [] }, 'au moins une question'],
    ['pas de liste', {}, 'au moins une question'],
    ['type inconnu', { questions: [{ ...question, type: 'oui_non' }] }, 'Question 1 : type inconnu'],
    ['libellé vide', { questions: [{ ...question, libelle: ' ' }] }, 'Question 1 : libellé manquant'],
    ['objectif absent', { questions: [{ type: 'texte', libelle: 'x' }] }, 'Question 1 : objectif manquant'],
    ['choix sans options', { questions: [{ ...question, type: 'choix_unique' }] }, 'Question 1 : entre 2 et 10 options'],
    ['une seule option', { questions: [{ ...question, type: 'choix_unique', options: ['A'] }] }, 'entre 2 et 10 options'],
    ['options sur du texte', { questions: [{ ...question, options: ['A', 'B'] }] }, 'Question 1 : pas d\'options'],
    ['identifiants en double', { questions: [{ ...question, id: 'a' }, { ...question, id: 'a' }] }, 'Question 2 : identifiant « a » déjà utilisé'],
  ])('refuse : %s', (_cas, contenu, message) => {
    expect(() => validerContenu('hybride', contenu)).toThrow(message)
  })

  it('refuse plus de 40 questions', () => {
    const questions = Array.from({ length: 41 }, () => question)
    expect(() => validerContenu('hybride', { questions })).toThrow('40 questions au plus')
  })
})

describe('validerContenu — entretien', () => {
  it('accepte un guide et numérote les thèmes', () => {
    expect(validerContenu('entretien', {
      question_ouverture: 'Racontez-moi votre dernière clôture.',
      themes: [{ titre: 'Existant', objectif: 'Décrire le fonctionnement actuel' }],
    })).toEqual({
      question_ouverture: 'Racontez-moi votre dernière clôture.',
      themes: [{ id: 't1', titre: 'Existant', objectif: 'Décrire le fonctionnement actuel' }],
    })
  })

  it.each([
    ['ouverture absente', { themes: [{ titre: 'a', objectif: 'b' }] }, 'question d\'ouverture'],
    ['aucun thème', { question_ouverture: 'x', themes: [] }, 'au moins un thème'],
    ['thème sans objectif', { question_ouverture: 'x', themes: [{ titre: 'a' }] }, 'Thème 1 : objectif manquant'],
  ])('refuse : %s', (_cas, contenu, message) => {
    expect(() => validerContenu('entretien', contenu)).toThrow(message)
  })
})
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npm test -- tests/server/questionnaires-contenu.test.ts`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : créer `server/services/questionnaires.ts`** (première moitié : types et validation)

```ts
import { ErreurMetier } from '../erreurs'

export const MODES = ['hybride', 'entretien'] as const
export type Mode = (typeof MODES)[number]

export const TYPES_QUESTION = ['choix_unique', 'choix_multiple', 'echelle', 'texte'] as const
export type TypeQuestion = (typeof TYPES_QUESTION)[number]

export interface Question {
  id: string
  type: TypeQuestion
  libelle: string
  /** Présent uniquement pour les deux types « choix ». */
  options?: string[]
  /** Ce qu'on cherche à apprendre ; jamais montré au répondant, sert à décider d'une relance. */
  objectif: string
}

export interface Theme {
  id: string
  titre: string
  objectif: string
}

export interface ContenuHybride {
  questions: Question[]
}

export interface ContenuEntretien {
  question_ouverture: string
  themes: Theme[]
}

export type Contenu = ContenuHybride | ContenuEntretien

const QUESTIONS_MAX = 40
const THEMES_MAX = 12

function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur.trim() : ''
}

function validerHybride(brut: Record<string, unknown>): ContenuHybride {
  const liste = Array.isArray(brut.questions) ? brut.questions : []
  if (liste.length === 0) throw new ErreurMetier('Un questionnaire hybride contient au moins une question.')
  if (liste.length > QUESTIONS_MAX) throw new ErreurMetier(`Un questionnaire contient ${QUESTIONS_MAX} questions au plus.`)

  const vus = new Set<string>()
  const questions = liste.map((element, index): Question => {
    const q = (element ?? {}) as Record<string, unknown>
    const repere = `Question ${index + 1}`
    const type = q.type as TypeQuestion
    if (!TYPES_QUESTION.includes(type)) {
      throw new ErreurMetier(`${repere} : type inconnu (attendu : ${TYPES_QUESTION.join(', ')}).`)
    }
    const libelle = texte(q.libelle)
    if (!libelle) throw new ErreurMetier(`${repere} : libellé manquant.`)
    const objectif = texte(q.objectif)
    if (!objectif) throw new ErreurMetier(`${repere} : objectif manquant.`)

    const id = texte(q.id) || `q${index + 1}`
    if (vus.has(id)) throw new ErreurMetier(`${repere} : identifiant « ${id} » déjà utilisé.`)
    vus.add(id)

    if (type === 'choix_unique' || type === 'choix_multiple') {
      const options = Array.isArray(q.options) ? q.options.map(texte).filter(Boolean) : []
      if (options.length < 2 || options.length > 10) {
        throw new ErreurMetier(`${repere} : entre 2 et 10 options pour une question à choix.`)
      }
      return { id, type, libelle, options, objectif }
    }
    if (q.options !== undefined) throw new ErreurMetier(`${repere} : pas d'options pour une question de type ${type}.`)
    return { id, type, libelle, objectif }
  })
  return { questions }
}

function validerEntretien(brut: Record<string, unknown>): ContenuEntretien {
  const ouverture = texte(brut.question_ouverture)
  if (!ouverture) throw new ErreurMetier("Un entretien commence par une question d'ouverture.")
  const liste = Array.isArray(brut.themes) ? brut.themes : []
  if (liste.length === 0) throw new ErreurMetier('Un entretien couvre au moins un thème.')
  if (liste.length > THEMES_MAX) throw new ErreurMetier(`Un entretien couvre ${THEMES_MAX} thèmes au plus.`)

  const themes = liste.map((element, index): Theme => {
    const t = (element ?? {}) as Record<string, unknown>
    const repere = `Thème ${index + 1}`
    const titre = texte(t.titre)
    if (!titre) throw new ErreurMetier(`${repere} : titre manquant.`)
    const objectif = texte(t.objectif)
    if (!objectif) throw new ErreurMetier(`${repere} : objectif manquant.`)
    return { id: texte(t.id) || `t${index + 1}`, titre, objectif }
  })
  return { question_ouverture: ouverture, themes }
}

/** Vérifie et normalise le contenu d'un questionnaire ; les messages d'erreur disent quoi corriger. */
export function validerContenu(mode: Mode, contenu: unknown): Contenu {
  const brut = (contenu && typeof contenu === 'object' ? contenu : {}) as Record<string, unknown>
  return mode === 'hybride' ? validerHybride(brut) : validerEntretien(brut)
}
```

- [ ] **Step 4 : vérifier le succès**

Run : `npm test -- tests/server/questionnaires-contenu.test.ts`
Expected : 15 tests passés.

- [ ] **Step 5 : commit**

```bash
git add server/services/questionnaires.ts tests/server/questionnaires-contenu.test.ts
git commit -m "feat: validation du contenu des questionnaires"
```

---

### Task 5 : Questionnaires — brouillon, lecture, publication

**Files :**
- Modify : `server/services/questionnaires.ts`
- Create : `tests/server/questionnaires.test.ts`

- [ ] **Step 1 : écrire `tests/server/questionnaires.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { creerProjet, lireProjet } from '../../server/services/projets'
import { enregistrerQuestionnaire, lireQuestionnaire, publierQuestionnaire } from '../../server/services/questionnaires'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
let projetId: string

const hybride = { questions: [{ type: 'texte', libelle: 'Que faites-vous ?', objectif: 'Quotidien' }] }
const entretien = { question_ouverture: 'Racontez.', themes: [{ titre: 'Existant', objectif: 'Décrire' }] }

beforeAll(async () => {
  base = await creerBaseDeTest()
  projetId = (await creerProjet(base.db, { titre: 'Projet', type_demande: 'amelioration' })).id
})
afterAll(async () => { await base.fermer() })

describe('questionnaires', () => {
  it('crée un brouillon hybride avec ses valeurs par défaut', async () => {
    const q = await enregistrerQuestionnaire(base.db, {
      projet_id: projetId, public_vise: ' Comptables ', mode: 'hybride', contenu: hybride,
    })
    expect(q).toMatchObject({
      public_vise: 'Comptables', mode: 'hybride', statut: 'brouillon', introduction: '',
      duree_estimee_min: 10, relances_max_par_question: 1, tours_max: 12,
    })
    expect(q.code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/)
    expect(q.contenu).toEqual({ questions: [{ id: 'q1', ...hybride.questions[0] }] })
    expect(await lireQuestionnaire(base.db, q.id)).toEqual(q)
  })

  it('plafonne un entretien à 15 tours par défaut', async () => {
    const q = await enregistrerQuestionnaire(base.db, {
      projet_id: projetId, public_vise: 'Animateurs terrain', mode: 'entretien', contenu: entretien,
    })
    expect(q.tours_max).toBe(15)
  })

  it('remplace un brouillon en gardant son code', async () => {
    const q = await enregistrerQuestionnaire(base.db, {
      projet_id: projetId, public_vise: 'Directeurs', mode: 'hybride', contenu: hybride,
    })
    const maj = await enregistrerQuestionnaire(base.db, {
      id: q.id, projet_id: projetId, public_vise: 'Directeurs', mode: 'entretien', contenu: entretien,
      introduction: 'Bonjour', duree_estimee_min: 20, tours_max: 8,
    })
    expect(maj).toMatchObject({ id: q.id, code: q.code, mode: 'entretien', introduction: 'Bonjour', duree_estimee_min: 20, tours_max: 8 })
  })

  it('refuse un projet inconnu, un public vide, un contenu invalide et des plafonds hors bornes', async () => {
    const saisie = { projet_id: projetId, public_vise: 'X', mode: 'hybride' as const, contenu: hybride }
    await expect(enregistrerQuestionnaire(base.db, { ...saisie, projet_id: 'inconnu' })).rejects.toMatchObject({ statut: 404 })
    await expect(enregistrerQuestionnaire(base.db, { ...saisie, public_vise: ' ' })).rejects.toThrow('public visé')
    await expect(enregistrerQuestionnaire(base.db, { ...saisie, contenu: {} })).rejects.toThrow('au moins une question')
    await expect(enregistrerQuestionnaire(base.db, { ...saisie, relances_max_par_question: 4 })).rejects.toThrow('entre 0 et 3')
    await expect(enregistrerQuestionnaire(base.db, { ...saisie, tours_max: 0 })).rejects.toThrow('entre 1 et 30')
    await expect(enregistrerQuestionnaire(base.db, { ...saisie, duree_estimee_min: 0 })).rejects.toThrow('entre 1 et 120')
    await expect(lireQuestionnaire(base.db, 'inconnu')).rejects.toMatchObject({ statut: 404 })
  })

  it('publie : statut ouvert, URL dédiée, projet en cours', async () => {
    const q = await enregistrerQuestionnaire(base.db, {
      projet_id: projetId, public_vise: 'À publier', mode: 'hybride', contenu: hybride,
    })
    const publie = await publierQuestionnaire(base.db, q.id, 'https://interviews.exemple.fr')
    expect(publie.questionnaire.statut).toBe('ouvert')
    expect(publie.url).toBe(`https://interviews.exemple.fr/q/${q.code}`)
    expect((await lireProjet(base.db, projetId)).statut).toBe('en_cours')

    // Republier ne change rien et redonne la même URL.
    expect((await publierQuestionnaire(base.db, q.id, 'https://interviews.exemple.fr')).url).toBe(publie.url)

    // Un questionnaire publié n'est plus remplaçable.
    await expect(enregistrerQuestionnaire(base.db, {
      id: q.id, projet_id: projetId, public_vise: 'À publier', mode: 'hybride', contenu: hybride,
    })).rejects.toMatchObject({ statut: 409 })
  })

  it('refuse de publier un questionnaire clos', async () => {
    const q = await enregistrerQuestionnaire(base.db, {
      projet_id: projetId, public_vise: 'Clos', mode: 'hybride', contenu: hybride,
    })
    await base.db.prepare("UPDATE questionnaires SET statut = 'clos' WHERE id = ?").bind(q.id).run()
    await expect(publierQuestionnaire(base.db, q.id, 'https://x.fr')).rejects.toMatchObject({ statut: 409 })
  })

  it("refuse de rattacher un brouillon existant à un autre projet", async () => {
    const autre = (await creerProjet(base.db, { titre: 'Autre', type_demande: 'amelioration' })).id
    const q = await enregistrerQuestionnaire(base.db, {
      projet_id: projetId, public_vise: 'Fixe', mode: 'hybride', contenu: hybride,
    })
    await expect(enregistrerQuestionnaire(base.db, {
      id: q.id, projet_id: autre, public_vise: 'Fixe', mode: 'hybride', contenu: hybride,
    })).rejects.toThrow('appartient à un autre projet')
  })
})
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npm test -- tests/server/questionnaires.test.ts`
Expected : FAIL (`enregistrerQuestionnaire` non exporté).

- [ ] **Step 3 : compléter `server/services/questionnaires.ts`**

Remplacer la première ligne d'import par :

```ts
import { ErreurMetier } from '../erreurs'
import { maintenantIso, nouveauCode, nouvelId } from '../ids'
```

et ajouter à la fin du fichier :

```ts
export const STATUTS_QUESTIONNAIRE = ['brouillon', 'ouvert', 'clos'] as const
export type StatutQuestionnaire = (typeof STATUTS_QUESTIONNAIRE)[number]

export interface Questionnaire {
  id: string
  projet_id: string
  public_vise: string
  mode: Mode
  introduction: string
  duree_estimee_min: number
  contenu: Contenu
  relances_max_par_question: number
  tours_max: number
  code: string
  statut: StatutQuestionnaire
  cree_le: string
  maj_le: string
}

export interface SaisieQuestionnaire {
  /** Fourni : remplace ce brouillon. Absent : crée un nouveau questionnaire. */
  id?: string
  projet_id: string
  public_vise: string
  mode: Mode
  contenu: unknown
  introduction?: string
  duree_estimee_min?: number
  relances_max_par_question?: number
  tours_max?: number
}

/** Plafond de tours par défaut : relances au total en hybride, questions posées en entretien. */
const TOURS_MAX_DEFAUT: Record<Mode, number> = { hybride: 12, entretien: 15 }

type LigneQuestionnaire = Omit<Questionnaire, 'contenu'> & { contenu: string }

function borner(valeur: number | undefined, defaut: number, min: number, max: number, libelle: string): number {
  const n = valeur ?? defaut
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ErreurMetier(`${libelle} : un entier entre ${min} et ${max}.`)
  }
  return n
}

export async function lireQuestionnaire(db: D1Database, id: string): Promise<Questionnaire> {
  const ligne = await db.prepare('SELECT * FROM questionnaires WHERE id = ?').bind(id).first<LigneQuestionnaire>()
  if (!ligne) throw new ErreurMetier(`Questionnaire introuvable : ${id}`, 404)
  return { ...ligne, contenu: JSON.parse(ligne.contenu) as Contenu }
}

export async function enregistrerQuestionnaire(db: D1Database, saisie: SaisieQuestionnaire): Promise<Questionnaire> {
  const projet = await db.prepare('SELECT id FROM projets WHERE id = ?').bind(saisie.projet_id).first()
  if (!projet) throw new ErreurMetier(`Projet introuvable : ${saisie.projet_id}`, 404)

  const publicVise = saisie.public_vise.trim()
  if (!publicVise) throw new ErreurMetier('Le public visé est obligatoire.')
  const contenu = JSON.stringify(validerContenu(saisie.mode, saisie.contenu))
  const duree = borner(saisie.duree_estimee_min, 10, 1, 120, 'Durée estimée en minutes')
  const relances = borner(saisie.relances_max_par_question, 1, 0, 3, 'Relances par question')
  const tours = borner(saisie.tours_max, TOURS_MAX_DEFAUT[saisie.mode], 1, 30, 'Plafond de tours')
  const introduction = saisie.introduction ?? ''
  const maintenant = maintenantIso()

  if (saisie.id) {
    const existant = await lireQuestionnaire(db, saisie.id)
    if (existant.projet_id !== saisie.projet_id) {
      throw new ErreurMetier('Ce questionnaire appartient à un autre projet.', 409)
    }
    if (existant.statut !== 'brouillon') {
      throw new ErreurMetier('Ce questionnaire est déjà publié : il ne peut plus être remplacé. Créez-en un nouveau.', 409)
    }
    await db.prepare(
      `UPDATE questionnaires SET public_vise = ?, mode = ?, introduction = ?, duree_estimee_min = ?, contenu = ?,
              relances_max_par_question = ?, tours_max = ?, maj_le = ? WHERE id = ?`,
    ).bind(publicVise, saisie.mode, introduction, duree, contenu, relances, tours, maintenant, saisie.id).run()
    return lireQuestionnaire(db, saisie.id)
  }

  const id = nouvelId()
  await db.prepare(
    `INSERT INTO questionnaires (id, projet_id, public_vise, mode, introduction, duree_estimee_min, contenu,
                                 relances_max_par_question, tours_max, code, cree_le, maj_le)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id, saisie.projet_id, publicVise, saisie.mode, introduction, duree, contenu,
    relances, tours, nouveauCode(), maintenant, maintenant,
  ).run()
  return lireQuestionnaire(db, id)
}

export function urlPublique(origine: string, code: string): string {
  return `${origine.replace(/\/$/, '')}/q/${code}`
}

/** Ouvre le questionnaire aux répondants. Sans effet s'il est déjà ouvert. */
export async function publierQuestionnaire(
  db: D1Database, id: string, origine: string,
): Promise<{ questionnaire: Questionnaire; url: string }> {
  const questionnaire = await lireQuestionnaire(db, id)
  if (questionnaire.statut === 'clos') {
    throw new ErreurMetier('Ce questionnaire est clos : il ne peut pas être rouvert par cet outil.', 409)
  }
  if (questionnaire.statut === 'brouillon') {
    const maintenant = maintenantIso()
    await db.batch([
      db.prepare("UPDATE questionnaires SET statut = 'ouvert', maj_le = ? WHERE id = ?").bind(maintenant, id),
      db.prepare("UPDATE projets SET statut = 'en_cours', maj_le = ? WHERE id = ? AND statut IN ('brouillon', 'cadre')")
        .bind(maintenant, questionnaire.projet_id),
    ])
  }
  const publie = await lireQuestionnaire(db, id)
  return { questionnaire: publie, url: urlPublique(origine, publie.code) }
}
```

- [ ] **Step 4 : vérifier le succès**

Run : `npm test`
Expected : tous les tests passent, dont les 7 de `questionnaires.test.ts`.

- [ ] **Step 5 : commit**

```bash
git add server/services/questionnaires.ts tests/server/questionnaires.test.ts
git commit -m "feat: brouillon, lecture et publication des questionnaires"
```

---

### Task 6 : Guides de méthode

**Files :**
- Create : `server/guides.ts`, `tests/server/guides.test.ts`

Les guides sont la méthode que suit l'IA, quel que soit le canal : Claude les lit via l'outil `lire_guide`, et l'IA intégrée à l'admin (lot 5) les recevra comme consignes.

- [ ] **Step 1 : écrire `tests/server/guides.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { ETAPES_GUIDE, lireGuide } from '../../server/guides'

describe('guides', () => {
  it('fournit un guide pour chaque étape', () => {
    expect(ETAPES_GUIDE).toEqual(['cadrage', 'questionnaire'])
    for (const etape of ETAPES_GUIDE) expect(lireGuide(etape).length).toBeGreaterThan(800)
  })

  it('le guide de cadrage fixe la profondeur selon le type de demande', () => {
    const guide = lireGuide('cadrage')
    for (const repere of ['evolution_simple', 'amelioration', 'nouvelle_fonctionnalite', 'une seule question à la fois', 'modifier_projet']) {
      expect(guide).toContain(repere)
    }
  })

  it('le guide de questionnaire décrit les deux formats et les outils à appeler', () => {
    const guide = lireGuide('questionnaire')
    for (const repere of ['"questions"', '"question_ouverture"', 'choix_unique', 'echelle', 'objectif', 'enregistrer_questionnaire', 'publier_questionnaire']) {
      expect(guide).toContain(repere)
    }
  })
})
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npm test -- tests/server/guides.test.ts`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : créer `server/guides.ts`**

```ts
export const ETAPES_GUIDE = ['cadrage', 'questionnaire'] as const
export type EtapeGuide = (typeof ETAPES_GUIDE)[number]

const CADRAGE = `# Guide de cadrage d'un projet d'interview

But : comprendre assez bien la demande pour écrire ensuite les questions à poser aux utilisateurs. Tu interroges le porteur du projet ; lui connaît le métier et le logiciel, toi tu clarifies.

## Avant de poser une question

Lis le projet avec lire_projet : description, logiciels concernés et leur fiche de contexte, documents joints. Ne redemande jamais ce qui s'y trouve déjà.

## Profondeur selon le type de demande

- evolution_simple : le porteur sait ce qu'il veut vérifier. De 0 à 3 questions. Si la description suffit, n'en pose aucune et passe à la note.
- amelioration : jusqu'à 6 questions. Concentre-toi sur ce qui gêne aujourd'hui et sur ce qui doit changer.
- nouvelle_fonctionnalite : jusqu'à 12 questions. Le besoin est encore flou, c'est ici que le cadrage compte le plus.

Ces nombres sont des plafonds, pas des objectifs. Arrête-toi dès que tu peux écrire la note, et tout de suite si le porteur dit que cela suffit.

## Comment interroger

- Pose une seule question à la fois, puis attends la réponse.
- Préfère une question concrète (« qui fait cette saisie aujourd'hui, et à quel moment ? ») à une question générale (« quels sont les enjeux ? »).
- Quand une réponse est vague, demande un exemple réel avant de passer à la suite.
- Reformule en une phrase ce que tu as compris quand la réponse change ta compréhension du projet.
- Ne propose pas de solution : le but est de savoir quoi demander aux utilisateurs, pas de concevoir la fonctionnalité.

## Ce qu'il faut savoir à la fin

1. Objectif : quelle décision les réponses des utilisateurs doivent-elles éclairer ?
2. Publics : quels profils interroger (comptable, animateur terrain, responsable…), et en quoi leur regard diffère.
3. Existant : comment les choses se passent aujourd'hui, dans le logiciel et à côté.
4. Contraintes : ce qui ne changera pas (réglementaire, technique, calendrier).
5. Hors périmètre : ce qu'on ne veut pas ouvrir dans les entretiens.
6. Hypothèses à vérifier : ce que l'équipe croit savoir et veut confronter au terrain.

Pour une evolution_simple, les points 1, 2 et 6 suffisent.

## Note de cadrage

Rédige la note en Markdown, avec ces titres dans cet ordre : Objectif, Publics à interroger, Existant, Contraintes, Hors périmètre, Hypothèses à vérifier, Points encore ouverts. Écris des faits et des phrases complètes ; laisse une rubrique vide plutôt que de la remplir avec des suppositions, et range sous « Points encore ouverts » ce que le porteur n'a pas su dire.

Montre la note au porteur, corrige-la selon ses remarques, puis enregistre-la avec modifier_projet (champ note_cadrage). Si les documents joints sont longs, enregistre aussi un resume_contexte d'une vingtaine de lignes : il servira de contexte à chaque entretien à la place des documents complets.

Étape suivante : lire_guide avec l'étape « questionnaire ».`

const QUESTIONNAIRE = `# Guide de rédaction d'un questionnaire

But : à partir de la note de cadrage, écrire ce qui sera demandé aux utilisateurs. Relis le projet avec lire_projet avant de commencer. Si la note de cadrage est vide, fais d'abord le cadrage.

## Un questionnaire par public

Chaque public à interroger a son propre questionnaire et sa propre adresse. Un comptable et un animateur terrain ne vivent pas le même logiciel : n'écris pas un questionnaire commun avec des questions qui ne concernent que la moitié des gens.

## Choisir le mode

- hybride : une liste de questions identique pour tous, et l'IA peut relancer quand une réponse est vague. À choisir quand on veut comparer les réponses et quand le besoin est assez connu pour écrire les questions. C'est le bon choix pour une evolution_simple ou une amelioration.
- entretien : l'IA mène la conversation à partir d'un guide de thèmes. À choisir quand le besoin est encore à découvrir, typiquement une nouvelle_fonctionnalite, ou quand on interroge peu de personnes en profondeur.

## Écrire pour le répondant

- Il n'a pas lu la note de cadrage et ne connaît pas le vocabulaire du projet. Emploie les mots de son métier et les libellés qu'il voit à l'écran.
- Une question porte sur une seule chose. « Est-ce rapide et fiable ? » fait deux questions.
- Demande des faits avant des opinions : « comment avez-vous fait la dernière fois ? » apprend plus que « que pensez-vous de… ? ».
- Ne souffle pas la réponse : « à quel point ce nouvel écran vous ferait-il gagner du temps ? » suppose déjà qu'il en fait gagner.
- Commence par ce que la personne fait aujourd'hui, termine par ses attentes. Garde pour la fin une question ouverte : « qu'aurions-nous dû vous demander ? ».
- Vise 8 à 15 questions en mode hybride : au-delà de dix minutes, les réponses s'appauvrissent.

L'introduction est le premier écran que voit le répondant : en trois ou quatre phrases, dis qui pose les questions, pourquoi, combien de temps cela prend et ce qui sera fait des réponses.

## Format du contenu en mode hybride

{
  "questions": [
    { "type": "texte", "libelle": "Comment saisissez-vous vos temps aujourd'hui ?", "objectif": "Décrire la pratique réelle, outils annexes compris" },
    { "type": "choix_unique", "libelle": "À quelle fréquence faites-vous cette saisie ?", "options": ["Chaque jour", "Chaque semaine", "Chaque mois"], "objectif": "Mesurer la charge récurrente" },
    { "type": "choix_multiple", "libelle": "Quels écrans utilisez-vous pour cela ?", "options": ["Écran A", "Écran B", "Aucun"], "objectif": "Repérer les écrans concernés" },
    { "type": "echelle", "libelle": "Sur 5, à quel point cette saisie vous est-elle pénible ?", "objectif": "Hiérarchiser l'irritant" }
  ]
}

Types possibles : texte, choix_unique, choix_multiple, echelle (de 1 à 5). Les options, de 2 à 10, ne concernent que les deux types de choix. Chaque question accepte en plus un commentaire libre du répondant.

Le champ objectif est obligatoire et n'est jamais montré au répondant : il dit ce qu'on cherche à apprendre, et c'est d'après lui que l'IA jugera si une réponse mérite une relance. Écris-le précisément.

## Format du contenu en mode entretien

{
  "question_ouverture": "Pouvez-vous me raconter votre dernière clôture mensuelle, du début à la fin ?",
  "themes": [
    { "titre": "Fonctionnement actuel", "objectif": "Savoir qui fait quoi, quand, avec quels outils" },
    { "titre": "Difficultés", "objectif": "Obtenir des exemples précis de blocages et leur fréquence" }
  ]
}

De 3 à 6 thèmes en général, 12 au plus. La question d'ouverture invite à raconter une situation vécue.

## Enregistrer et publier

1. Montre le questionnaire au porteur du projet et corrige-le selon ses remarques.
2. Enregistre-le avec enregistrer_questionnaire : il reste en brouillon, modifiable en repassant son identifiant.
3. Quand le porteur le valide explicitement, publie-le avec publier_questionnaire et donne-lui l'adresse obtenue. Une fois publié, un questionnaire ne peut plus être remplacé : ne publie jamais de ta propre initiative.`

const GUIDES: Record<EtapeGuide, string> = { cadrage: CADRAGE, questionnaire: QUESTIONNAIRE }

export function lireGuide(etape: EtapeGuide): string {
  return GUIDES[etape]
}
```

- [ ] **Step 4 : vérifier le succès**

Run : `npm test -- tests/server/guides.test.ts`
Expected : 3 tests passés.

- [ ] **Step 5 : commit**

```bash
git add server/guides.ts tests/server/guides.test.ts
git commit -m "feat: guides de cadrage et de rédaction de questionnaire"
```

---

### Task 7 : Outils MCP

**Files :**
- Create : `server/mcp/outils.ts`, `tests/server/outils-mcp.test.ts`

- [ ] **Step 1 : écrire `tests/server/outils-mcp.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { OUTILS, appelerOutil, type Contexte } from '../../server/mcp/outils'
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
  it('expose les douze outils du lot, sans outil de suppression', () => {
    expect(OUTILS.map(o => o.nom).sort()).toEqual([
      'ajouter_document', 'creer_projet', 'enregistrer_logiciel', 'enregistrer_questionnaire',
      'lire_guide', 'lire_logiciel', 'lire_projet', 'lire_questionnaire',
      'lister_logiciels', 'lister_projets', 'modifier_projet', 'publier_questionnaire',
    ])
    for (const outil of OUTILS) expect(outil.description.length, outil.nom).toBeGreaterThan(40)
  })

  it('marque en lecture seule les outils qui ne modifient rien', () => {
    const lecture = OUTILS.filter(o => o.lectureSeule).map(o => o.nom).sort()
    expect(lecture).toEqual(['lire_guide', 'lire_logiciel', 'lire_projet', 'lire_questionnaire', 'lister_logiciels', 'lister_projets'])
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
    expect(relu.documents).toHaveLength(1)
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

  it('refuse un outil inconnu', async () => {
    const resultat = await appelerOutil(ctx, 'supprimer_projet', {})
    expect(resultat).toEqual({ content: [{ type: 'text', text: 'Outil inconnu : supprimer_projet' }], isError: true })
  })
})
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npm test -- tests/server/outils-mcp.test.ts`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : créer `server/mcp/outils.ts`**

```ts
import { z } from 'zod'
import { ErreurMetier } from '../erreurs'
import { ETAPES_GUIDE, lireGuide } from '../guides'
import { enregistrerLogiciel, lireLogiciel, listerLogiciels } from '../services/logiciels'
import {
  STATUTS_PROJET, TYPES_DEMANDE, ajouterDocument, creerProjet, lireProjet, listerProjets, modifierProjet,
} from '../services/projets'
import { MODES, enregistrerQuestionnaire, lireQuestionnaire, publierQuestionnaire } from '../services/questionnaires'

export interface Contexte {
  db: D1Database
  /** Origine du site (https://hôte), pour construire l'adresse des questionnaires. */
  origine: string
}

export interface ResultatOutil {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

export interface Outil {
  nom: string
  description: string
  lectureSeule: boolean
  schema: z.ZodObject
  /** Renvoie une chaîne (rendue telle quelle) ou une valeur (rendue en JSON). */
  executer: (ctx: Contexte, args: never) => Promise<unknown>
}

/** Lie le type des arguments au schéma, puis oublie ce type pour ranger l'outil dans une liste. */
function outil<S extends z.ZodObject>(definition: {
  nom: string
  description: string
  lectureSeule: boolean
  schema: S
  executer: (ctx: Contexte, args: z.infer<S>) => Promise<unknown>
}): Outil {
  return definition as unknown as Outil
}

const idProjet = z.string().describe('Identifiant du projet, tel que renvoyé par creer_projet ou lister_projets')
const idQuestionnaire = z.string().describe('Identifiant du questionnaire')

export const OUTILS: Outil[] = [
  outil({
    nom: 'lire_guide',
    description:
      "Renvoie la méthode à suivre pour une étape : « cadrage » (interroger le porteur du projet et rédiger la note de cadrage) ou « questionnaire » (rédiger, enregistrer et publier un questionnaire). À lire avant de commencer l'étape.",
    lectureSeule: true,
    schema: z.object({ etape: z.enum(ETAPES_GUIDE) }),
    executer: async (_ctx, { etape }) => lireGuide(etape),
  }),
  outil({
    nom: 'lister_logiciels',
    description: "Liste les logiciels du référentiel avec leur identifiant et leur fiche de contexte. À consulter pour rattacher un projet à un logiciel.",
    lectureSeule: true,
    schema: z.object({}),
    executer: async ctx => listerLogiciels(ctx.db),
  }),
  outil({
    nom: 'lire_logiciel',
    description: "Renvoie la fiche d'un logiciel : nom et contexte (description, vocabulaire métier, publics).",
    lectureSeule: true,
    schema: z.object({ logiciel_id: z.string() }),
    executer: async (ctx, { logiciel_id }) => lireLogiciel(ctx.db, logiciel_id),
  }),
  outil({
    nom: 'enregistrer_logiciel',
    description:
      "Crée un logiciel dans le référentiel, ou met à jour sa fiche. Sans logiciel_id, un nom déjà connu met à jour la fiche existante. Le contexte est réutilisé par tous les projets rattachés : description du logiciel, vocabulaire métier, publics.",
    lectureSeule: false,
    schema: z.object({
      logiciel_id: z.string().optional().describe('À fournir pour renommer un logiciel existant'),
      nom: z.string().min(1),
      contexte: z.string().optional().describe('Omis : le contexte existant est conservé'),
    }),
    executer: async (ctx, { logiciel_id, nom, contexte }) => enregistrerLogiciel(ctx.db, { id: logiciel_id, nom, contexte }),
  }),
  outil({
    nom: 'lister_projets',
    description: 'Liste les projets d\'interview, du plus récemment modifié au plus ancien, avec filtre facultatif par logiciel ou par statut. Sert à retrouver un projet existant.',
    lectureSeule: true,
    schema: z.object({
      logiciel_id: z.string().optional(),
      statut: z.enum(STATUTS_PROJET).optional(),
    }),
    executer: async (ctx, filtre) => listerProjets(ctx.db, filtre),
  }),
  outil({
    nom: 'lire_projet',
    description:
      'Renvoie tout le contexte d\'un projet : description, type de demande, logiciels et leur fiche, documents joints, note de cadrage, liste des questionnaires. À appeler avant tout cadrage ou toute rédaction de questionnaire.',
    lectureSeule: true,
    schema: z.object({ projet_id: idProjet }),
    executer: async (ctx, { projet_id }) => lireProjet(ctx.db, projet_id),
  }),
  outil({
    nom: 'creer_projet',
    description:
      "Crée un projet d'interview en brouillon. type_demande règle la profondeur du cadrage : evolution_simple (on sait quoi demander), amelioration, nouvelle_fonctionnalite (besoin à préciser). Après création, lire le guide de cadrage.",
    lectureSeule: false,
    schema: z.object({
      titre: z.string().min(1),
      type_demande: z.enum(TYPES_DEMANDE),
      description: z.string().optional().describe('La demande telle que le porteur du projet la formule'),
      logiciel_ids: z.array(z.string()).optional().describe('Identifiants issus de lister_logiciels'),
    }),
    executer: async (ctx, saisie) => creerProjet(ctx.db, saisie),
  }),
  outil({
    nom: 'modifier_projet',
    description:
      "Met à jour un projet ; seuls les champs fournis changent. C'est ici qu'on enregistre la note de cadrage (note_cadrage, en Markdown) et le résumé de contexte (resume_contexte). logiciel_ids remplace la liste des logiciels.",
    lectureSeule: false,
    schema: z.object({
      projet_id: idProjet,
      titre: z.string().min(1).optional(),
      type_demande: z.enum(TYPES_DEMANDE).optional(),
      description: z.string().optional(),
      note_cadrage: z.string().optional(),
      resume_contexte: z.string().optional(),
      statut: z.enum(STATUTS_PROJET).optional(),
      logiciel_ids: z.array(z.string()).optional(),
    }),
    executer: async (ctx, { projet_id, ...modifs }) => modifierProjet(ctx.db, projet_id, modifs),
  }),
  outil({
    nom: 'ajouter_document',
    description: "Joint au projet un document de contexte sous forme de texte (extrait de documentation, compte rendu, spécification). Le document sert au cadrage et à la rédaction des questions.",
    lectureSeule: false,
    schema: z.object({
      projet_id: idProjet,
      nom: z.string().min(1).describe('Nom lisible, par exemple « Guide de saisie des temps »'),
      contenu: z.string().min(1).max(200_000),
    }),
    executer: async (ctx, { projet_id, nom, contenu }) => ajouterDocument(ctx.db, projet_id, { nom, contenu }),
  }),
  outil({
    nom: 'enregistrer_questionnaire',
    description:
      "Crée un questionnaire en brouillon pour un public donné, ou remplace un brouillon existant si questionnaire_id est fourni. Le format de « contenu » dépend du mode et est décrit dans le guide « questionnaire ». Ne publie rien.",
    lectureSeule: false,
    schema: z.object({
      questionnaire_id: idQuestionnaire.optional().describe('À fournir pour remplacer un brouillon'),
      projet_id: idProjet,
      public_vise: z.string().min(1).describe('Par exemple « Comptables de CUMA »'),
      mode: z.enum(MODES),
      contenu: z.record(z.string(), z.unknown()).describe('Hybride : { questions: [...] }. Entretien : { question_ouverture, themes: [...] }'),
      introduction: z.string().optional().describe("Texte d'accueil montré au répondant"),
      duree_estimee_min: z.number().int().optional(),
      relances_max_par_question: z.number().int().optional().describe('Mode hybride, de 0 à 3 ; 1 par défaut'),
      tours_max: z.number().int().optional().describe('Plafond de relances au total (hybride, 12 par défaut) ou de questions (entretien, 15 par défaut)'),
    }),
    executer: async (ctx, { questionnaire_id, ...saisie }) =>
      enregistrerQuestionnaire(ctx.db, { id: questionnaire_id, ...saisie }),
  }),
  outil({
    nom: 'lire_questionnaire',
    description: 'Renvoie un questionnaire complet : public, mode, introduction, contenu, plafonds, statut et code d\'URL.',
    lectureSeule: true,
    schema: z.object({ questionnaire_id: idQuestionnaire }),
    executer: async (ctx, { questionnaire_id }) => lireQuestionnaire(ctx.db, questionnaire_id),
  }),
  outil({
    nom: 'publier_questionnaire',
    description:
      "Ouvre un questionnaire aux répondants et renvoie son adresse publique. Action visible de l'extérieur et sans retour par cet outil : à n'appeler qu'après validation explicite du porteur du projet. Un questionnaire publié ne peut plus être remplacé.",
    lectureSeule: false,
    schema: z.object({ questionnaire_id: idQuestionnaire }),
    executer: async (ctx, { questionnaire_id }) => {
      const { questionnaire, url } = await publierQuestionnaire(ctx.db, questionnaire_id, ctx.origine)
      return { url, statut: questionnaire.statut, questionnaire_id: questionnaire.id, public_vise: questionnaire.public_vise }
    },
  }),
]

function enErreur(message: string): ResultatOutil {
  return { content: [{ type: 'text', text: message }], isError: true }
}

/** Exécute un outil sur des arguments déjà validés ; une erreur métier devient un résultat d'erreur lisible. */
export async function executerOutil(ctx: Contexte, outilChoisi: Outil, args: unknown): Promise<ResultatOutil> {
  try {
    const valeur = await outilChoisi.executer(ctx, args as never)
    const text = typeof valeur === 'string' ? valeur : JSON.stringify(valeur, null, 2)
    return { content: [{ type: 'text', text }] }
  } catch (e) {
    if (e instanceof ErreurMetier) return enErreur(e.message)
    throw e
  }
}

/** Point d'entrée hors SDK (tests, futurs appels internes) : trouve l'outil et valide les arguments. */
export async function appelerOutil(ctx: Contexte, nom: string, args: unknown): Promise<ResultatOutil> {
  const outilChoisi = OUTILS.find(o => o.nom === nom)
  if (!outilChoisi) return enErreur(`Outil inconnu : ${nom}`)
  const analyse = outilChoisi.schema.safeParse(args ?? {})
  if (!analyse.success) {
    const details = analyse.error.issues.map(i => `${i.path.join('.') || 'arguments'} : ${i.message}`).join(' ; ')
    return enErreur(`Arguments invalides — ${details}`)
  }
  return executerOutil(ctx, outilChoisi, analyse.data)
}
```

- [ ] **Step 4 : vérifier le succès**

Run : `npm test -- tests/server/outils-mcp.test.ts && npx tsc -b`
Expected : 6 tests passés, aucune erreur de type. Si la version installée de Zod n'exporte pas `z.ZodObject` sans paramètre de type, écrire `z.ZodObject<z.ZodRawShape>` aux trois endroits.

- [ ] **Step 5 : commit**

```bash
git add server/mcp/outils.ts tests/server/outils-mcp.test.ts
git commit -m "feat: outils MCP de cadrage, de questionnaire et de publication"
```

---

### Task 8 : Serveur MCP et points d'accès

**Files :**
- Create : `server/mcp/serveur.ts`, `server/mcp/acces.ts`, `functions/mcp/[jeton].ts`, `functions/mcp/index.ts`, `tests/functions/mcp.test.ts`

- [ ] **Step 1 : lire l'API du SDK installé**

Le SDK MCP a changé d'API entre ses versions majeures. Avant d'écrire, ouvrir les types de `node_modules/@modelcontextprotocol/server` et de `node_modules/@modelcontextprotocol/client` et confirmer : les exports `McpServer` et `WebStandardStreamableHTTPServerTransport` ; la signature de `registerTool` (forme attendue pour `inputSchema` : objet Zod ou simple dictionnaire de champs, et forme de `annotations`) ; côté client, `Client`, `StreamableHTTPClientTransport` et son option `fetch`. Adapter le code des steps suivants à ce qui est réellement exporté, sans changer le comportement décrit.

- [ ] **Step 2 : écrire `tests/functions/mcp.test.ts`**

```ts
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { onRequest as parJeton } from '../../functions/mcp/[jeton]'
import { onRequest as parEnTete } from '../../functions/mcp/index'
import { creerBaseDeTest } from '../helpers/d1'

const JETON = 'jeton-de-test-0123456789'
let base: Awaited<ReturnType<typeof creerBaseDeTest>>

beforeAll(async () => { base = await creerBaseDeTest() })
afterAll(async () => { await base.fermer() })

function contexte(requete: Request, jeton?: string, env: object = { MCP_TOKEN: JETON, DB: base.db }) {
  return { request: requete, env, params: jeton === undefined ? {} : { jeton } } as never
}

const corpsListe = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })

function post(url: string, enTetes: Record<string, string> = {}): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...enTetes },
    body: corpsListe,
  })
}

describe('contrôle du jeton', () => {
  it('refuse un mauvais jeton dans l\'URL', async () => {
    const reponse = await parJeton(contexte(post('https://exemple.test/mcp/faux'), 'faux'))
    expect(reponse.status).toBe(401)
  })

  it('refuse une requête sans en-tête Authorization, ou avec un mauvais jeton', async () => {
    expect((await parEnTete(contexte(post('https://exemple.test/mcp')))).status).toBe(401)
    const mauvais = post('https://exemple.test/mcp', { Authorization: 'Bearer faux' })
    expect((await parEnTete(contexte(mauvais))).status).toBe(401)
  })

  it('répond 500 si MCP_TOKEN n\'est pas configuré, même avec un jeton vide', async () => {
    const reponse = await parJeton(contexte(post('https://exemple.test/mcp/'), '', { DB: base.db }))
    expect(reponse.status).toBe(500)
  })
})

describe('protocole, via le client officiel', () => {
  async function connecter(url: string, enTetes: Record<string, string>, traiter: (r: Request) => Promise<Response>) {
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: enTetes },
      fetch: async (entree, init) => traiter(new Request(entree as string | URL, init)),
    })
    const client = new Client({ name: 'test', version: '1.0.0' })
    await client.connect(transport)
    return client
  }

  it('liste les outils et en appelle un, jeton dans l\'URL', async () => {
    const client = await connecter(`https://exemple.test/mcp/${JETON}`, {}, r => parJeton(contexte(r, JETON)))
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name)).toContain('creer_projet')
    expect(tools).toHaveLength(12)
    expect(tools.find(t => t.name === 'lire_projet')?.inputSchema.required).toEqual(['projet_id'])

    const resultat = await client.callTool({ name: 'enregistrer_logiciel', arguments: { nom: 'Zeendoc' } })
    const contenu = resultat.content as { type: string; text: string }[]
    expect(JSON.parse(contenu[0].text)).toMatchObject({ nom: 'Zeendoc' })
    await client.close()
  })

  it('fonctionne aussi avec le jeton en en-tête Bearer', async () => {
    const client = await connecter(
      'https://exemple.test/mcp', { Authorization: `Bearer ${JETON}` }, r => parEnTete(contexte(r)),
    )
    const resultat = await client.callTool({ name: 'lister_logiciels', arguments: {} })
    const contenu = resultat.content as { type: string; text: string }[]
    expect(JSON.parse(contenu[0].text)).toHaveLength(1)
    await client.close()
  })

  it('renvoie une erreur d\'outil lisible, sans casser la session', async () => {
    const client = await connecter(`https://exemple.test/mcp/${JETON}`, {}, r => parJeton(contexte(r, JETON)))
    const resultat = await client.callTool({ name: 'lire_projet', arguments: { projet_id: 'inconnu' } })
    expect(resultat.isError).toBe(true)
    expect((resultat.content as { text: string }[])[0].text).toBe('Projet introuvable : inconnu')
    await client.close()
  })
})
```

- [ ] **Step 3 : vérifier l'échec**

Run : `npm test -- tests/functions/mcp.test.ts`
Expected : FAIL (modules `functions/mcp/*` introuvables).

- [ ] **Step 4 : créer `server/mcp/serveur.ts`**

```ts
import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server'
import { OUTILS, executerOutil, type Contexte } from './outils'

/**
 * Traite une requête MCP. Sans état : un serveur et un transport par requête,
 * ce qui convient à une Pages Function et évite toute session à stocker.
 */
export async function traiterRequeteMcp(requete: Request, ctx: Contexte): Promise<Response> {
  const serveur = new McpServer({ name: 'interviews-utilisateurs', version: '1.0.0' })
  for (const outil of OUTILS) {
    serveur.registerTool(
      outil.nom,
      {
        description: outil.description,
        inputSchema: outil.schema,
        annotations: { readOnlyHint: outil.lectureSeule },
      },
      async (args: unknown) => executerOutil(ctx, outil, args),
    )
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await serveur.connect(transport)
  return transport.handleRequest(requete)
}
```

- [ ] **Step 5 : créer `server/mcp/acces.ts`**

```ts
import { chainesEgales } from '../auth'
import type { Env } from '../env'
import { erreur } from '../http'
import { traiterRequeteMcp } from './serveur'

/** Vérifie le jeton présenté puis passe la main au serveur MCP. */
export async function servirMcp(requete: Request, env: Env, jetonPresente: string): Promise<Response> {
  if (!env.MCP_TOKEN) return erreur('MCP_TOKEN non configuré.', 500)
  if (!(await chainesEgales(jetonPresente, env.MCP_TOKEN))) return erreur('Jeton MCP invalide.', 401)
  return traiterRequeteMcp(requete, { db: env.DB, origine: new URL(requete.url).origin })
}
```

- [ ] **Step 6 : créer `functions/mcp/[jeton].ts`**

```ts
import type { Env } from '../../server/env'
import { servirMcp } from '../../server/mcp/acces'

/** Accès par jeton dans l'URL : la seule forme acceptée par un connecteur personnalisé sans OAuth. */
export const onRequest: PagesFunction<Env, 'jeton'> = async ({ request, env, params }) => {
  return servirMcp(request, env, String(params.jeton ?? ''))
}
```

- [ ] **Step 7 : créer `functions/mcp/index.ts`**

```ts
import type { Env } from '../../server/env'
import { servirMcp } from '../../server/mcp/acces'

/** Accès par en-tête `Authorization: Bearer <jeton>`, pour les clients qui savent envoyer des en-têtes. */
export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const enTete = request.headers.get('Authorization') ?? ''
  const jeton = enTete.startsWith('Bearer ') ? enTete.slice('Bearer '.length).trim() : ''
  return servirMcp(request, env, jeton)
}
```

- [ ] **Step 8 : vérifier le succès**

Run : `npm test && npx tsc -b`
Expected : tous les tests passent, dont les 6 de `mcp.test.ts`.

Si un test du bloc « protocole » échoue à cause d'un nom ou d'une option du client différent dans la version installée, corriger le test selon l'API réelle constatée au step 1 ; les assertions (12 outils, schéma de `lire_projet`, résultats d'appel, erreur lisible) ne changent pas.

- [ ] **Step 9 : commit**

```bash
git add server/mcp/serveur.ts server/mcp/acces.ts functions/mcp tests/functions/mcp.test.ts
git commit -m "feat: serveur MCP sans état, protégé par jeton"
```

---

### Task 9 : Contrôle dans le runtime Cloudflare local

Les tests tournent sous Node ; ce contrôle vérifie que le SDK MCP fonctionne aussi dans `workerd`, le runtime réel.

**Files :**
- Create : `scripts/verifier-mcp.mjs`
- Modify : `.dev.vars` (local, non versionné)

- [ ] **Step 1 : créer `scripts/verifier-mcp.mjs`**

```js
// Contrôle de bout en bout du serveur MCP local.
// Usage : MCP_TOKEN=<jeton> node scripts/verifier-mcp.mjs [http://localhost:8790]
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

const base = process.argv[2] ?? 'http://localhost:8790'
const jeton = process.env.MCP_TOKEN
if (!jeton) {
  console.error('MCP_TOKEN manquant dans l\'environnement.')
  process.exit(1)
}

const client = new Client({ name: 'verification', version: '1.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp/${jeton}`)))

const { tools } = await client.listTools()
console.log(`${tools.length} outils :`, tools.map(t => t.name).join(', '))

const guide = await client.callTool({ name: 'lire_guide', arguments: { etape: 'cadrage' } })
console.log('lire_guide →', guide.content[0].text.split('\n')[0])

const projets = await client.callTool({ name: 'lister_projets', arguments: {} })
console.log('lister_projets →', JSON.parse(projets.content[0].text).length, 'projet(s)')

await client.close()
if (tools.length !== 12) process.exit(1)
```

- [ ] **Step 2 : jeton local**

Ajouter à `.dev.vars` une ligne `MCP_TOKEN=` suivie de 32 caractères aléatoires, si elle n'y est pas (par exemple la sortie de `node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"`). Ne pas afficher la valeur dans les comptes rendus.

- [ ] **Step 3 : lancer**

```bash
npm run build
npm run db:local
npm run pages:dev          # dans un terminal à part, ou via la configuration « vasseur-api »
```

Si le port 8790 est déjà occupé par un ancien serveur wrangler, l'arrêter ou le faire arrêter par son propriétaire avant de relancer : il n'aurait ni le nouveau code ni le jeton.

Puis, le jeton étant lu depuis `.dev.vars` sans être affiché :

```bash
MCP_TOKEN=$(grep '^MCP_TOKEN=' .dev.vars | cut -d= -f2-) node scripts/verifier-mcp.mjs
```

Expected :

```
12 outils : lire_guide, lister_logiciels, …
lire_guide → # Guide de cadrage d'un projet d'interview
lister_projets → 0 projet(s)
```

- [ ] **Step 4 : si le serveur échoue au démarrage ou à la première requête**

Cause probable : le SDK utilise une API Node absente de `workerd`. Dans ce cas, et seulement dans ce cas, ajouter à `wrangler.toml` la ligne `compatibility_flags = ["nodejs_compat"]`, porter `compatibility_date` à `"2024-09-23"` dans `wrangler.toml` et dans le script `pages:dev` de `package.json`, puis relancer le step 3. Relancer aussi `npm test` et refaire dans le navigateur les contrôles 1 à 5 du plan du lot 1 (connexion et catalogue de modèles), puisque la date de compatibilité concerne toute l'application.

- [ ] **Step 5 : contrôle négatif**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8790/mcp/mauvais-jeton -H "Content-Type: application/json" -d "{}"
```

Expected : `401`.

- [ ] **Step 6 : commit**

```bash
git add scripts/verifier-mcp.mjs
# si le step 4 a été nécessaire : git add wrangler.toml package.json
git commit -m "chore: script de contrôle du serveur MCP"
```

---

### Task 10 : Documentation

**Files :**
- Create : `docs/mcp.md`
- Modify : `.dev.vars.example`, `CLAUDE.md`, `docs/superpowers/specs/2026-11-25-interview-utilisateurs-design.md`

- [ ] **Step 1 : compléter `.dev.vars.example`** (ajouter à la fin)

```
# Jeton d'accès au serveur MCP : 32 caractères aléatoires ou plus
MCP_TOKEN=remplacez-par-une-longue-chaine-aleatoire
```

- [ ] **Step 2 : créer `docs/mcp.md`**

````markdown
# Serveur MCP — cadrer et publier depuis Claude

Le serveur MCP permet de créer un projet d'interview, de le cadrer, d'écrire ses questionnaires et de les publier depuis Claude, sans consommer de tokens API. Les entretiens avec les répondants, eux, passent toujours par l'API.

## Adresse

`https://<votre-domaine>/mcp/<MCP_TOKEN>`

Le jeton fait partie de l'adresse : la traiter comme un mot de passe. Changer le secret `MCP_TOKEN` dans Cloudflare coupe aussitôt l'accès à toutes les personnes qui avaient l'ancienne adresse.

## Brancher Claude

- **Claude (web et bureau)** : Paramètres → Connecteurs → Ajouter un connecteur personnalisé, puis coller l'adresse. Laisser les champs OAuth vides.
- **Claude Code** :

```bash
claude mcp add --transport http interviews https://<votre-domaine>/mcp/<MCP_TOKEN>
```

Les clients capables d'envoyer des en-têtes peuvent utiliser `https://<votre-domaine>/mcp` avec `Authorization: Bearer <MCP_TOKEN>`.

## Déroulé type d'une conversation

1. « Crée un projet d'interview sur … pour le logiciel … » → `enregistrer_logiciel` si besoin, puis `creer_projet`.
2. « Cadre ce projet avec moi » → Claude lit `lire_guide` (cadrage) et `lire_projet`, vous interroge, puis enregistre la note par `modifier_projet`.
3. « Prépare le questionnaire pour les comptables » → `lire_guide` (questionnaire), puis `enregistrer_questionnaire` en brouillon.
4. « Publie-le » → `publier_questionnaire` renvoie l'adresse à diffuser.

## Outils

| Outil | Rôle | Modifie |
|---|---|---|
| `lire_guide` | méthode de cadrage ou de rédaction | non |
| `lister_logiciels`, `lire_logiciel` | référentiel | non |
| `enregistrer_logiciel` | crée ou met à jour une fiche | oui |
| `lister_projets`, `lire_projet` | retrouver un projet et son contexte | non |
| `creer_projet`, `modifier_projet` | créer, cadrer, changer de statut | oui |
| `ajouter_document` | joindre un texte de contexte | oui |
| `enregistrer_questionnaire`, `lire_questionnaire` | brouillon de questionnaire | oui / non |
| `publier_questionnaire` | ouvre aux répondants, renvoie l'adresse | oui |

Aucun outil ne supprime quoi que ce soit. Un questionnaire publié ne peut plus être remplacé.

## Contrôle local

```bash
MCP_TOKEN=<jeton de .dev.vars> node scripts/verifier-mcp.mjs
```
````

- [ ] **Step 3 : mettre à jour `CLAUDE.md`**

Dans le bloc d'arborescence de « Architecture », remplacer la ligne `server/` et la ligne `functions/api/` par :

```
server/                — logique serveur : auth, modeles, http, env, ids, erreurs, guides
  services/            — logiciels, projets, questionnaires (règles métier sur D1)
  mcp/                 — outils, serveur et contrôle d'accès MCP
functions/api/         — routes : messages.ts (proxy), admin/*
functions/mcp/         — serveur MCP : /mcp/<jeton> et /mcp (Bearer)
scripts/               — verifier-mcp.mjs
```

Ajouter une section après « Navigation » :

```markdown
## Serveur MCP

Cadrage, questionnaires et publication depuis Claude : voir `docs/mcp.md`. Secret `MCP_TOKEN`.
Toute règle métier vit dans `server/services/` ; un outil MCP ne fait que valider ses arguments et appeler un service.
```

Dans « Déploiement Cloudflare Pages », compléter la ligne des secrets : `# Secrets : ANTHROPIC_API_KEY, ADMIN_PASSWORD, SESSION_SECRET, MCP_TOKEN`.

- [ ] **Step 4 : mettre à jour la spec**

Dans `docs/superpowers/specs/2026-11-25-interview-utilisateurs-design.md` :

- section 6, tableau des outils : ajouter la ligne `| \`ajouter_document\` | joint au projet un texte de contexte |` ;
- section 10, remplacer le point 2 par :

```markdown
2. **Admin sans IA + MCP**, en deux temps :
   - **2A — Services et MCP** : services logiciels, projets, questionnaires ; serveur MCP avec `lire_guide`. Cadrage, génération et publication sont alors faisables dans Claude.
   - **2B — Écrans admin** : API admin et écrans des logiciels, des projets, d'édition et de publication des questionnaires.
```

- et ajouter à la fin du point 4 : « Les outils MCP de lecture des réponses et de dépôt d'analyses sont livrés avec ce lot. »

- [ ] **Step 5 : commit**

```bash
git add .dev.vars.example docs/mcp.md CLAUDE.md docs/superpowers/specs
git commit -m "docs: serveur MCP et découpage du lot 2"
```

---

## Mise en production (actions de Guillaume)

1. Ajouter le secret `MCP_TOKEN` (32 caractères aléatoires ou plus) dans Cloudflare Pages, en production.
2. Après déploiement, brancher Claude sur `https://<domaine>/mcp/<MCP_TOKEN>` (voir `docs/mcp.md`).
3. Dans une conversation, demander « liste mes projets d'interview » : la réponse attendue est une liste vide, signe que le connecteur et la base répondent.

Tant que le lot 3 n'est pas livré, l'adresse `/q/<code>` renvoyée par `publier_questionnaire` affiche « Lien invalide » : ne pas diffuser d'adresse avant.

---

## Auto-relecture

- **Couverture de la spec** : référentiel de logiciels avec fiche de contexte → Task 2 ; projet, type de demande, logiciels, documents, note de cadrage, modèles par étape, statuts → Task 3 ; contenu des deux modes, plafonds, code d'URL, publication → Tasks 4 et 5 ; guides partagés → Task 6 ; outils MCP sans suppression → Task 7 ; point d'accès par jeton ou Bearer, sans état → Task 8.
- **Reports assumés** : outils de lecture des réponses et d'analyse (lot 4) ; API REST et écrans admin (lot 2B) ; règle « un questionnaire ouvert sans réponse reste modifiable » simplifiée en « seul un brouillon est remplaçable », à rouvrir au lot 2B si l'édition après publication s'avère utile.
- **Cohérence des noms** : `ErreurMetier`, `nouvelId`, `nouveauCode`, `maintenantIso`, `chainesEgales` (Task 1) ; `enregistrerLogiciel`, `lireLogiciel`, `listerLogiciels` (Task 2) ; `creerProjet`, `modifierProjet`, `lireProjet`, `listerProjets`, `ajouterDocument`, `TYPES_DEMANDE`, `STATUTS_PROJET` (Task 3) ; `validerContenu`, `MODES`, `enregistrerQuestionnaire`, `lireQuestionnaire`, `publierQuestionnaire` (Tasks 4 et 5) ; `ETAPES_GUIDE`, `lireGuide` (Task 6) ; `OUTILS`, `executerOutil`, `appelerOutil`, `Contexte` (Task 7) ; `traiterRequeteMcp`, `servirMcp` (Task 8).
- **Risque identifié** : l'API exacte du SDK MCP v2 et son fonctionnement dans `workerd` ; couvert par le step 1 de la Task 8 et par la Task 9.
