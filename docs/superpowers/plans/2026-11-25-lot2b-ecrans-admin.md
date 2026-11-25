# Lot 2B — API admin et écrans : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** gérer dans l'admin web, sans IA, les logiciels, les projets (documents, note de cadrage, modèles) et les questionnaires (édition, publication, clôture), y compris ceux créés depuis Claude par le MCP.

**Architecture :** une API REST sous `/api/admin/*`, déjà protégée par la garde de session du lot 1, dont chaque route valide son entrée avec Zod puis appelle un service de `server/services/`. Les types et constantes métier passent dans `shared/` pour être lus par le navigateur. Le front ajoute des routes imbriquées sous `/admin` avec une mise en page commune ; la logique d'édition d'un questionnaire est une bibliothèque de fonctions pures, testée hors React.

**Tech stack :** Cloudflare Pages Functions, D1, Zod, React 18, React Router 6, Tailwind, `pdfjs-dist` (extraction de texte des PDF dans le navigateur), Vitest.

**Spec :** `docs/superpowers/specs/2026-11-25-interview-utilisateurs-design.md`, section 4 (points 2, 3, 4 et 6) et section 7.

**Hors de ce lot :** dialogue de cadrage et génération par l'IA dans l'admin (lot 5), invitations et suivi des répondants (lot 3), analyses et exports (lot 4).

**Règles retenues :**
- seul un questionnaire en brouillon est modifiable ou supprimable ; un questionnaire ouvert peut être clos, pas rouvert ;
- supprimer un projet supprime tout ce qui en dépend, après confirmation affichant le nombre d'entretiens commencés ;
- pas de suppression de logiciel (une fiche se renomme ou se corrige) ;
- l'adresse publique d'un questionnaire est construite par le navigateur (`origine du site + /q/ + code`).

**Forme de ce plan :** le serveur, l'API, le client d'API et la logique d'édition sont donnés avec leur code et leurs tests. Les écrans React (Tasks 7 à 10) sont donnés sous forme de contrat précis — données, actions, états, composants à réutiliser — et vérifiés dans le navigateur par la liste de contrôles de la Task 11, faute de tests de composants dans ce projet.

---

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `shared/interviews.ts` | créer — types et constantes métier communs (déplacés depuis `server/services/`) |
| `server/services/*.ts` | modifier — réexportent `shared/`, plus `supprimerProjet`, `compterEntretiens`, `supprimerDocument`, modèles modifiables, `cloreQuestionnaire`, `supprimerQuestionnaire` |
| `server/api.ts` | créer — enveloppe de route (erreurs) et lecture validée du corps |
| `server/schemas.ts` | créer — schémas Zod des corps de requête |
| `functions/api/admin/logiciels/…`, `projets/…`, `documents/…`, `questionnaires/…` | créer — routes REST |
| `src/admin/api.ts` | créer — client d'API typé |
| `src/admin/contenu.ts` | créer — fonctions pures d'édition d'un questionnaire |
| `src/admin/extraction.ts` | créer — texte d'un fichier `.txt`, `.md` ou `.pdf` |
| `src/admin/AdminLayout.tsx`, `src/admin/champs.tsx` | créer — mise en page et champs de formulaire communs |
| `src/admin/ProjetsScreen.tsx`, `LogicielsScreen.tsx`, `ProjetNouveauScreen.tsx`, `ProjetScreen.tsx`, `QuestionnaireScreen.tsx` | créer — écrans |
| `src/admin/AdminHome.tsx` | supprimer — remplacé par `ProjetsScreen` |
| `src/main.tsx` | modifier — routes imbriquées |
| `tests/server/*.test.ts`, `tests/functions/api-admin.test.ts`, `tests/src/contenu.test.ts` | créer ou compléter |

---

### Task 0 : Branche

- [ ] **Step 1**

```bash
git checkout lot2a-services-mcp
git status --short                      # doit être vide
git checkout -b lot2b-ecrans-admin
git merge --no-edit lot1-socle          # reprend le commit « base D1 distincte pour les previews » (wrangler.toml)
npm test                                # 161 tests verts attendus
```

Si la fusion signale un conflit, il ne peut porter que sur `wrangler.toml` : garder les deux blocs D1 (production et preview) et le nom `vasseur-interview-critique`.

---

### Task 1 : Types et constantes dans `shared/`

Le navigateur ne peut pas importer `server/` (types Workers). On déplace donc les déclarations métier, sans en changer une ligne.

**Files :**
- Create : `shared/interviews.ts`
- Modify : `server/services/logiciels.ts`, `server/services/projets.ts`, `server/services/questionnaires.ts`, `server/services/limites.ts`

- [ ] **Step 1 : déplacer vers `shared/interviews.ts`**

Y couper-coller, à l'identique (commentaires compris), depuis les services :

- de `logiciels.ts` : `Logiciel` ;
- de `projets.ts` : `TYPES_DEMANDE`, `TypeDemande`, `STATUTS_PROJET`, `StatutProjet`, `Projet`, `DocumentProjet`, `QuestionnaireResume`, `ProjetComplet`, `ProjetResume` ;
- de `questionnaires.ts` : `MODES`, `Mode`, `TYPES_QUESTION`, `TypeQuestion`, `Question`, `Theme`, `ContenuHybride`, `ContenuEntretien`, `Contenu`, `STATUTS_QUESTIONNAIRE`, `StatutQuestionnaire`, `Questionnaire` ;
- de `limites.ts` : la constante `LIMITES`.

`shared/interviews.ts` n'importe rien de `server/` et n'utilise aucun type Workers (`D1Database`…). Les interfaces de saisie (`SaisieLogiciel`, `CreationProjet`, `ModificationProjet`, `SaisieQuestionnaire`) restent dans les services.

- [ ] **Step 2 : réexporter depuis les services**

Dans chaque service, remplacer les déclarations déplacées par un import pour l'usage interne et une réexportation, pour que tous les imports existants (`server/mcp/outils.ts`, tests) continuent de fonctionner sans modification. Exemple pour `projets.ts` :

```ts
import {
  STATUTS_PROJET, TYPES_DEMANDE,
  type DocumentProjet, type Projet, type ProjetComplet, type ProjetResume,
  type QuestionnaireResume, type StatutProjet, type TypeDemande,
} from '../../shared/interviews'

export { STATUTS_PROJET, TYPES_DEMANDE }
export type { DocumentProjet, Projet, ProjetComplet, ProjetResume, QuestionnaireResume, StatutProjet, TypeDemande }
```

- [ ] **Step 3 : vérifier**

Run : `npm test && npx tsc -b`
Expected : 161 tests verts, aucune erreur de type, et aucun fichier de test modifié (`git status --short tests` vide).

- [ ] **Step 4 : commit**

```bash
git add shared/interviews.ts server/services
git commit -m "refactor: types et constantes métier dans shared/"
```

---

### Task 2 : Compléments des services

**Files :**
- Modify : `server/services/projets.ts`, `server/services/questionnaires.ts`
- Create : `tests/server/services-admin.test.ts`

