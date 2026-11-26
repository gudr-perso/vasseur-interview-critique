# Lot 6 — Coût de l'IA par étape : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** savoir ce que coûte l'IA, cumulé, en trois postes par projet — **cadrage**, **interviews**, **analyse** — plus l'interview critique à part ; visible seulement dans l'admin.

**Architecture :** un seul point de passage, la fonction `fetch` que le SDK utilise pour chaque requête (et que le proxy de l'interview critique appelle lui-même). Une enveloppe `fetchSuivi` (`server/ia/suivi.ts`) laisse passer requête et réponse sans les modifier, lit les compteurs de jetons sur une copie, calcule le coût avec une grille de tarifs dans le code, et confie l'écriture D1 à `waitUntil`. Les appelants ne donnent que l'étape et le projet.

**Tech stack :** Cloudflare Pages Functions, D1, `@anthropic-ai/sdk` 1.14 (option `fetch` du client), React 18, Vitest + Miniflare.

**Spec :** `docs/superpowers/specs/2026-11-25-interview-utilisateurs-design.md` (la section 10 gagne le lot 6, Task 7).

**Hors de ce lot :** détail appel par appel, filtres, grille modifiable dans l'admin, conversion en euros, plafond ou alerte de dépense, exposition au MCP.

---

## Ce qu'on sait de l'API (relevé du 26/11/2026)

Vérifié dans la skill `claude-api` et la documentation officielle (`platform.claude.com/docs/en/about-claude/pricing`, `…/api/messages/create`, `…/build-with-claude/streaming`) :

- Toute réponse de `/v1/messages` porte `usage` : `input_tokens` (entrée hors cache), `cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens`. En flux, `message_start` donne le modèle et l'entrée, chaque `message_delta` un `usage` **cumulatif** (le dernier fait foi). Les sorties structurées ne changent rien.
- La réflexion du modèle est comprise dans `output_tokens` et facturée comme sortie (Opus 5.5 réfléchit toujours).
- Une réponse HTTP d'erreur (400, 429, 5xx) ne porte aucun jeton : rien à compter. Un flux coupé en route a consommé l'entrée et une partie de la sortie : on garde les derniers compteurs reçus.
- Le modèle réellement utilisé est `model` dans la réponse ; il ne diffère du modèle demandé qu'avec les replis côté serveur, non utilisés ici.
- L'API ne renvoie aucun prix. Écriture du cache à 1,25 × l'entrée (cache de 5 minutes, le seul utilisé ici) ; lecture à 0,05 × sur Opus 5.5 et Sonnet 5.5, 0,025 × sur Fable 5.1 / 5.2, 0,1 × ailleurs ; Haiku 5.5 plus cher au-delà de 100 000 jetons d'entrée.

## Où l'application appelle l'API, et dans quel poste

| Appel | Fichier | Poste |
|---|---|---|
| Dialogue, note, résumé de contexte | `server/ia/cadrage.ts` | cadrage |
| Proposition de publics, génération de questionnaire (second essai compris) | `server/ia/questionnaires.ts` | cadrage |
| Relances, tours d'entretien | `server/ia/anthropic.ts` (via `server/ia/index.ts`) | interview |
| Analyses | `server/ia/analyse.ts` | analyse |
| Interview critique | `functions/api/messages.ts` | interview critique (hors projet) |
| Liste des modèles | `server/modeles.ts` | non compté (gratuit) |

Les postes suivent les trois modèles d'un projet (`modele_cadrage`, `modele_interview`, `modele_analyse`). Les nouveaux essais automatiques (essai du SDK, reprise sans effort, second essai d'une génération) passent par la même fonction `fetch` : ils sont comptés sans rien ajouter.

---

## Décisions de ce plan (à valider par Guillaume)