- [ ] **Step 1 : écrire `tests/server/services-admin.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ajouterDocument, compterEntretiens, creerProjet, lireProjet, modifierProjet, supprimerDocument, supprimerProjet,
} from '../../server/services/projets'
import {
  cloreQuestionnaire, enregistrerQuestionnaire, lireQuestionnaire, publierQuestionnaire, supprimerQuestionnaire,
} from '../../server/services/questionnaires'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
beforeAll(async () => { base = await creerBaseDeTest() })
afterAll(async () => { await base.fermer() })

const contenu = { questions: [{ type: 'texte', libelle: 'Que faites-vous ?', objectif: 'Quotidien' }] }

async function projet(titre: string): Promise<string> {
  return (await creerProjet(base.db, { titre, type_demande: 'amelioration' })).id
}

async function questionnaire(projetId: string, publicVise = 'Comptables') {
  return enregistrerQuestionnaire(base.db, { projet_id: projetId, public_vise: publicVise, mode: 'hybride', contenu })
}

async function repondant(questionnaireId: string, id: string, statut: 'invite' | 'commence' | 'termine') {
  await base.db.prepare(
    "INSERT INTO repondants (id, questionnaire_id, jeton, origine, statut) VALUES (?, ?, ?, 'invitation', ?)",
  ).bind(id, questionnaireId, `jeton-${id}`, statut).run()
}

describe('modèles du projet', () => {
  it('modifie un modèle sans toucher aux autres', async () => {
    const id = await projet('Modèles')
    const avant = await lireProjet(base.db, id)
    const apres = await modifierProjet(base.db, id, { modeles: { interview: 'claude-haiku-5-5' } })
    expect(apres.modele_interview).toBe('claude-haiku-5-5')
    expect(apres.modele_cadrage).toBe(avant.modele_cadrage)
    expect(apres.modele_analyse).toBe(avant.modele_analyse)
  })

  it('refuse un identifiant de modèle vide', async () => {
    const id = await projet('Modèle vide')
    await expect(modifierProjet(base.db, id, { modeles: { analyse: ' ' } })).rejects.toMatchObject({ statut: 400 })
  })
})

describe('documents', () => {
  it('supprime un document et refuse un identifiant inconnu', async () => {
    const id = await projet('Docs')
    const doc = await ajouterDocument(base.db, id, { nom: 'a.md', contenu: 'texte' })
    await supprimerDocument(base.db, doc.id)
    expect((await lireProjet(base.db, id)).documents).toEqual([])
    await expect(supprimerDocument(base.db, doc.id)).rejects.toMatchObject({ statut: 404 })
  })
})

describe('suppression de projet', () => {
  it("compte les entretiens commencés ou terminés, pas les simples invitations", async () => {
    const id = await projet('À compter')
    const q = await questionnaire(id)
    await repondant(q.id, 'r1', 'invite')
    await repondant(q.id, 'r2', 'commence')
    await repondant(q.id, 'r3', 'termine')
    expect(await compterEntretiens(base.db, id)).toBe(2)
    expect(await compterEntretiens(base.db, await projet('Vide'))).toBe(0)
  })

  it('supprime le projet et tout ce qui en dépend', async () => {
    const id = await projet('À supprimer')
    const q = await questionnaire(id)
    await repondant(q.id, 'r4', 'commence')
    await ajouterDocument(base.db, id, { nom: 'a', contenu: 'b' })
    await supprimerProjet(base.db, id)
    await expect(lireProjet(base.db, id)).rejects.toMatchObject({ statut: 404 })
    await expect(lireQuestionnaire(base.db, q.id)).rejects.toMatchObject({ statut: 404 })
    const reste = await base.db.prepare("SELECT COUNT(*) AS n FROM repondants WHERE id = 'r4'").first<{ n: number }>()
    expect(reste!.n).toBe(0)
    await expect(supprimerProjet(base.db, id)).rejects.toMatchObject({ statut: 404 })
  })
})

describe('clôture et suppression de questionnaire', () => {
  it('clôt un questionnaire ouvert, et lui seul', async () => {
    const id = await projet('Clôture')
    const q = await questionnaire(id)
    await expect(cloreQuestionnaire(base.db, q.id)).rejects.toMatchObject({ statut: 409 })
    await publierQuestionnaire(base.db, q.id, 'https://x.fr')
    expect((await cloreQuestionnaire(base.db, q.id)).statut).toBe('clos')
    await expect(cloreQuestionnaire(base.db, q.id)).rejects.toMatchObject({ statut: 409 })
    await expect(cloreQuestionnaire(base.db, 'inconnu')).rejects.toMatchObject({ statut: 404 })
  })

  it('supprime un brouillon, refuse un questionnaire publié', async () => {
    const id = await projet('Suppression')
    const brouillon = await questionnaire(id, 'Brouillon')
    await supprimerQuestionnaire(base.db, brouillon.id)
    await expect(lireQuestionnaire(base.db, brouillon.id)).rejects.toMatchObject({ statut: 404 })

    const publie = await questionnaire(id, 'Publié')
    await publierQuestionnaire(base.db, publie.id, 'https://x.fr')
    await expect(supprimerQuestionnaire(base.db, publie.id)).rejects.toMatchObject({ statut: 409 })
    expect((await lireQuestionnaire(base.db, publie.id)).statut).toBe('ouvert')
  })
})
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npm test -- tests/server/services-admin.test.ts`
Expected : FAIL (fonctions non exportées).

- [ ] **Step 3 : compléter `server/services/projets.ts`**

Lire d'abord le fichier tel qu'il est après le lot 2A, puis :

1. Ajouter `modeles?: Partial<Record<Etape, string>>` à `ModificationProjet`. Dans `modifierProjet`, pour chaque étape fournie (`cadrage`, `interview`, `analyse`), mettre à jour la colonne `modele_<étape>` dans la même requête `UPDATE` que les autres champs ; refuser une valeur vide ou faite d'espaces par `ErreurMetier('Le modèle « <étape> » est obligatoire.')`. Les noms de colonnes restent issus d'une liste constante du code, jamais de la saisie.

2. Ajouter à la fin :

```ts
/** Entretiens commencés ou terminés du projet : ce que perdrait une suppression. */
export async function compterEntretiens(db: D1Database, projetId: string): Promise<number> {
  const ligne = await db.prepare(
    `SELECT COUNT(*) AS n FROM repondants r JOIN questionnaires q ON q.id = r.questionnaire_id
     WHERE q.projet_id = ? AND r.statut <> 'invite'`,
  ).bind(projetId).first<{ n: number }>()
  return ligne?.n ?? 0
}

/** Supprime le projet ; documents, questionnaires, répondants, tours et analyses partent en cascade. */
export async function supprimerProjet(db: D1Database, id: string): Promise<void> {
  const resultat = await db.prepare('DELETE FROM projets WHERE id = ?').bind(id).run()
  if (resultat.meta.changes === 0) throw new ErreurMetier(`Projet introuvable : ${id}`, 404)
}

export async function supprimerDocument(db: D1Database, id: string): Promise<void> {
  const resultat = await db.prepare('DELETE FROM documents WHERE id = ?').bind(id).run()
  if (resultat.meta.changes === 0) throw new ErreurMetier(`Document introuvable : ${id}`, 404)
}
```

- [ ] **Step 4 : compléter `server/services/questionnaires.ts`** (ajouter à la fin)

```ts
/** Ferme un questionnaire ouvert : plus aucune réponse n'est acceptée. */
export async function cloreQuestionnaire(db: D1Database, id: string): Promise<Questionnaire> {
  const resultat = await db.prepare(
    "UPDATE questionnaires SET statut = 'clos', maj_le = ? WHERE id = ? AND statut = 'ouvert'",
  ).bind(maintenantIso(), id).run()
  const questionnaire = await lireQuestionnaire(db, id)
  if (resultat.meta.changes === 0) {
    throw new ErreurMetier('Seul un questionnaire ouvert peut être clos.', 409)
  }
  return questionnaire
}

/** Supprime un brouillon. Un questionnaire publié porte des réponses : il se clôt, il ne se supprime pas. */
export async function supprimerQuestionnaire(db: D1Database, id: string): Promise<void> {
  const resultat = await db.prepare("DELETE FROM questionnaires WHERE id = ? AND statut = 'brouillon'").bind(id).run()
  if (resultat.meta.changes > 0) return
  await lireQuestionnaire(db, id)
  throw new ErreurMetier('Seul un questionnaire en brouillon peut être supprimé.', 409)
}
```

Dans `cloreQuestionnaire`, `lireQuestionnaire` lève le 404 pour un identifiant inconnu avant le contrôle du nombre de lignes.

- [ ] **Step 5 : vérifier le succès**

Run : `npm test && npx tsc -b`
Expected : tous les tests passent, dont les 7 nouveaux.

- [ ] **Step 6 : commit**

```bash
git add server/services tests/server/services-admin.test.ts
git commit -m "feat: suppression, clôture et modèles modifiables dans les services"
```

---

### Task 3 : Enveloppe de route et schémas

**Files :**
- Create : `server/api.ts`, `server/schemas.ts`, `tests/server/api.test.ts`

- [ ] **Step 1 : écrire `tests/server/api.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { lireCorps, route } from '../../server/api'
import { ErreurMetier } from '../../server/erreurs'
import { schemaCreationProjet, schemaQuestionnaire } from '../../server/schemas'

function requete(corps: string): Request {
  return new Request('https://exemple.test/api/admin/x', { method: 'POST', body: corps })
}

describe('route', () => {
  it('renvoie la réponse du traitement', async () => {
    const reponse = await route(async () => new Response('ok'))({} as never)
    expect(await reponse.text()).toBe('ok')
  })

  it("traduit une erreur métier en réponse JSON à son statut", async () => {
    const reponse = await route(async () => { throw new ErreurMetier('Introuvable', 404) })({} as never)
    expect(reponse.status).toBe(404)
    expect(await reponse.json()).toEqual({ error: { message: 'Introuvable' } })
  })

  it("cache une erreur inattendue derrière un 500 générique et la journalise", async () => {
    const journal = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reponse = await route(async () => { throw new Error('D1_ERROR: détail interne') })({} as never)
    expect(reponse.status).toBe(500)
    expect(await reponse.json()).toEqual({ error: { message: 'Erreur interne du serveur.' } })
    expect(journal).toHaveBeenCalled()
    journal.mockRestore()
  })
})

describe('lireCorps', () => {
  const schema = z.object({ nom: z.string().min(1) })

  it('renvoie le corps validé', async () => {
    expect(await lireCorps(requete('{"nom":"a"}'), schema)).toEqual({ nom: 'a' })
  })

  it('refuse un JSON illisible et des données invalides, en nommant le champ', async () => {
    await expect(lireCorps(requete('pas du json'), schema)).rejects.toThrow('Corps de requête JSON invalide.')
    await expect(lireCorps(requete('{"nom":""}'), schema)).rejects.toThrow(/Données invalides — nom/)
  })
})

describe('schémas', () => {
  it('accepte un projet minimal et refuse un type inconnu', () => {
    expect(schemaCreationProjet.safeParse({ titre: 'T', type_demande: 'amelioration' }).success).toBe(true)
    expect(schemaCreationProjet.safeParse({ titre: 'T', type_demande: 'autre' }).success).toBe(false)
  })

  it('exige public, mode et contenu pour un questionnaire', () => {
    expect(schemaQuestionnaire.safeParse({ public_vise: 'P', mode: 'hybride', contenu: {} }).success).toBe(true)
    expect(schemaQuestionnaire.safeParse({ public_vise: 'P', mode: 'hybride' }).success).toBe(false)
  })
})
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npm test -- tests/server/api.test.ts`
Expected : FAIL (modules introuvables).