1. **Trois postes par projet** (cadrage, interview, analyse) et un poste hors projet (interview critique). Pas de détail par appel à l'écran.
2. **Ce qu'on garde** (table `consommation_ia`, migration 0005) : date, poste, projet, modèle, jetons d'entrée, de sortie, lus et écrits en cache, coût. Une ligne par requête qui a consommé des jetons. Rien d'autre : ni texte, ni répondant, ni questionnaire. Pas de clé étrangère : supprimer un projet ne retire pas sa dépense du total général.
3. **Grille de tarifs dans le code** (`shared/tarifs.ts`), en dollars par million de jetons, relevée le 26/11/2026 ; une mise à jour = une ligne à changer et un déploiement. Modèle absent de la grille : coût inconnu, signalé à l'écran (« tarif manquant : claude-… »), jetons quand même gardés.
4. **Coût figé à l'appel**, en micro-dollars entiers ; changer la grille ne réécrit pas le passé.
5. **En dollars**, la devise de la facture Anthropic. *(Validé.)*
6. **Jamais bloquant** : l'enregistrement se fait après la réponse ; toute panne de lecture ou d'écriture est journalisée puis ignorée, y compris côté répondant.
7. **Admin seulement** : routes `/api/admin/*` derrière la session ; rien dans les routes publiques ni le MCP. *(Validé.)*
8. **Pas de purge** : une ligne fait environ 150 octets ; même un million de lignes reste négligeable pour D1.

---

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `migrations/0005_consommation_ia.sql` | créer — table `consommation_ia` |
| `shared/tarifs.ts` | créer — postes, grille, calcul du coût (pur) |
| `server/services/couts.ts` | créer — enregistrer une consommation, cumuls |
| `server/ia/suivi.ts` | créer — `fetchSuivi`, lecture du flux et du JSON |
| `server/ia/appel.ts`, `anthropic.ts`, `index.ts`, `analyse.ts`, `cadrage.ts`, `questionnaires.ts` | modifier — fournir le suivi |
| `functions/api/messages.ts`, `functions/api/public/r/[jeton]/{reponses,suivant}.ts` | modifier — fournir le suivi |
| `functions/api/admin/couts.ts`, `functions/api/admin/projets/[id]/couts.ts` | créer — routes |
| `src/admin/CoutsScreen.tsx`, `src/admin/ProjetCouts.tsx` | créer — écrans |
| `src/admin/api.ts`, `AdminLayout.tsx`, `ProjetScreen.tsx`, `src/main.tsx` | modifier |
| `tests/helpers/api-messages.ts` | modifier — compteurs paramétrables, attente des tâches ajoutées en cours |

---

### Task 0 : Branche

- [ ] **Step 1**

```bash
git checkout lot5-ia-admin          # ou main, une fois le lot 5 fusionné
git pull --ff-only
git status --short                  # doit être vide
git checkout -b lot6-couts-ia
npm test                            # tous verts ; noter le nombre de tests
```

---

### Task 1 : Table, grille et calcul

**Files :** Create `migrations/0005_consommation_ia.sql`, `shared/tarifs.ts`, `tests/server/tarifs.test.ts`

- [ ] **Step 1 : tests**

```ts
// tests/server/tarifs.test.ts
import { describe, expect, it } from 'vitest'
import { calculerCout, tarifDe } from '../../shared/tarifs'

const zero = { entree: 0, sortie: 0, cache_lecture: 0, cache_ecriture: 0 }

describe('tarifs', () => {
  it("trouve un modèle exact ou suivi d'une date, jamais une famille voisine", () => {
    expect(tarifDe('claude-opus-5-5')?.entree).toBe(4)
    expect(tarifDe('claude-haiku-4-5-20251001')?.entree).toBe(1)
    expect(tarifDe('claude-opus-5-6')).toBeNull()
  })

  it('compte entrée, cache et sortie en micro-dollars', () => {
    // Opus 5.5 : 10 000 × 4 + 50 000 × 0,2 + 2 000 × 5 + 3 000 × 20
    expect(calculerCout('claude-opus-5-5', { entree: 10_000, cache_lecture: 50_000, cache_ecriture: 2_000, sortie: 3_000 })).toBe(120_000)
  })

  it('passe Haiku 5.5 au palier long au-delà de 100 000 jetons d’entrée, cache compris', () => {
    expect(calculerCout('claude-haiku-5-5', { ...zero, entree: 50_000, cache_lecture: 50_000, sortie: 1_000 })).toBe(5_000 + 500 + 500)
    expect(calculerCout('claude-haiku-5-5', { ...zero, entree: 50_001, cache_lecture: 50_000, sortie: 1_000 })).toBe(30_001)
  })

  it('renvoie null pour un modèle sans tarif', () => {
    expect(calculerCout('claude-inconnu', zero)).toBeNull()
  })
})
```