- [ ] **Step 3 : créer `server/api.ts`**

```ts
import type { z } from 'zod'
import type { Env } from './env'
import { ErreurMetier } from './erreurs'
import { erreur } from './http'

/**
 * Enveloppe d'une route admin : une erreur métier devient une réponse JSON à son statut,
 * toute autre erreur est journalisée et masquée derrière un 500 générique.
 */
export function route<P extends string = never>(
  traiter: (contexte: EventContext<Env, P, Record<string, unknown>>) => Promise<Response>,
): PagesFunction<Env, P> {
  return async contexte => {
    try {
      return await traiter(contexte)
    } catch (e) {
      if (e instanceof ErreurMetier) return erreur(e.message, e.statut)
      console.error('API admin :', e)
      return erreur('Erreur interne du serveur.', 500)
    }
  }
}

/** Lit le corps JSON et le valide ; l'erreur nomme les champs fautifs. */
export async function lireCorps<S extends z.ZodType>(requete: Request, schema: S): Promise<z.infer<S>> {
  let brut: unknown
  try {
    brut = await requete.json()
  } catch {
    throw new ErreurMetier('Corps de requête JSON invalide.')
  }
  const analyse = schema.safeParse(brut)
  if (!analyse.success) {
    const details = analyse.error.issues.map(i => `${i.path.join('.') || 'corps'} : ${i.message}`).join(' ; ')
    throw new ErreurMetier(`Données invalides — ${details}`)
  }
  return analyse.data
}

/** Paramètre de chemin `[id]` sous forme de chaîne. */
export function parametre(valeur: string | string[] | undefined): string {
  return Array.isArray(valeur) ? valeur[0] ?? '' : valeur ?? ''
}
```

- [ ] **Step 4 : créer `server/schemas.ts`**

```ts
import { z } from 'zod'
import { MODES, STATUTS_PROJET, TYPES_DEMANDE } from '../shared/interviews'

// Ces schémas vérifient la forme ; les règles (longueurs, unicité, statuts) restent dans les services.

const modeles = z.object({
  cadrage: z.string().optional(),
  interview: z.string().optional(),
  analyse: z.string().optional(),
})

export const schemaLogiciel = z.object({
  nom: z.string().min(1),
  contexte: z.string().optional(),
})

export const schemaCreationProjet = z.object({
  titre: z.string().min(1),
  type_demande: z.enum(TYPES_DEMANDE),
  description: z.string().optional(),
  logiciel_ids: z.array(z.string()).optional(),
  modeles: modeles.optional(),
})

export const schemaModificationProjet = z.object({
  titre: z.string().min(1).optional(),
  type_demande: z.enum(TYPES_DEMANDE).optional(),
  description: z.string().optional(),
  note_cadrage: z.string().optional(),
  resume_contexte: z.string().optional(),
  statut: z.enum(STATUTS_PROJET).optional(),
  logiciel_ids: z.array(z.string()).optional(),
  modeles: modeles.optional(),
})

export const schemaDocument = z.object({
  nom: z.string().min(1),
  contenu: z.string().min(1),
})

export const schemaQuestionnaire = z.object({
  public_vise: z.string().min(1),
  mode: z.enum(MODES),
  contenu: z.record(z.string(), z.unknown()),
  introduction: z.string().optional(),
  duree_estimee_min: z.number().int().optional(),
  relances_max_par_question: z.number().int().optional(),
  tours_max: z.number().int().optional(),
})
```

- [ ] **Step 5 : vérifier le succès**

Run : `npm test -- tests/server/api.test.ts && npx tsc -b`
Expected : 7 tests passés, aucune erreur de type.

- [ ] **Step 6 : commit**

```bash
git add server/api.ts server/schemas.ts tests/server/api.test.ts
git commit -m "feat: enveloppe de route et schémas de l'API admin"
```

---

### Task 4 : Routes REST

**Files :**
- Create : `functions/api/admin/logiciels/index.ts`, `functions/api/admin/logiciels/[id].ts`, `functions/api/admin/projets/index.ts`, `functions/api/admin/projets/[id]/index.ts`, `functions/api/admin/projets/[id]/documents.ts`, `functions/api/admin/projets/[id]/questionnaires.ts`, `functions/api/admin/documents/[id].ts`, `functions/api/admin/questionnaires/[id]/index.ts`, `functions/api/admin/questionnaires/[id]/publier.ts`, `functions/api/admin/questionnaires/[id]/clore.ts`, `tests/functions/api-admin.test.ts`

| Méthode et chemin | Effet | Réponse |
|---|---|---|
| `GET /api/admin/logiciels` | liste | 200, `Logiciel[]` |
| `POST /api/admin/logiciels` | crée ; 409 si le nom existe | 201, `Logiciel` |
| `GET` / `PUT /api/admin/logiciels/:id` | lit / met à jour | 200, `Logiciel` |
| `GET /api/admin/projets?logiciel_id=&statut=` | liste filtrée | 200, `ProjetResume[]` |
| `POST /api/admin/projets` | crée | 201, `ProjetComplet` |
| `GET /api/admin/projets/:id` | lit, avec `nb_entretiens` | 200, `ProjetComplet & { nb_entretiens }` |
| `PUT /api/admin/projets/:id` | modifie les champs fournis | 200, `ProjetComplet` |
| `DELETE /api/admin/projets/:id` | supprime en cascade | 204 |
| `POST /api/admin/projets/:id/documents` | ajoute un document | 201, `DocumentProjet` |
| `DELETE /api/admin/documents/:id` | supprime un document | 204 |
| `POST /api/admin/projets/:id/questionnaires` | crée un brouillon | 201, `Questionnaire` |
| `GET` / `PUT /api/admin/questionnaires/:id` | lit / remplace un brouillon | 200, `Questionnaire` |
| `DELETE /api/admin/questionnaires/:id` | supprime un brouillon | 204 |
| `POST /api/admin/questionnaires/:id/publier` | ouvre | 200, `Questionnaire` |
| `POST /api/admin/questionnaires/:id/clore` | clôt | 200, `Questionnaire` |

- [ ] **Step 1 : écrire `tests/functions/api-admin.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as documentsId from '../../functions/api/admin/documents/[id]'
import * as logiciels from '../../functions/api/admin/logiciels/index'
import * as logicielsId from '../../functions/api/admin/logiciels/[id]'
import * as projets from '../../functions/api/admin/projets/index'
import * as projetId from '../../functions/api/admin/projets/[id]/index'
import * as projetDocuments from '../../functions/api/admin/projets/[id]/documents'
import * as projetQuestionnaires from '../../functions/api/admin/projets/[id]/questionnaires'
import * as questionnaireId from '../../functions/api/admin/questionnaires/[id]/index'
import * as clore from '../../functions/api/admin/questionnaires/[id]/clore'
import * as publier from '../../functions/api/admin/questionnaires/[id]/publier'
import { creerBaseDeTest } from '../helpers/d1'

let base: Awaited<ReturnType<typeof creerBaseDeTest>>
beforeAll(async () => { base = await creerBaseDeTest() })
afterAll(async () => { await base.fermer() })

type Handler = (contexte: never) => Promise<Response> | Response

async function appeler(
  handler: Handler | undefined, methode: string, chemin: string, corps?: unknown, id?: string,
): Promise<{ statut: number; donnees: any }> {
  if (!handler) throw new Error(`Aucun handler ${methode} pour ${chemin}`)
  const request = new Request(`https://exemple.test${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  const reponse = await handler({ request, env: { DB: base.db }, params: id ? { id } : {} } as never)
  const texte = await reponse.text()
  return { statut: reponse.status, donnees: texte ? JSON.parse(texte) : null }
}

const contenu = { questions: [{ type: 'texte', libelle: 'Que faites-vous ?', objectif: 'Quotidien' }] }

describe('logiciels', () => {
  it('crée, refuse un doublon, lit, met à jour et liste', async () => {
    const cree = await appeler(logiciels.onRequestPost, 'POST', '/api/admin/logiciels', { nom: 'Zeendoc', contexte: 'GED' })
    expect(cree.statut).toBe(201)
    const id = cree.donnees.id

    const doublon = await appeler(logiciels.onRequestPost, 'POST', '/api/admin/logiciels', { nom: 'zeendoc' })
    expect(doublon.statut).toBe(409)

    const maj = await appeler(logicielsId.onRequestPut, 'PUT', `/api/admin/logiciels/${id}`, { nom: 'Zeendoc', contexte: 'GED en ligne' }, id)
    expect(maj.donnees.contexte).toBe('GED en ligne')
    expect((await appeler(logicielsId.onRequestGet, 'GET', `/api/admin/logiciels/${id}`, undefined, id)).donnees.nom).toBe('Zeendoc')
    expect((await appeler(logiciels.onRequestGet, 'GET', '/api/admin/logiciels')).donnees).toHaveLength(1)

    const inconnu = await appeler(logicielsId.onRequestGet, 'GET', '/api/admin/logiciels/x', undefined, 'x')
    expect(inconnu).toEqual({ statut: 404, donnees: { error: { message: 'Logiciel introuvable : x' } } })
  })

  it('refuse un corps invalide', async () => {
    const reponse = await appeler(logiciels.onRequestPost, 'POST', '/api/admin/logiciels', { nom: '' })
    expect(reponse.statut).toBe(400)
    expect(reponse.donnees.error.message).toContain('nom')
  })
})