- [ ] **Step 2 : vérifier l'échec** — `npx vitest run tests/server/tarifs.test.ts` : FAIL (module absent).

- [ ] **Step 3 : `shared/tarifs.ts`**

```ts
// Coût de l'IA : postes et grille de tarifs. Prix en dollars par million de jetons, API Anthropic directe,
// relevés le 26/11/2026 sur platform.claude.com/docs/en/about-claude/pricing. À mettre à jour ici quand ils changent.
// Jetons × dollars par million = micro-dollars.

export const POSTES = ['cadrage', 'interview', 'analyse', 'interview_critique'] as const
export type Poste = (typeof POSTES)[number]

export const LIBELLES_POSTE: Record<Poste, string> = {
  cadrage: 'Cadrage',
  interview: 'Interviews',
  analyse: 'Analyse',
  interview_critique: 'Interview critique',
}

export const DATE_RELEVE_TARIFS = '2026-11-26'

interface Prix { entree: number; ecriture: number; lecture: number; sortie: number }
interface Tarif extends Prix {
  /** Au-delà de ce nombre de jetons d'entrée (cache compris), toute la requête passe aux prix `long`. */
  long?: { seuil: number } & Prix
}

const p = (entree: number, ecriture: number, lecture: number, sortie: number): Prix => ({ entree, ecriture, lecture, sortie })

const TARIFS: Record<string, Tarif> = {
  'claude-fable-5-2': p(8, 10, 0.20, 40),
  'claude-mythos-5-2': p(8, 10, 0.20, 40),
  'claude-fable-5-1': p(10, 12.5, 0.25, 50),
  'claude-fable-5': p(10, 12.5, 1, 50),
  'claude-opus-5-5': p(4, 5, 0.20, 20),
  'claude-opus-5': p(5, 6.25, 0.50, 25),
  'claude-opus-4-8': p(5, 6.25, 0.50, 25),
  'claude-opus-4-7': p(5, 6.25, 0.50, 25),
  'claude-opus-4-6': p(5, 6.25, 0.50, 25),
  'claude-sonnet-5-5': p(2, 2.5, 0.10, 10),
  'claude-sonnet-5': p(2, 2.5, 0.20, 10),
  'claude-sonnet-4-6': p(3, 3.75, 0.30, 15),
  'claude-haiku-5-5': { ...p(0.10, 0.125, 0.01, 0.50), long: { seuil: 100_000, ...p(0.50, 0.625, 0.05, 2.50) } },
  'claude-haiku-4-5': p(1, 1.25, 0.10, 5),
}

export interface Jetons { entree: number; sortie: number; cache_lecture: number; cache_ecriture: number }

/** Identifiant exact, sinon le même suivi d'une date (`claude-haiku-4-5-20251001`). */
export function tarifDe(modele: string): Tarif | null {
  if (TARIFS[modele]) return TARIFS[modele]
  const famille = modele.replace(/-\d{8}$/, '')
  return famille !== modele && TARIFS[famille] ? TARIFS[famille] : null
}

/** Coût en micro-dollars entiers, ou null si le modèle n'a pas de tarif. */
export function calculerCout(modele: string, j: Jetons): number | null {
  const tarif = tarifDe(modele)
  if (!tarif) return null
  const total = j.entree + j.cache_lecture + j.cache_ecriture
  const prix = tarif.long && total > tarif.long.seuil ? tarif.long : tarif
  return Math.round(j.entree * prix.entree + j.cache_lecture * prix.lecture + j.cache_ecriture * prix.ecriture + j.sortie * prix.sortie)
}
```