describe('projets, documents et questionnaires', () => {
  let projet: string
  let questionnaire: string

  it('crée un projet et le retrouve par filtre', async () => {
    const cree = await appeler(projets.onRequestPost, 'POST', '/api/admin/projets', { titre: 'Saisie des temps', type_demande: 'amelioration' })
    expect(cree.statut).toBe(201)
    projet = cree.donnees.id

    expect((await appeler(projets.onRequestGet, 'GET', '/api/admin/projets?statut=brouillon')).donnees).toHaveLength(1)
    expect((await appeler(projets.onRequestGet, 'GET', '/api/admin/projets?statut=clos')).donnees).toHaveLength(0)
    expect((await appeler(projets.onRequestGet, 'GET', '/api/admin/projets?statut=nimporte')).statut).toBe(400)
  })

  it('modifie le projet, y compris ses modèles, et expose le nombre d\'entretiens', async () => {
    const maj = await appeler(projetId.onRequestPut, 'PUT', `/api/admin/projets/${projet}`, {
      note_cadrage: '# Objectif', modeles: { interview: 'claude-haiku-5-5' },
    }, projet)
    expect(maj.donnees).toMatchObject({ statut: 'cadre', modele_interview: 'claude-haiku-5-5' })

    const lu = await appeler(projetId.onRequestGet, 'GET', `/api/admin/projets/${projet}`, undefined, projet)
    expect(lu.donnees.nb_entretiens).toBe(0)
  })

  it('ajoute puis supprime un document', async () => {
    const doc = await appeler(projetDocuments.onRequestPost, 'POST', `/api/admin/projets/${projet}/documents`, { nom: 'a.md', contenu: '# A' }, projet)
    expect(doc.statut).toBe(201)
    const supprime = await appeler(documentsId.onRequestDelete, 'DELETE', `/api/admin/documents/${doc.donnees.id}`, undefined, doc.donnees.id)
    expect(supprime).toEqual({ statut: 204, donnees: null })
  })

  it('crée, remplace, publie et clôt un questionnaire', async () => {
    const cree = await appeler(projetQuestionnaires.onRequestPost, 'POST', `/api/admin/projets/${projet}/questionnaires`, {
      public_vise: 'Comptables', mode: 'hybride', contenu,
    }, projet)
    expect(cree.statut).toBe(201)
    questionnaire = cree.donnees.id

    const remplace = await appeler(questionnaireId.onRequestPut, 'PUT', `/api/admin/questionnaires/${questionnaire}`, {
      public_vise: 'Comptables de CUMA', mode: 'hybride', contenu, introduction: 'Bonjour',
    }, questionnaire)
    expect(remplace.donnees).toMatchObject({ public_vise: 'Comptables de CUMA', introduction: 'Bonjour', projet_id: projet })

    const invalide = await appeler(questionnaireId.onRequestPut, 'PUT', `/api/admin/questionnaires/${questionnaire}`, {
      public_vise: 'X', mode: 'hybride', contenu: { questions: [] },
    }, questionnaire)
    expect(invalide.statut).toBe(400)

    expect((await appeler(publier.onRequestPost, 'POST', `/api/admin/questionnaires/${questionnaire}/publier`, undefined, questionnaire)).donnees.statut).toBe('ouvert')
    expect((await appeler(questionnaireId.onRequestDelete, 'DELETE', `/api/admin/questionnaires/${questionnaire}`, undefined, questionnaire)).statut).toBe(409)
    expect((await appeler(clore.onRequestPost, 'POST', `/api/admin/questionnaires/${questionnaire}/clore`, undefined, questionnaire)).donnees.statut).toBe('clos')
  })

  it('supprime un brouillon de questionnaire puis le projet', async () => {
    const brouillon = await appeler(projetQuestionnaires.onRequestPost, 'POST', `/api/admin/projets/${projet}/questionnaires`, {
      public_vise: 'Terrain', mode: 'hybride', contenu,
    }, projet)
    expect((await appeler(questionnaireId.onRequestDelete, 'DELETE', `/api/admin/questionnaires/${brouillon.donnees.id}`, undefined, brouillon.donnees.id)).statut).toBe(204)

    expect((await appeler(projetId.onRequestDelete, 'DELETE', `/api/admin/projets/${projet}`, undefined, projet)).statut).toBe(204)
    expect((await appeler(projetId.onRequestGet, 'GET', `/api/admin/projets/${projet}`, undefined, projet)).statut).toBe(404)
    expect((await appeler(questionnaireId.onRequestGet, 'GET', `/api/admin/questionnaires/${questionnaire}`, undefined, questionnaire)).statut).toBe(404)
  })
})
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npm test -- tests/functions/api-admin.test.ts`
Expected : FAIL (modules introuvables).

- [ ] **Step 3 : routes des logiciels**

`functions/api/admin/logiciels/index.ts` :

```ts
import { lireCorps, route } from '../../../../server/api'
import { ErreurMetier } from '../../../../server/erreurs'
import { json } from '../../../../server/http'
import { schemaLogiciel } from '../../../../server/schemas'
import { enregistrerLogiciel, listerLogiciels } from '../../../../server/services/logiciels'

export const onRequestGet = route(async ({ env }) => json(await listerLogiciels(env.DB)))

export const onRequestPost = route(async ({ request, env }) => {
  const saisie = await lireCorps(request, schemaLogiciel)
  // Le service, pensé pour Claude, met à jour une fiche de même nom ; ici, créer un doublon est une erreur de saisie.
  const nom = saisie.nom.trim().toLowerCase()
  if ((await listerLogiciels(env.DB)).some(l => l.nom.toLowerCase() === nom)) {
    throw new ErreurMetier(`Un logiciel nommé « ${saisie.nom.trim()} » existe déjà.`, 409)
  }
  return json(await enregistrerLogiciel(env.DB, saisie), 201)
})
```

`functions/api/admin/logiciels/[id].ts` :

```ts
import { lireCorps, parametre, route } from '../../../../server/api'
import { json } from '../../../../server/http'
import { schemaLogiciel } from '../../../../server/schemas'
import { enregistrerLogiciel, lireLogiciel } from '../../../../server/services/logiciels'

export const onRequestGet = route<'id'>(async ({ env, params }) => json(await lireLogiciel(env.DB, parametre(params.id))))

export const onRequestPut = route<'id'>(async ({ request, env, params }) => {
  const saisie = await lireCorps(request, schemaLogiciel)
  return json(await enregistrerLogiciel(env.DB, { id: parametre(params.id), ...saisie }))
})
```

- [ ] **Step 4 : routes des projets et des documents**

`functions/api/admin/projets/index.ts` :

```ts
import { lireCorps, route } from '../../../../server/api'
import { ErreurMetier } from '../../../../server/erreurs'
import { json } from '../../../../server/http'
import { schemaCreationProjet } from '../../../../server/schemas'
import { STATUTS_PROJET, creerProjet, listerProjets, type StatutProjet } from '../../../../server/services/projets'

export const onRequestGet = route(async ({ request, env }) => {
  const recherche = new URL(request.url).searchParams
  const statut = recherche.get('statut') || undefined
  if (statut && !STATUTS_PROJET.includes(statut as StatutProjet)) {
    throw new ErreurMetier(`Statut inconnu : ${statut}`)
  }
  return json(await listerProjets(env.DB, {
    statut: statut as StatutProjet | undefined,
    logiciel_id: recherche.get('logiciel_id') || undefined,
  }))
})