- [ ] **Step 4 : migration** (aucun point-virgule dans les commentaires : le chargeur de test découpe sur `;`)

```sql
-- Consommation de l'API Anthropic, une ligne par requête qui a consommé des jetons.
-- Aucun texte ni donnée personnelle. Pas de clé étrangère : la dépense d'un projet supprimé reste dans le total.
-- Coût en micro-dollars, NULL si le modèle n'avait pas de tarif.
CREATE TABLE consommation_ia (
  id TEXT PRIMARY KEY,
  cree_le TEXT NOT NULL,
  poste TEXT NOT NULL CHECK (poste IN ('cadrage', 'interview', 'analyse', 'interview_critique')),
  projet_id TEXT,
  modele TEXT NOT NULL,
  jetons_entree INTEGER NOT NULL,
  jetons_sortie INTEGER NOT NULL,
  cache_lecture INTEGER NOT NULL,
  cache_ecriture INTEGER NOT NULL,
  cout_micro_usd INTEGER
);

CREATE INDEX idx_consommation_projet ON consommation_ia(projet_id, poste);
CREATE INDEX idx_consommation_date ON consommation_ia(cree_le);
```

- [ ] **Step 5 : vérifier** — `npm test && npx tsc -b` : PASS.
- [ ] **Step 6 : commit**

```bash
git add migrations/0005_consommation_ia.sql shared/tarifs.ts tests/server/tarifs.test.ts
git commit -m "feat: table de consommation de l'IA et grille de tarifs"
```

---

### Task 2 : Service

**Files :** Create `server/services/couts.ts`, `tests/server/couts.test.ts`