export const onRequestPost = route(async ({ request, env }) => {
  return json(await creerProjet(env.DB, await lireCorps(request, schemaCreationProjet)), 201)
})
```

`functions/api/admin/projets/[id]/index.ts` :

```ts
import { lireCorps, parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { schemaModificationProjet } from '../../../../../server/schemas'
import { compterEntretiens, lireProjet, modifierProjet, supprimerProjet } from '../../../../../server/services/projets'

export const onRequestGet = route<'id'>(async ({ env, params }) => {
  const id = parametre(params.id)
  const projet = await lireProjet(env.DB, id)
  return json({ ...projet, nb_entretiens: await compterEntretiens(env.DB, id) })
})

export const onRequestPut = route<'id'>(async ({ request, env, params }) => {
  const modifs = await lireCorps(request, schemaModificationProjet)
  return json(await modifierProjet(env.DB, parametre(params.id), modifs))
})

export const onRequestDelete = route<'id'>(async ({ env, params }) => {
  await supprimerProjet(env.DB, parametre(params.id))
  return new Response(null, { status: 204 })
})
```

`functions/api/admin/projets/[id]/documents.ts` :

```ts
import { lireCorps, parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { schemaDocument } from '../../../../../server/schemas'
import { ajouterDocument } from '../../../../../server/services/projets'

export const onRequestPost = route<'id'>(async ({ request, env, params }) => {
  const saisie = await lireCorps(request, schemaDocument)
  return json(await ajouterDocument(env.DB, parametre(params.id), saisie), 201)
})
```

`functions/api/admin/documents/[id].ts` :

```ts
import { parametre, route } from '../../../../server/api'
import { supprimerDocument } from '../../../../server/services/projets'

export const onRequestDelete = route<'id'>(async ({ env, params }) => {
  await supprimerDocument(env.DB, parametre(params.id))
  return new Response(null, { status: 204 })
})
```

- [ ] **Step 5 : routes des questionnaires**

`functions/api/admin/projets/[id]/questionnaires.ts` :

```ts
import { lireCorps, parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { schemaQuestionnaire } from '../../../../../server/schemas'
import { enregistrerQuestionnaire } from '../../../../../server/services/questionnaires'

export const onRequestPost = route<'id'>(async ({ request, env, params }) => {
  const saisie = await lireCorps(request, schemaQuestionnaire)
  return json(await enregistrerQuestionnaire(env.DB, { projet_id: parametre(params.id), ...saisie }), 201)
})
```

`functions/api/admin/questionnaires/[id]/index.ts` :

```ts
import { lireCorps, parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { schemaQuestionnaire } from '../../../../../server/schemas'
import { enregistrerQuestionnaire, lireQuestionnaire, supprimerQuestionnaire } from '../../../../../server/services/questionnaires'

export const onRequestGet = route<'id'>(async ({ env, params }) => json(await lireQuestionnaire(env.DB, parametre(params.id))))

export const onRequestPut = route<'id'>(async ({ request, env, params }) => {
  const id = parametre(params.id)
  const saisie = await lireCorps(request, schemaQuestionnaire)
  // Le projet d'un questionnaire ne change pas : on reprend celui de l'existant.
  const existant = await lireQuestionnaire(env.DB, id)
  return json(await enregistrerQuestionnaire(env.DB, { id, projet_id: existant.projet_id, ...saisie }))
})

export const onRequestDelete = route<'id'>(async ({ env, params }) => {
  await supprimerQuestionnaire(env.DB, parametre(params.id))
  return new Response(null, { status: 204 })
})
```

`functions/api/admin/questionnaires/[id]/publier.ts` :

```ts
import { parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { publierQuestionnaire } from '../../../../../server/services/questionnaires'

export const onRequestPost = route<'id'>(async ({ request, env, params }) => {
  const { questionnaire } = await publierQuestionnaire(env.DB, parametre(params.id), new URL(request.url).origin)
  return json(questionnaire)
})
```

`functions/api/admin/questionnaires/[id]/clore.ts` :

```ts
import { parametre, route } from '../../../../../server/api'
import { json } from '../../../../../server/http'
import { cloreQuestionnaire } from '../../../../../server/services/questionnaires'

export const onRequestPost = route<'id'>(async ({ env, params }) => json(await cloreQuestionnaire(env.DB, parametre(params.id))))
```

- [ ] **Step 6 : vérifier le succès**

Run : `npm test && npx tsc -b`
Expected : tous les tests passent, dont les 7 de `api-admin.test.ts`. Ces routes sont sous `functions/api/admin/` : la garde de session du lot 1 (`_middleware.ts`) s'y applique sans rien ajouter.

- [ ] **Step 7 : commit**

```bash
git add functions/api/admin tests/functions/api-admin.test.ts
git commit -m "feat: API admin des logiciels, projets, documents et questionnaires"
```

---

### Task 5 : Client d'API et logique d'édition

**Files :**
- Create : `src/admin/api.ts`, `src/admin/contenu.ts`, `tests/src/contenu.test.ts`

- [ ] **Step 1 : écrire `tests/src/contenu.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import {
  changerType, contenuVide, deplacer, estHybride, nouveauTheme, nouvelleQuestion, pretPourEnvoi,
} from '../../src/admin/contenu'

describe('contenu de questionnaire', () => {
  it('propose un contenu de départ par mode', () => {
    expect(contenuVide('hybride')).toEqual({
      questions: [{ id: 'q1', type: 'texte', libelle: '', objectif: '' }],
    })
    expect(contenuVide('entretien')).toEqual({
      question_ouverture: '', themes: [{ id: 't1', titre: '', objectif: '' }],
    })
    expect(estHybride(contenuVide('hybride'))).toBe(true)
    expect(estHybride(contenuVide('entretien'))).toBe(false)
  })

  it("donne à une nouvelle question ou à un nouveau thème un identifiant libre", () => {
    expect(nouvelleQuestion([{ id: 'q1' }, { id: 'q3' }]).id).toBe('q2')
    expect(nouvelleQuestion([{ id: 'q1' }, { id: 'q2' }]).id).toBe('q3')
    expect(nouveauTheme([]).id).toBe('t1')
    expect(nouveauTheme([{ id: 't1' }, { id: 'intro' }]).id).toBe('t2')
  })

  it('déplace un élément sans toucher la liste d\'origine, et ignore les bornes', () => {
    const liste = ['a', 'b', 'c']
    expect(deplacer(liste, 0, 1)).toEqual(['b', 'a', 'c'])
    expect(deplacer(liste, 2, -1)).toEqual(['a', 'c', 'b'])
    expect(deplacer(liste, 0, -1)).toEqual(liste)
    expect(deplacer(liste, 2, 1)).toEqual(liste)
    expect(liste).toEqual(['a', 'b', 'c'])
  })

  it('ajoute deux options vides en passant à un type à choix, et les retire sinon', () => {
    const texte = { id: 'q1', type: 'texte' as const, libelle: 'L', objectif: 'O' }
    const choix = changerType(texte, 'choix_unique')
    expect(choix).toEqual({ ...texte, type: 'choix_unique', options: ['', ''] })
    expect(changerType(choix, 'choix_multiple').options).toEqual(['', ''])
    expect(changerType({ ...choix, options: ['A', 'B'] }, 'choix_multiple').options).toEqual(['A', 'B'])
    expect('options' in changerType(choix, 'echelle')).toBe(false)
  })

  it("retire les options vides avant l'envoi", () => {
    const contenu = {
      questions: [
        { id: 'q1', type: 'choix_unique' as const, libelle: 'L', objectif: 'O', options: ['A', ' ', 'B', ''] },
        { id: 'q2', type: 'texte' as const, libelle: 'L', objectif: 'O' },
      ],
    }
    expect(pretPourEnvoi(contenu)).toEqual({
      questions: [
        { id: 'q1', type: 'choix_unique', libelle: 'L', objectif: 'O', options: ['A', 'B'] },
        { id: 'q2', type: 'texte', libelle: 'L', objectif: 'O' },
      ],
    })
    const entretien = { question_ouverture: 'Q', themes: [{ id: 't1', titre: 'T', objectif: 'O' }] }
    expect(pretPourEnvoi(entretien)).toEqual(entretien)
  })
})
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npm test -- tests/src/contenu.test.ts`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : créer `src/admin/contenu.ts`**

```ts
import type { Contenu, ContenuHybride, Mode, Question, Theme, TypeQuestion } from '../../shared/interviews'

export function estHybride(contenu: Contenu): contenu is ContenuHybride {
  return 'questions' in contenu
}

function identifiantLibre(existants: { id: string }[], prefixe: string): string {
  const pris = new Set(existants.map(e => e.id))
  let n = 1
  while (pris.has(`${prefixe}${n}`)) n++
  return `${prefixe}${n}`
}

export function nouvelleQuestion(existantes: { id: string }[]): Question {
  return { id: identifiantLibre(existantes, 'q'), type: 'texte', libelle: '', objectif: '' }
}

export function nouveauTheme(existants: { id: string }[]): Theme {
  return { id: identifiantLibre(existants, 't'), titre: '', objectif: '' }
}

export function contenuVide(mode: Mode): Contenu {
  return mode === 'hybride'
    ? { questions: [nouvelleQuestion([])] }
    : { question_ouverture: '', themes: [nouveauTheme([])] }
}

/** Copie de la liste avec l'élément `index` décalé de `sens` (-1 ou 1) ; inchangée hors bornes. */
export function deplacer<T>(liste: T[], index: number, sens: -1 | 1): T[] {
  const cible = index + sens
  if (cible < 0 || cible >= liste.length) return liste
  const copie = [...liste]
  ;[copie[index], copie[cible]] = [copie[cible], copie[index]]
  return copie
}

const A_CHOIX: TypeQuestion[] = ['choix_unique', 'choix_multiple']

export function changerType(question: Question, type: TypeQuestion): Question {
  if (A_CHOIX.includes(type)) {
    return { ...question, type, options: question.options?.length ? question.options : ['', ''] }
  }
  const { options: _options, ...reste } = question
  return { ...reste, type }
}

/** Contenu tel qu'on l'envoie : sans les lignes d'option laissées vides dans l'éditeur. */
export function pretPourEnvoi(contenu: Contenu): Contenu {
  if (!estHybride(contenu)) return contenu
  return {
    questions: contenu.questions.map(q =>
      q.options ? { ...q, options: q.options.filter(o => o.trim() !== '') } : q),
  }
}
```

- [ ] **Step 4 : créer `src/admin/api.ts`**

```ts
import type {
  Contenu, DocumentProjet, Logiciel, Mode, ProjetComplet, ProjetResume, Questionnaire, StatutProjet, TypeDemande,
} from '../../shared/interviews'
import type { Etape } from '../../shared/modeles'

export class ErreurApi extends Error {
  constructor(message: string, readonly statut: number) {
    super(message)
  }
}

async function appel<T>(methode: string, chemin: string, corps?: unknown): Promise<T> {
  let reponse: Response
  try {
    reponse = await fetch(`/api/admin${chemin}`, {
      method: methode,
      headers: corps === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    })
  } catch {
    throw new ErreurApi('Serveur injoignable. Vérifiez votre connexion.', 0)
  }
  if (reponse.status === 401) {
    // Session expirée : le rechargement ramène à l'écran de connexion.
    window.location.reload()
    throw new ErreurApi('Session expirée.', 401)
  }
  if (!reponse.ok) {
    const donnees = await reponse.json().catch(() => ({})) as { error?: { message?: string } }
    throw new ErreurApi(donnees.error?.message ?? `Erreur ${reponse.status}`, reponse.status)
  }
  return (reponse.status === 204 ? undefined : await reponse.json()) as T
}

export interface SaisieProjet {
  titre?: string
  type_demande?: TypeDemande
  description?: string
  note_cadrage?: string
  resume_contexte?: string
  statut?: StatutProjet
  logiciel_ids?: string[]
  modeles?: Partial<Record<Etape, string>>
}

export interface SaisieQuestionnaire {
  public_vise: string
  mode: Mode
  contenu: Contenu
  introduction?: string
  duree_estimee_min?: number
  relances_max_par_question?: number
  tours_max?: number
}

export type ProjetAdmin = ProjetComplet & { nb_entretiens: number }

export const api = {
  logiciels: {
    lister: () => appel<Logiciel[]>('GET', '/logiciels'),
    creer: (saisie: { nom: string; contexte?: string }) => appel<Logiciel>('POST', '/logiciels', saisie),
    modifier: (id: string, saisie: { nom: string; contexte?: string }) => appel<Logiciel>('PUT', `/logiciels/${id}`, saisie),
  },
  projets: {
    lister: (filtre: { logiciel_id?: string; statut?: StatutProjet } = {}) => {
      const recherche = new URLSearchParams()
      if (filtre.logiciel_id) recherche.set('logiciel_id', filtre.logiciel_id)
      if (filtre.statut) recherche.set('statut', filtre.statut)
      const suffixe = recherche.toString()
      return appel<ProjetResume[]>('GET', `/projets${suffixe ? `?${suffixe}` : ''}`)
    },
    lire: (id: string) => appel<ProjetAdmin>('GET', `/projets/${id}`),
    creer: (saisie: SaisieProjet & { titre: string; type_demande: TypeDemande }) => appel<ProjetComplet>('POST', '/projets', saisie),
    modifier: (id: string, saisie: SaisieProjet) => appel<ProjetComplet>('PUT', `/projets/${id}`, saisie),
    supprimer: (id: string) => appel<void>('DELETE', `/projets/${id}`),
    ajouterDocument: (id: string, saisie: { nom: string; contenu: string }) =>
      appel<DocumentProjet>('POST', `/projets/${id}/documents`, saisie),
    creerQuestionnaire: (id: string, saisie: SaisieQuestionnaire) =>
      appel<Questionnaire>('POST', `/projets/${id}/questionnaires`, saisie),
  },
  documents: {
    supprimer: (id: string) => appel<void>('DELETE', `/documents/${id}`),
  },
  questionnaires: {
    lire: (id: string) => appel<Questionnaire>('GET', `/questionnaires/${id}`),
    remplacer: (id: string, saisie: SaisieQuestionnaire) => appel<Questionnaire>('PUT', `/questionnaires/${id}`, saisie),
    supprimer: (id: string) => appel<void>('DELETE', `/questionnaires/${id}`),
    publier: (id: string) => appel<Questionnaire>('POST', `/questionnaires/${id}/publier`),
    clore: (id: string) => appel<Questionnaire>('POST', `/questionnaires/${id}/clore`),
  },
}

/** Adresse à diffuser aux répondants. */
export function urlQuestionnaire(code: string): string {
  return `${window.location.origin}/q/${code}`
}
```

- [ ] **Step 5 : vérifier le succès**

Run : `npm test && npm run build`
Expected : tous les tests passent (5 nouveaux), build réussi.

- [ ] **Step 6 : commit**

```bash
git add src/admin/api.ts src/admin/contenu.ts tests/src/contenu.test.ts
git commit -m "feat: client d'API admin et logique d'édition des questionnaires"
```

---

### Task 6 : Extraction du texte des documents

**Files :**
- Create : `src/admin/extraction.ts`
- Modify : `package.json`

- [ ] **Step 1 : dépendance**

```bash
npm install pdfjs-dist
```

- [ ] **Step 2 : créer `src/admin/extraction.ts`**

```ts
import { LIMITES } from '../../shared/interviews'

export const EXTENSIONS_ACCEPTEES = '.txt,.md,.pdf'

async function extrairePdf(fichier: File): Promise<string> {
  // Chargé à la demande : pdf.js pèse lourd et ne sert qu'ici.
  const pdfjs = await import('pdfjs-dist')
  const { default: urlTravailleur } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = urlTravailleur

  const document = await pdfjs.getDocument({ data: await fichier.arrayBuffer() }).promise
  const pages: string[] = []
  for (let numero = 1; numero <= document.numPages; numero++) {
    const contenu = await (await document.getPage(numero)).getTextContent()
    pages.push(contenu.items.map(element => ('str' in element ? element.str : '')).join(' '))
  }
  return pages.join('\n\n').trim()
}

/** Texte d'un fichier `.txt`, `.md` ou `.pdf`. Lève une erreur au message affichable. */
export async function extraireTexte(fichier: File): Promise<string> {
  const nom = fichier.name.toLowerCase()
  let texte: string
  if (nom.endsWith('.pdf')) {
    try {
      texte = await extrairePdf(fichier)
    } catch {
      throw new Error('Ce PDF est illisible (fichier protégé ou endommagé).')
    }
    if (!texte) throw new Error('Ce PDF ne contient pas de texte (document scanné ?). Collez le texte à la main.')
  } else if (nom.endsWith('.txt') || nom.endsWith('.md')) {
    texte = (await fichier.text()).trim()
    if (!texte) throw new Error('Ce fichier est vide.')
  } else {
    throw new Error('Format non pris en charge : utilisez un fichier .txt, .md ou .pdf.')
  }
  if (texte.length > LIMITES.contenu_document) {
    throw new Error(
      `Document trop long : ${texte.length.toLocaleString('fr-FR')} caractères pour ${LIMITES.contenu_document.toLocaleString('fr-FR')} au plus. Gardez les passages utiles.`,
    )
  }
  return texte
}
```

- [ ] **Step 3 : vérifier**

Run : `npm run build`
Expected : build réussi. Si l'import du travailleur échoue, lister `node_modules/pdfjs-dist/build/` pour trouver le nom exact du fichier `pdf.worker…mjs` de la version installée et corriger le chemin ; si TypeScript refuse le suffixe `?url`, vérifier que `src/vite-env.d.ts` contient `/// <reference types="vite/client" />`.

Vérifier aussi que pdf.js n'est pas dans le lot principal : la sortie du build doit lister un fichier JavaScript séparé pour pdf.js, et le fichier `index-….js` ne doit pas avoir grossi de plus de quelques kilooctets.

- [ ] **Step 4 : commit**

```bash
git add package.json package-lock.json src/admin/extraction.ts
git commit -m "feat: extraction du texte des documents txt, md et pdf"
```

---

### Conventions communes aux écrans (Tasks 7 à 10)

À lire avant d'écrire un écran.

- **Composants existants à réutiliser** : `Button` (variantes `primary`, `dark`, `outline`, `ghost`, `danger` ; prop `loading`), `Card`, `Chip`, `Spinner`, `ModelSelector` (liste déroulante branchée sur le catalogue). Lire `src/components/ui/` et `src/admin/LoginScreen.tsx` pour reprendre les classes Tailwind en usage : libellés en `font-mono text-[0.66rem] uppercase tracking-wider text-muted`, champs en `border border-border bg-paper px-3 py-2.5 text-[0.86rem] focus:outline-none focus:border-ink`, titres en `font-display`. Couleurs : uniquement celles de `tailwind.config.ts`.
- **Champs** : créer `src/admin/champs.tsx` avec `Champ` (libellé + enfant + message d'aide ou d'erreur, `htmlFor` relié), `ChampTexte`, `ChampZone` (textarea, prop `lignes`), `ChampListe` (select). Chaque champ texte reçoit `maxLength` depuis `LIMITES` (`shared/interviews.ts`) quand une limite existe.
- **Chargement et erreurs** : pendant un chargement, un `Spinner` centré ; en cas d'échec de chargement, le message de l'erreur et un bouton « Réessayer ». Une erreur d'enregistrement s'affiche près du bouton qui l'a déclenchée, dans un élément `role="alert"`, et la saisie est conservée. Jamais d'`alert()` ; `window.confirm()` est admis pour les confirmations de suppression et de publication.
- **Boutons d'action** : désactivés et en `loading` pendant l'appel ; après succès, l'écran reflète le nouvel état sans rechargement de page.
- **Libellés affichés** : `evolution_simple` → « Évolution simple », `amelioration` → « Amélioration », `nouvelle_fonctionnalite` → « Nouvelle fonctionnalité » ; statuts de projet → « Brouillon », « Cadré », « En cours », « Clos » ; statuts de questionnaire → « Brouillon », « Ouvert », « Clos » ; modes → « Hybride (questions + relances) », « Entretien (conversation guidée) » ; types de question → « Texte libre », « Choix unique », « Choix multiple », « Échelle de 1 à 5 ». Les regrouper dans `src/admin/libelles.ts`.
- **Accessibilité** : chaque champ a un libellé relié ; les boutons qui ne portent qu'un symbole (monter, descendre, supprimer une ligne) ont un `aria-label`.
- **Pas de nouvelle dépendance** en dehors de `pdfjs-dist`, pas de store global : état local (`useState`, `useEffect`) par écran.

---

### Task 7 : Mise en page, routes et liste des projets

**Files :**
- Create : `src/admin/AdminLayout.tsx`, `src/admin/champs.tsx`, `src/admin/libelles.ts`, `src/admin/ProjetsScreen.tsx`
- Delete : `src/admin/AdminHome.tsx`
- Modify : `src/main.tsx`

- [ ] **Step 1 : `AdminLayout.tsx`**

En-tête reprenant celui d'`AdminHome` (fond `ink`, liseré rouge) avec : le titre « Interviews — administration » (lien vers `/admin`), une navigation « Projets » (`/admin`), « Logiciels » (`/admin/logiciels`), « Interview critique » (`/`), l'entrée courante soulignée (`NavLink`), et le bouton « Se déconnecter » (comportement actuel d'`AdminHome`). Sous l'en-tête, `<main className="max-w-4xl mx-auto px-4 py-8">` contenant `<Outlet />`.

- [ ] **Step 2 : routes dans `src/main.tsx`**

Remplacer la route `/admin` par des routes imbriquées. Voici la forme finale ; à cette tâche, n'écrire que la route `index`, chaque autre ligne étant ajoutée par la tâche qui crée son écran (Tasks 8 à 10) :

```tsx
<Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
  <Route index element={<ProjetsScreen />} />
  <Route path="logiciels" element={<LogicielsScreen />} />
  <Route path="projets/nouveau" element={<ProjetNouveauScreen />} />
  <Route path="projets/:id" element={<ProjetScreen />} />
  <Route path="questionnaires/:id" element={<QuestionnaireScreen />} />
</Route>
```

- [ ] **Step 3 : `ProjetsScreen.tsx`**

- Charge en parallèle `api.projets.lister(filtre)` et `api.logiciels.lister()`.
- En haut : titre « Projets », bouton « Nouveau projet » (lien vers `/admin/projets/nouveau`).
- Deux filtres (listes déroulantes) : logiciel (« Tous les logiciels » + la liste) et statut (« Tous les statuts » + les quatre). Changer un filtre relance la liste. Les filtres sont portés par l'URL (`?logiciel=…&statut=…`, via `useSearchParams`) pour survivre au retour arrière.
- Liste : une `Card` par projet, entièrement cliquable vers `/admin/projets/:id`, montrant le titre, le type de demande, le statut (`Chip`), les logiciels, et la date de dernière modification au format `25 nov. 2026`.
- Liste vide sans filtre : « Aucun projet pour l'instant. Créez-en un ici, ou depuis Claude avec le connecteur MCP. » Liste vide avec filtre : « Aucun projet ne correspond à ces filtres. »

- [ ] **Step 4 : vérifier**

Run : `npm run build`
Expected : build réussi. Ne pas créer d'écran provisoire pour les routes des tâches suivantes.

- [ ] **Step 5 : commit**

```bash
git add src
git commit -m "feat: mise en page admin et liste des projets"
```

---

### Task 8 : Écran des logiciels

**Files :**
- Create : `src/admin/LogicielsScreen.tsx`
- Modify : `src/main.tsx` (route `logiciels`)

- [ ] **Step 1 : `LogicielsScreen.tsx`**

- Charge `api.logiciels.lister()`.
- Titre « Logiciels » et texte d'aide : « La fiche de contexte d'un logiciel est réutilisée par tous les projets qui le concernent : décrivez-y le logiciel, son vocabulaire métier et ses publics. »
- Bouton « Ajouter un logiciel » : ouvre en tête de liste un formulaire (nom, contexte sur 8 lignes) avec « Enregistrer » et « Annuler ». Succès → la liste se met à jour, le formulaire se ferme. Un doublon (409) affiche le message du serveur.
- Chaque logiciel : `Card` avec le nom, le début du contexte (3 lignes au plus, tronqué par CSS) et un bouton « Modifier » qui remplace la carte par le même formulaire prérempli (`api.logiciels.modifier`). Un seul formulaire ouvert à la fois.
- Liste vide : « Aucun logiciel. Ajoutez ceux sur lesquels portent vos projets. »

- [ ] **Step 2 : vérifier et commit**

Run : `npm run build`

```bash
git add src
git commit -m "feat: écran des logiciels"
```

---

### Task 9 : Création et fiche d'un projet

**Files :**
- Create : `src/admin/ProjetNouveauScreen.tsx`, `src/admin/ProjetScreen.tsx`
- Modify : `src/main.tsx` (routes `projets/nouveau` et `projets/:id`)

- [ ] **Step 1 : `ProjetNouveauScreen.tsx`**

Formulaire : titre (obligatoire), type de demande (trois boutons radio avec une ligne d'explication chacun : « On sait quoi demander aux utilisateurs », « On veut améliorer une fonction existante », « Besoin à préciser : le cadrage sera plus poussé »), description (8 lignes, aide : « La demande telle que vous la formulez aujourd'hui »), logiciels concernés (cases à cocher issues de `api.logiciels.lister()`, avec un lien « Gérer les logiciels » si la liste est vide). Bouton « Créer le projet » → `api.projets.creer` puis navigation vers la fiche. Lien « Annuler » vers `/admin`.

- [ ] **Step 2 : `ProjetScreen.tsx`**

Charge `api.projets.lire(id)` et `api.logiciels.lister()`. Un identifiant inconnu (404) affiche « Projet introuvable » avec un lien vers la liste. L'écran est une colonne de sections, chacune dans une `Card` avec son propre bouton d'enregistrement ; une section ne s'enregistre que si elle a été modifiée (bouton désactivé sinon).

1. **En-tête** : titre du projet, statut (`Chip`), lien « ← Projets ».
2. **Informations** : titre, type de demande (liste déroulante), statut (liste déroulante), description, logiciels (cases à cocher). « Enregistrer » → `api.projets.modifier` avec les seuls champs de cette section.
3. **Documents** : liste (nom, taille en caractères, bouton « Supprimer » avec confirmation). Ajout par deux voies dans un même formulaire : champ « Nom » + zone « Texte » à coller, ou bouton « Choisir un fichier » (`accept={EXTENSIONS_ACCEPTEES}`) qui appelle `extraireTexte`, remplit la zone de texte avec le résultat et le nom avec celui du fichier, pour relecture avant envoi. « Ajouter le document » → `api.projets.ajouterDocument`. Les erreurs d'extraction s'affichent sous le bouton de fichier.
4. **Note de cadrage** : zone de texte Markdown (16 lignes) avec une bascule « Éditer / Aperçu » ; l'aperçu utilise `react-markdown` et `remark-gfm`, déjà dans le projet (voir leur usage dans `src/screens/SynthesisScreen.tsx`). Aide : « Rédigée avec Claude via le connecteur MCP, ou à la main. » En dessous, « Résumé de contexte » (6 lignes, aide : « Utilisé à chaque entretien à la place des documents complets »). « Enregistrer » → `api.projets.modifier` avec `note_cadrage` et `resume_contexte`. Après enregistrement, le statut affiché suit la réponse du serveur (un brouillon devient « Cadré »).
5. **Modèles** : trois `ModelSelector` libellés « Cadrage », « Interview », « Analyse », avec l'aide : « Utilisés par l'IA de l'application. Le travail fait dans Claude via le MCP n'en dépend pas. » « Enregistrer » → `api.projets.modifier({ modeles })`.
6. **Questionnaires** : liste (public visé, mode, statut ; pour un questionnaire ouvert ou clos, son adresse `urlQuestionnaire(code)` avec un bouton « Copier » qui affiche « Copié » deux secondes) ; chaque ligne mène à `/admin/questionnaires/:id`. Bouton « Nouveau questionnaire » : formulaire demandant le public visé, le mode et, parce que le serveur refuse un contenu vide, le premier élément : en mode hybride, le libellé et l'objectif de la première question ; en mode entretien, la question d'ouverture, le titre et l'objectif du premier thème. Le contenu envoyé part de `contenuVide(mode)` rempli avec ces valeurs → `api.projets.creerQuestionnaire`. Succès → navigation vers l'éditeur.
7. **Zone de danger** : « Supprimer le projet », bouton `danger`. Confirmation : « Supprimer « <titre> » ? Ses documents et questionnaires seront supprimés. » complété, si `nb_entretiens > 0`, par « <n> entretien(s) commencé(s) ou terminé(s) seront perdus. Cette action est définitive. » Succès → navigation vers `/admin`.

- [ ] **Step 3 : vérifier et commit**

Run : `npm run build`

```bash
git add src
git commit -m "feat: création et fiche d'un projet"
```

---

### Task 10 : Éditeur de questionnaire

**Files :**
- Create : `src/admin/QuestionnaireScreen.tsx`
- Modify : `src/main.tsx` (route `questionnaires/:id`)

- [ ] **Step 1 : `QuestionnaireScreen.tsx`**

Charge `api.questionnaires.lire(id)`. Toute la logique de liste passe par `src/admin/contenu.ts` (`estHybride`, `nouvelleQuestion`, `nouveauTheme`, `deplacer`, `changerType`, `contenuVide`, `pretPourEnvoi`) : ne pas la réécrire dans le composant.

- **En-tête** : public visé, statut (`Chip`), lien « ← Projet » vers `/admin/projets/<projet_id>`.
- **Lecture seule** si le statut n'est pas `brouillon` : bandeau « Ce questionnaire est publié : il n'est plus modifiable. », tous les champs désactivés, pas de bouton d'enregistrement. L'adresse publique est affichée avec « Copier ».
- **Réglages** : public visé ; mode (liste déroulante — changer de mode remplace le contenu par `contenuVide(mode)` après confirmation « Changer de mode efface les questions saisies. ») ; introduction (5 lignes, aide : « Premier écran du répondant : qui interroge, pourquoi, combien de temps, ce qui sera fait des réponses ») ; durée estimée en minutes (1 à 120) ; en mode hybride, relances par question (0 à 3) et plafond de relances au total (1 à 30) ; en mode entretien, plafond de questions (1 à 30).
- **Contenu, mode hybride** : liste numérotée de questions. Chaque question est une `Card` avec : type (liste déroulante, via `changerType`), libellé, objectif (aide : « Ce qu'on cherche à apprendre — jamais montré au répondant, sert à décider d'une relance »), et, pour les types à choix, la liste des options (un champ par option, bouton « Supprimer l'option », bouton « Ajouter une option », 10 au plus). En bas de carte : « Monter », « Descendre » (désactivés aux extrémités), « Supprimer la question » (désactivé s'il n'en reste qu'une). Sous la liste : « Ajouter une question » (désactivé à 40).
- **Contenu, mode entretien** : champ « Question d'ouverture », puis liste de thèmes (titre, objectif) avec les mêmes boutons monter / descendre / supprimer, et « Ajouter un thème » (12 au plus).
- **Barre d'actions** (brouillon) : « Enregistrer » → `api.questionnaires.remplacer(id, { …réglages, contenu: pretPourEnvoi(contenu) })` ; l'erreur de validation du serveur (« Question 3 : libellé manquant. ») s'affiche telle quelle. « Publier » → désactivé tant qu'il y a des modifications non enregistrées ; confirmation « Publier ce questionnaire ? Il ne sera plus modifiable et son adresse pourra être diffusée. » → `api.questionnaires.publier`, puis l'écran passe en lecture seule et affiche l'adresse. « Supprimer » (variante `danger`) → confirmation, `api.questionnaires.supprimer`, retour à la fiche projet.
- **Questionnaire ouvert** : bouton « Clore » → confirmation « Clore ce questionnaire ? Plus aucune réponse ne sera acceptée. » → `api.questionnaires.clore`.
- **Modifications non enregistrées** : un indicateur « Modifications non enregistrées » près du bouton, et un avertissement du navigateur à la fermeture de l'onglet (`beforeunload`) tant qu'il y en a.

- [ ] **Step 2 : vérifier et commit**

Run : `npm run build && npm test`

```bash
git add src
git commit -m "feat: éditeur de questionnaire"
```

---

### Task 11 : Vérification dans le navigateur

À faire sur une instance locale à jour (`npm run build`, `npm run db:local`, `npm run pages:dev`), connecté avec le mot de passe de développement.

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Ouvrir `/admin` | liste des projets, navigation Projets / Logiciels / Interview critique |
| 2 | Logiciels → ajouter « Logiciel A » avec un contexte | il apparaît dans la liste |
| 3 | Ajouter à nouveau « logiciel a » | message « existe déjà », rien de créé |
| 4 | Modifier le contexte de « Logiciel A » | nouveau contexte affiché |
| 5 | Nouveau projet : titre, « Nouvelle fonctionnalité », Logiciel A | arrivée sur la fiche, statut Brouillon |
| 6 | Créer un projet sans titre | création impossible, message |
| 7 | Fiche : changer la description, enregistrer, recharger la page | description conservée |
| 8 | Documents : coller un texte nommé « Notes », ajouter | document listé avec sa taille |
| 9 | Documents : choisir un fichier `.md`, puis un `.pdf` contenant du texte | zone de texte remplie, ajout possible |
| 10 | Documents : choisir un `.docx` | message « Format non pris en charge » |
| 11 | Supprimer un document | confirmation, puis disparition |
| 12 | Note de cadrage : saisir du Markdown, aperçu, enregistrer | aperçu mis en forme ; statut passé à Cadré |
| 13 | Modèles : choisir un autre modèle d'interview, enregistrer, recharger | choix conservé |
| 14 | Nouveau questionnaire hybride « Comptables » avec une première question | arrivée dans l'éditeur |
| 15 | Ajouter une question à choix unique avec 3 options, la monter en première position, enregistrer, recharger | ordre et options conservés |
| 16 | Vider le libellé d'une question, enregistrer | message du serveur nommant la question, saisie conservée |
| 17 | Modifier sans enregistrer | « Publier » désactivé, indicateur visible |
| 18 | Publier | lecture seule, adresse `/q/<code>` affichée, « Copier » fonctionne |
| 19 | Retour à la fiche projet | statut du projet En cours, adresse du questionnaire listée |
| 20 | Clore le questionnaire | statut Clos |
| 21 | Nouveau questionnaire en mode entretien, 2 thèmes, enregistrer | conservé après rechargement |
| 22 | Supprimer ce brouillon | retour à la fiche, questionnaire absent |
| 23 | Liste des projets : filtrer par Logiciel A puis par statut Clos | résultats cohérents, filtres conservés au retour arrière |
| 24 | Un projet créé par le MCP (script du lot 2A ou « Projet de test local ») | visible et modifiable comme les autres |
| 25 | Supprimer le projet | confirmation, retour à la liste, projet absent |
| 26 | Largeur 375 px sur la fiche projet et l'éditeur | pas de débordement horizontal, boutons atteignables |
| 27 | Console du navigateur pendant tout le parcours | aucune erreur |

Corriger ce qui échoue dans les fichiers de la tâche concernée, puis refaire le contrôle.

---

### Task 12 : Documentation

**Files :**
- Modify : `CLAUDE.md`, `docs/superpowers/specs/2026-11-25-interview-utilisateurs-design.md`

- [ ] **Step 1 : `CLAUDE.md`**

Dans l'arborescence : `shared/` devient « types et constantes communs navigateur / serveur (modeles.ts, interviews.ts) » ; `src/admin/` devient « écrans admin : projets, logiciels, fiche projet, éditeur de questionnaire ; api.ts (client), contenu.ts (logique d'édition), extraction.ts (texte des fichiers) » ; `functions/api/` mentionne `admin/{logiciels,projets,documents,questionnaires}`. Dans « Navigation », lister les routes `/admin`, `/admin/logiciels`, `/admin/projets/nouveau`, `/admin/projets/:id`, `/admin/questionnaires/:id`. Ajouter sous « Serveur MCP » :

```markdown
## API admin

`/api/admin/*`, protégée par la session. Une route = validation Zod (`server/schemas.ts`) + appel d'un service, dans l'enveloppe `route()` de `server/api.ts` qui traduit les `ErreurMetier`. Les mêmes services servent le MCP : une règle métier ne s'écrit qu'une fois, dans `server/services/`.
```

- [ ] **Step 2 : spec**

Section 4, point 6 : remplacer la dernière phrase par « Seul un questionnaire en brouillon est modifiable ou supprimable ; un questionnaire ouvert peut être clos. » Section 10 : marquer 2A et 2B comme livrés.

- [ ] **Step 3 : commit**

```bash
git add CLAUDE.md docs/superpowers/specs
git commit -m "docs: API admin et écrans du lot 2B"
```

---

## Auto-relecture

- **Couverture de la spec (section 4)** : liste des projets filtrable, création, modification, suppression avec nombre d'entretiens → Tasks 2, 4, 7, 9 ; logiciels et fiche de contexte → Tasks 4, 8 ; documents collés ou extraits de `.md`, `.txt`, `.pdf` → Tasks 6, 9 ; choix des trois modèles → Tasks 2, 9 ; note de cadrage modifiable à la main → Task 9 ; édition manuelle des questionnaires (modifier, réordonner, supprimer, ajouter), publication avec adresse, clôture → Tasks 2, 4, 5, 10.
- **Reports** : cadrage et génération par l'IA dans l'admin (lot 5) ; invitations, suivi et lecture des entretiens (lot 3) ; analyses et exports (lot 4).
- **Écart assumé** : un questionnaire ouvert sans réponse n'est pas modifiable (la spec l'autorisait) ; consigné en Task 12.
- **Cohérence des noms** : `route`, `lireCorps`, `parametre` (Task 3) utilisés en Task 4 ; `schemaLogiciel`, `schemaCreationProjet`, `schemaModificationProjet`, `schemaDocument`, `schemaQuestionnaire` (Task 3) ; `compterEntretiens`, `supprimerProjet`, `supprimerDocument`, `cloreQuestionnaire`, `supprimerQuestionnaire` (Task 2) ; `api`, `urlQuestionnaire`, `ErreurApi`, `ProjetAdmin` (Task 5) ; `contenuVide`, `nouvelleQuestion`, `nouveauTheme`, `deplacer`, `changerType`, `estHybride`, `pretPourEnvoi` (Task 5) ; `extraireTexte`, `EXTENSIONS_ACCEPTEES` (Task 6).