**Comportement.**
- `enregistrerConsommation(db, { poste, projet_id, modele, jetons })` : calcule le coût (`calculerCout`) et insère la ligne.
- `coutsGlobaux(db, { depuis? })` → `{ total, hors_projet, projets: { projet_id, titre, cadrage, interview, analyse, total }[], tarifs_manquants: string[] }` : montants en micro-dollars ; projets du plus cher au moins cher, titre actuel ou « Projet supprimé » ; `hors_projet` = interview critique ; `tarifs_manquants` = modèles des lignes au coût `NULL` ; `depuis` = premier jour d'un mois `AAAA-MM-01` (filtre « ce mois-ci », « depuis le début »).
- `coutsProjet(db, projetId)` → `{ cadrage, interview, analyse, total, tarifs_manquants }` (404 si le projet n'existe pas).

- [ ] **Step 1 : tests** (base de test) : lignes de deux projets et de l'interview critique sur deux mois ; sommes par poste justes ; projet supprimé gardé dans le total sous « Projet supprimé » ; une ligne sans tarif compte 0 et apparaît dans `tarifs_manquants` ; filtre `depuis` ; 404 sur un projet inconnu.
- [ ] **Step 2 : vérifier l'échec, implémenter (une requête `GROUP BY projet_id, poste`), vérifier le succès.**
- [ ] **Step 3 : commit** — `git add server/services/couts.ts tests/server/couts.test.ts && git commit -m "feat: cumul du coût de l'IA par projet et par poste"`

---

### Task 3 : Le compteur sur `fetch`

**Files :** Create `server/ia/suivi.ts`, `tests/server/ia-suivi.test.ts` ; Modify `tests/helpers/api-messages.ts`

**Comportement de `fetchSuivi(suivi, sous?)`.** Sans `sous`, la fonction renvoyée lit `globalThis.fetch` à chaque appel (les tests du proxy remplacent `fetch` global).
- Ne s'occupe que des `POST` vers `…/v1/messages` ; le reste passe tel quel.
- Réponse d'erreur ou exception : renvoyée ou relancée telle quelle, rien d'enregistré (aucun jeton).
- Réponse JSON : renvoyée telle quelle ; `model` et `usage` lus sur une copie (`clone()`), en arrière-plan.
- Réponse en flux : corps dédoublé (`tee()`), le SDK reçoit une `Response` de même statut et mêmes en-têtes ; la copie est lue en arrière-plan (`message_start` puis `message_delta`) ; si le flux se coupe, les derniers compteurs reçus sont gardés.
- Une ligne n'est écrite que si des jetons ont été comptés. L'écriture est confiée à `suivi.attendre` (le `waitUntil` de la route) ; toute erreur est journalisée (`console.error("Coût de l'IA", message)`) et avalée.

- [ ] **Step 1 : aide des tests** — dans `tests/helpers/api-messages.ts`, `reponseSse(morceaux, stop_reason, modele, compteurs = {})` et `reponseJson(valeur, stop_reason, compteurs?)` acceptent `{ input_tokens?, cache_read_input_tokens?, cache_creation_input_tokens?, output_tokens? }` (valeurs par défaut inchangées : 10 en entrée, 20 en sortie) ; `contexteRoute().tache()` attend aussi les tâches ajoutées pendant l'attente :

```ts
tache: async () => {
  for (let vus = 0; vus < enCours.length;) {
    const lot = enCours.slice(vus)
    vus = enCours.length
    await Promise.all(lot)
  }
},
```

- [ ] **Step 2 : tests** (`tests/server/ia-suivi.test.ts`, base de test, `apiSimulee` comme `fetch` sous-jacent) :
  1. flux complet : une ligne avec le poste, le projet, le modèle de la réponse, les jetons du dernier `message_delta` et du cache, le coût ;
  2. le texte lu par l'appelant est identique à la réponse simulée, statut et `Content-Type` conservés ;
  3. flux coupé (`reponseCoupee`) : ligne avec l'entrée comptée ;
  4. réponse JSON : jetons lus, corps intact ;
  5. réponse 529 et exception réseau : rien d'enregistré, la réponse ou l'exception parvient intacte ;
  6. `GET /v1/models` : rien d'enregistré ;
  7. **base en panne** : la réponse est lue normalement, aucune exception ne remonte, `console.error` appelé.
- [ ] **Step 3 : vérifier l'échec, puis implémenter**

```ts
// server/ia/suivi.ts
// Point de passage unique du coût de l'IA : la fonction `fetch` du client SDK et du proxy de l'interview critique.
// Requête et réponse passent sans changement ; les jetons sont lus sur une copie, après coup, puis enregistrés
// par `waitUntil`. Une panne ici est journalisée et n'interrompt jamais l'appel utile.

import type { Poste } from '../../shared/tarifs'
import { enregistrerConsommation } from '../services/couts'

export interface Suivi {
  db: D1Database
  poste: Poste
  projet_id: string | null
  /** `context.waitUntil` de la route. */
  attendre?: (promesse: Promise<unknown>) => void
}

interface Usage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

interface Lecture { modele: string | null; usage: Usage }

function planifier(suivi: Suivi, travail: Promise<unknown>): void {
  const protege = travail.catch(e => console.error("Coût de l'IA", e instanceof Error ? e.message : e))
  suivi.attendre?.(protege)
}

function fusionner(cible: Usage, source: Usage | undefined): void {
  if (source) Object.assign(cible, Object.fromEntries(Object.entries(source).filter(([, v]) => v != null)))
}

async function lireFlux(corps: ReadableStream<Uint8Array>): Promise<Lecture> {
  const lecture: Lecture = { modele: null, usage: {} }
  const lecteur = corps.pipeThrough(new TextDecoderStream()).getReader()
  let tampon = ''
  try {
    for (;;) {
      const { value, done } = await lecteur.read()
      if (done) break
      tampon += value
      for (let fin = tampon.indexOf('\n\n'); fin >= 0; fin = tampon.indexOf('\n\n')) {
        const donnees = tampon.slice(0, fin).split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('')
        tampon = tampon.slice(fin + 2)
        if (!donnees) continue
        let e: { type?: string; message?: { model?: string; usage?: Usage }; usage?: Usage }
        try { e = JSON.parse(donnees) } catch { continue }
        if (e.type === 'message_start') { lecture.modele = e.message?.model ?? null; fusionner(lecture.usage, e.message?.usage) }
        else if (e.type === 'message_delta') fusionner(lecture.usage, e.usage)
      }
    }
  } catch {
    // Flux coupé : on garde les derniers compteurs reçus.
  }
  return lecture
}

function enregistrer(suivi: Suivi, modeleDemande: string, { modele, usage }: Lecture): Promise<unknown> {
  const jetons = {
    entree: usage.input_tokens ?? 0,
    sortie: usage.output_tokens ?? 0,
    cache_lecture: usage.cache_read_input_tokens ?? 0,
    cache_ecriture: usage.cache_creation_input_tokens ?? 0,
  }
  if (Object.values(jetons).every(n => n === 0)) return Promise.resolve()
  return enregistrerConsommation(suivi.db, { poste: suivi.poste, projet_id: suivi.projet_id, modele: modele ?? modeleDemande, jetons })
}

function modeleDemande(corps: unknown): string {
  try {
    const model = typeof corps === 'string' ? (JSON.parse(corps) as { model?: unknown }).model : undefined
    return typeof model === 'string' ? model : 'inconnu'
  } catch {
    return 'inconnu'
  }
}

export function fetchSuivi(suivi: Suivi, sous?: typeof globalThis.fetch): typeof globalThis.fetch {
  return async (entree, init) => {
    const appeler = sous ?? globalThis.fetch
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url
    const methode = init?.method ?? (entree instanceof Request ? entree.method : 'GET')
    if (methode.toUpperCase() !== 'POST' || !url.split('?')[0].endsWith('/v1/messages')) return appeler(entree, init)

    const reponse = await appeler(entree, init)
    try {
      if (!reponse.ok || !reponse.body) return reponse
      const demande = modeleDemande(init?.body)
      if (reponse.headers.get('content-type')?.includes('text/event-stream')) {
        const [pourAppelant, pourCompteur] = reponse.body.tee()
        planifier(suivi, lireFlux(pourCompteur).then(l => enregistrer(suivi, demande, l)))
        return new Response(pourAppelant, { status: reponse.status, statusText: reponse.statusText, headers: reponse.headers })
      }
      const copie = reponse.clone()
      planifier(suivi, copie.json().then((m: { model?: string; usage?: Usage }) =>
        enregistrer(suivi, demande, { modele: m.model ?? null, usage: m.usage ?? {} })))
      return reponse
    } catch (e) {
      console.error("Coût de l'IA", e instanceof Error ? e.message : e)
      return reponse
    }
  }
}
```

- [ ] **Step 4 : vérifier** — `npm test && npx tsc -b` : PASS (aucun test existant cassé).
- [ ] **Step 5 : commit** — `git add server/ia/suivi.ts tests && git commit -m "feat: compteur de jetons sur la fonction fetch des appels à l'IA"`

---

### Task 4 : Brancher tous les appels

**Files :** Modify `server/ia/{appel,anthropic,index,analyse,cadrage,questionnaires}.ts`, `functions/api/messages.ts`, `functions/api/public/r/[jeton]/{reponses,suivant}.ts`, tests correspondants.

- [ ] **Step 1 : `server/ia/appel.ts`** — `DemandeIa` gagne `suivi?: Suivi` ; dans `parcourir`, le client reçoit `fetch: demande.suivi ? fetchSuivi(demande.suivi, demande.fetch) : demande.fetch`.
- [ ] **Step 2 : `server/ia/anthropic.ts`** — `OptionsIa` gagne `suivi?: Suivi` (poste `interview`) ; même enveloppe à la création du client.
- [ ] **Step 3 : `server/ia/index.ts`** — `iaPourQuestionnaire(env, db, questionnaire, attendre?)` passe `suivi: { db, poste: 'interview', projet_id: questionnaire.projet_id, attendre }` ; `iaPourJeton(env, jeton, attendre?)` le transmet. Les routes `reponses.ts` et `suivant.ts` passent `p => contexte.waitUntil(p)`.
- [ ] **Step 4 : admin** — dans `cadrage.ts` et `questionnaires.ts`, chaque `DemandeIa` reçoit `suivi: { db: env.DB, poste: 'cadrage', projet_id, attendre: p => contexte.waitUntil(p) }` ; dans `analyse.ts`, `OptionsAnalyse` gagne `suivi` (poste `analyse`) transmis à `genererTexte`.
- [ ] **Step 5 : proxy** (`functions/api/messages.ts`) — `fetchSuivi({ db: env.DB, poste: 'interview_critique', projet_id: null, attendre: p => context.waitUntil(p) })` remplace l'appel direct à `fetch` ; le reste ne change pas.
- [ ] **Step 6 : tests**
  - `ia-anthropic.test.ts` : une relance avec suivi écrit une ligne `interview` ; un refus du réglage d'effort (400) puis un appel réussi n'écrit qu'**une** ligne ; sans suivi, rien.
  - `api-public.test.ts` : une relance écrit une ligne `interview` du bon projet ; réponses publiques inchangées ; base du suivi en panne : la relance est quand même posée.
  - `api-cadrage.test.ts`, `api-generation.test.ts` : lignes `cadrage` ; génération corrigée au second essai : deux lignes.
  - `api-analyses.test.ts` : ligne `analyse`, même navigateur déconnecté.
  - `messages.test.ts` : ligne `interview_critique` sans projet, réponse relayée inchangée.
- [ ] **Step 7 : vérifier** — `npm test && npx tsc -b && npm run build` : PASS.
- [ ] **Step 8 : commit** — `git add server functions tests && git commit -m "feat: coût de tous les appels à l'IA, par poste"`

---

### Task 5 : Routes et écrans

**Files :** Create `functions/api/admin/couts.ts`, `functions/api/admin/projets/[id]/couts.ts`, `src/admin/CoutsScreen.tsx`, `src/admin/ProjetCouts.tsx`, `tests/functions/api-couts.test.ts` ; Modify `src/admin/api.ts`, `AdminLayout.tsx`, `ProjetScreen.tsx`, `src/main.tsx`

- [ ] **Step 1 : routes** — `GET /api/admin/couts?depuis=AAAA-MM-01` → `coutsGlobaux` ; `GET /api/admin/projets/:id/couts` → `coutsProjet`. Enveloppe `route()`, session vérifiée par le `_middleware.ts` existant.
- [ ] **Step 2 : tests** — forme des réponses, `depuis` mal formé → 400, **401 sans session**, et rien dans `functions/api/public/` ni `server/mcp/` ne lit `consommation_ia`.
- [ ] **Step 3 : écran `/admin/couts`** (entrée « Coûts de l'IA » dans le menu) : choix « Ce mois-ci » / « Depuis le début » ; total en gros ; tableau des projets (Cadrage, Interviews, Analyse, Total), chaque titre menant à la fiche ; ligne « Interview critique » à part ; mention « Tarifs relevés le 26/11/2026 » ; s'il y en a, « Tarif manquant pour : … — à ajouter dans `shared/tarifs.ts` ». Montants en `fr-FR` : « 0,042 $ » sous 1 $, « 12,34 $ » au-delà.
- [ ] **Step 4 : fiche projet** — section « Coût de l'IA » (`ProjetCouts`, en bas de `ProjetScreen`) : les trois postes et le total.
- [ ] **Step 5 : vérifier** — `npm run build && npm test`.
- [ ] **Step 6 : commit** — `git add functions src tests && git commit -m "feat: écran du coût de l'IA et coût d'un projet"`

---

### Task 6 : Vérification

Instance locale (`npm run db:local`, `npm run build`, `npm run pages:dev`), vraie clé, quelques appels. Lecture de la table :

```bash
npx wrangler d1 execute vasseur-interview --local --command "SELECT cree_le, poste, modele, jetons_entree, cache_lecture, cache_ecriture, jetons_sortie, cout_micro_usd FROM consommation_ia ORDER BY cree_le DESC LIMIT 20"
```

Pour comparer avec l'API, ajouter **temporairement** (non commité) `console.log('usage', message.model, JSON.stringify(message.usage))` après `finalMessage()` dans `server/ia/appel.ts` et après `parse` dans `server/ia/anthropic.ts`.

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Tour de cadrage n° 1 (projet avec un document de plusieurs pages) | ligne `cadrage`, jetons égaux au `usage` journalisé, `cache_ecriture` non nul |
| 2 | Tour n° 2 dans les 5 minutes | `cache_lecture` non nul, proche de l'écriture du tour 1 : **le cache de prompt du lot 5 est bien lu d'un tour à l'autre** |
| 3 | Générer un questionnaire, puis un entretien avec une relance, puis une synthèse | lignes `cadrage`, `interview`, `analyse` du bon projet |
| 4 | Interview critique | ligne `interview_critique` sans projet |
| 5 | Recalculer à la main le coût d'une ligne avec la grille | identique au micro-dollar près |
| 6 | Le lendemain, comparer le total du jour à la page Usage de la console Anthropic | écart de quelques pour cent au plus, ou expliqué |
| 7 | `/admin/couts` et fiche projet | sommes justes ; 401 sans session |
| 8 | Journaux et console | aucune erreur « Coût de l'IA » en fonctionnement normal |

Retirer les `console.log` temporaires (`git diff` vide sur `server/ia`).

---

### Task 7 : Documentation

- [ ] `CLAUDE.md` : `server/ia/suivi.ts`, `shared/tarifs.ts`, `server/services/couts.ts`, `/admin/couts` ; une courte section « Coût de l'IA » (compteur sur `fetch`, trois postes, grille dans le code à mettre à jour avec sa date de relevé, jamais bloquant, admin seulement) ; migration 0005 à appliquer en production et sur la preview ; règle : **tout nouvel appel à l'API passe un `suivi`**. Spec : section 3 (table `consommation_ia`) et section 10 (lot 6, décisions 1 à 8).

```bash
git add CLAUDE.md docs
git commit -m "docs: coût de l'IA par poste"
```

---

## Auto-relecture

- **Demande** (« coût du cadrage, coût des interviews, coût de l'analyse, on regroupe ; visible que en admin ») : postes → Tasks 1, 4 ; cumul par projet et global → Tasks 2, 5 ; admin seulement → Task 5 (décision 7).
- **Tous les appels** : chaque ligne du tableau des appels est branchée en Task 4 ; les essais automatiques passent par la même fonction `fetch`.
- **Noms** : `POSTES`, `Poste`, `LIBELLES_POSTE`, `DATE_RELEVE_TARIFS`, `tarifDe`, `calculerCout`, `Jetons` (Task 1) ; `enregistrerConsommation`, `coutsGlobaux`, `coutsProjet` (Task 2) ; `Suivi`, `fetchSuivi` (Task 3).
- **Risques** : ralentir ou casser un appel (réponse rendue avant toute lecture, erreurs avalées, tests 2 et 7 de la Task 3 et test de panne côté répondant) ; tarifs qui changent (grille datée, modèle manquant signalé).
