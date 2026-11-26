# Lot 6 — Suivi des coûts de l'IA : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** enregistrer la consommation de chaque appel à l'API Anthropic (jetons, cache, modèle, statut, durée, coût calculé), la cumuler et la montrer avec un peu de détail dans l'admin seulement : cumul global, par mois, par projet, par type d'appel et par modèle, derniers appels filtrables, économies dues au cache, coût cumulé sur la fiche d'un projet.

**Architecture :** un seul point de passage, la fonction `fetch` que le SDK utilise pour chaque requête HTTP (et que le proxy de l'interview critique appelle lui-même). Une enveloppe `fetchSuivi` (`server/ia/suivi.ts`) laisse passer la requête et la réponse sans les modifier, lit en parallèle les compteurs de consommation (corps JSON, ou copie du flux SSE), puis confie l'écriture D1 à `waitUntil`. Les appelants ne font que fournir le contexte (origine, projet, questionnaire, répondant). Le coût est calculé à l'écriture avec une grille de tarifs stockée dans D1, modifiable dans l'admin, et figé dans la ligne.

**Tech stack :** Cloudflare Pages Functions, D1, `@anthropic-ai/sdk` 1.14 (option `fetch` du client), Zod 4, React 18, Vitest + Miniflare.

**Spec :** `docs/superpowers/specs/2026-11-25-interview-utilisateurs-design.md` (le suivi des coûts n'y figure pas encore : la section 10 gagne un lot 6, Task 10).

**Hors de ce lot :** plafond de dépense ou alerte, facturation par client, import des coûts réels depuis l'API Usage and Cost d'Anthropic (clé admin `sk-ant-admin…` requise), purge automatique, exposition au MCP.

---

## Ce qu'on sait de l'API (relevé du 26/11/2026)

Vérifié dans la skill `claude-api` et la documentation officielle (`platform.claude.com/docs/en/about-claude/pricing`, `…/api/messages/create`, `…/build-with-claude/streaming`) :

- **Compteurs.** Toute réponse de `/v1/messages` porte `usage` : `input_tokens` (entrée hors cache, plein tarif), `cache_read_input_tokens`, `cache_creation_input_tokens` avec le détail `cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`, `output_tokens`, `output_tokens_details.thinking_tokens`, `inference_geo`, `speed`, `service_tier`, `server_tool_use`. L'entrée totale d'une requête est la somme `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`.
- **En flux.** `message_start` porte `message.model` et un premier `usage` (entrée et cache) ; chaque `message_delta` porte un `usage` **cumulatif** (le dernier fait foi, et il peut aussi mettre à jour les compteurs d'entrée) et la `stop_reason` ; `message_stop` clôt le message ; un événement `error` (par exemple `overloaded_error`) peut arriver au milieu du flux.
- **Sorties structurées.** Aucune différence : le JSON est le texte de la réponse, `usage` est au même endroit (`messages.parse` non diffusé dans `server/ia/anthropic.ts`, `messages.stream` avec `output_config.format` dans `server/ia/appel.ts`).
- **Réflexion du modèle.** Facturée comme sortie : `output_tokens` est « le total inclusif qui fait foi pour la facturation », `thinking_tokens` n'en est qu'une décomposition. Opus 5.5 réfléchit toujours (aucun `thinking` envoyé ici, effort seul) : une partie de la sortie payée est invisible.
- **Appels qui échouent.** Une réponse HTTP d'erreur (400, 429, 5xx) ne contient pas de `usage` : rien n'est compté pour nous. Un flux coupé après `message_start` a consommé l'entrée et une partie de la sortie ; la documentation ne dit pas comment il est facturé : on enregistre les derniers compteurs reçus, comme un minimum (décision 7).
- **Modèle réellement utilisé.** `message.model` de la réponse. Il ne diffère du modèle demandé qu'avec les replis côté serveur (`fallbacks`, non utilisés ici) ; on enregistre les deux pour le voir si cela change.
- **Prix.** L'API n'en renvoie aucun. Écriture du cache à 1,25 × l'entrée (5 min) ou 2 × (1 h) ; lecture à 0,1 × en général, mais 0,05 × sur Opus 5.5 et Sonnet 5.5, 0,025 × sur Fable/Mythos 5.1 et 5.2. Haiku 5.5 a deux paliers selon que l'entrée totale dépasse 100 000 jetons. `inference_geo: "us"` multiplie tout par 1,1 (non utilisé ici). Le mode rapide (`speed: "fast"`) et les lots ont leurs propres prix (non utilisés ici).
- **Liste des modèles** (`GET /v1/models`, `server/modeles.ts`) : gratuite, aucun jeton.

## Où l'application appelle l'API

| # | Endroit | Appel | Essais automatiques | Contexte disponible |
|---|---|---|---|---|
| 1 | `server/ia/anthropic.ts` `deciderRelance` | `messages.parse`, non diffusé, effort `low` | SDK : 1 nouvel essai (408/409/429/5xx) ; second appel sans effort si le modèle le refuse | projet, questionnaire, répondant (via `server/ia/index.ts`) |
| 2 | `server/ia/anthropic.ts` `prochainTour` | idem, effort `medium` | idem | idem |
| 3 | `server/ia/analyse.ts` (`genererTexte`) | `messages.stream` | SDK : 1 essai avant le flux ; reprise sans effort avant tout texte | projet, questionnaire ou répondant analysé |
| 4 | `server/ia/cadrage.ts` tour (`genererStructure`) | `messages.stream` + format | idem | projet |
| 5 | `server/ia/cadrage.ts` note, résumé (`genererTexte`) | `messages.stream` | idem | projet |
| 6 | `server/ia/questionnaires.ts` publics (`genererStructure`) | `messages.stream` + format | idem | projet |
| 7 | `server/ia/questionnaires.ts` génération (`genererStructure`) | `messages.stream` + format | idem, **plus un second essai** avec le message d'erreur | projet |
| 8 | `functions/api/messages.ts` (interview critique) | `fetch` direct, corps du navigateur (non diffusé aujourd'hui) | aucun | aucun projet |
| 9 | `server/modeles.ts` `listerDepuisAnthropic` | `models.list` | SDK | — (gratuit, non enregistré) |
| 10 | `tests/eval/` (`npm run eval:relances`) | via `creerIaAnthropic` | — | hors application (non enregistré) |

Les appels 1 à 7 passent par deux constructions du client SDK (`new Anthropic({ fetch })` dans `anthropic.ts` et `appel.ts`) : chaque essai du SDK, chaque reprise sans effort et chaque second essai est une requête HTTP distincte qui passe par la fonction `fetch` du client. C'est là qu'on se branche.

---

## Décisions de ce plan (à valider par Guillaume)

1. **Un point de passage unique : la fonction `fetch`.** Une ligne par requête HTTP vers `/v1/messages`, essais compris, sans toucher au code qui interprète les réponses. Les requêtes d'une même action (essai du SDK, reprise sans effort, second essai d'une génération) partagent un `demande_id`, pour lire le coût total d'une action.
2. **Ce qu'on enregistre** (table `appels_ia`, migration 0005) : date, origine, projet, questionnaire et répondant quand ils existent, modèle demandé et modèle de la réponse, flux ou non, statut (`reussi`, `refuse`, `tronque`, `interrompu`, `erreur`), statut HTTP et type d'erreur, jetons d'entrée, de sortie, dont réflexion, lus en cache, écrits en cache (5 min et 1 h), région d'inférence, vitesse, durée, coût et coût sans cache. **Jamais** le texte envoyé ou reçu, ni nom, prénom, mail ou jeton : des identifiants internes seulement. **Pas de clé étrangère** : supprimer un projet ou un répondant ne fait pas disparaître sa dépense des cumuls (la ligne affiche « projet supprimé »).
3. **Origines :** `relance`, `tour_entretien`, `cadrage_tour`, `cadrage_note`, `cadrage_resume`, `publics`, `generation_questionnaire`, `analyse`, `interview_critique`. La liste des modèles (gratuite) et l'évaluation des relances (hors application) ne sont pas enregistrées.
4. **Grille de tarifs dans D1, modifiable dans l'admin** (dollars par million de jetons : entrée, écriture 5 min, écriture 1 h, lecture, sortie, et un palier facultatif « au-delà de N jetons d'entrée » pour Haiku 5.5), remplie par la migration avec les tarifs relevés le 26/11/2026. Un modèle absent : on cherche d'abord l'identifiant exact, puis la même famille suivie d'une date (`claude-haiku-4-5-20251001` → `claude-haiku-4-5`) ; sinon le coût reste **inconnu**, la ligne est signalée « tarif manquant » et le total l'indique (« dont N appels sans tarif »).
5. **Coût figé au moment de l'appel**, en micro-dollars entiers (jetons × dollars par million = micro-dollars, sans arrondi intermédiaire). Changer un tarif ne réécrit pas le passé ; seule exception, ajouter le tarif d'un modèle manquant calcule les lignes restées sans coût.
6. **Devise : le dollar**, celle de la facture Anthropic. Un taux de conversion saisi dans l'écran des tarifs (aucun par défaut) ajoute une valeur indicative en euros à côté des totaux, marquée « indicatif ».
7. **Appels qui échouent.** Erreur HTTP ou réseau : ligne `erreur`, zéro jeton, coût nul. Flux coupé (erreur en cours, délai dépassé, abandon) : ligne `interrompu` avec les derniers compteurs reçus, présentés comme un minimum. Le modèle a refusé (`refusal`) : ligne `refuse`, jetons comptés (ils sont facturés).
8. **Réflexion du modèle :** comprise dans la sortie et dans le coût, affichée à part dans le détail d'un appel pour expliquer une sortie chère et invisible.
9. **Accès : l'admin seulement**, derrière la session existante (`/api/admin/*`). Rien dans les routes publiques ni dans le MCP. Une raison possible plus tard : laisser Claude dire, pendant une analyse par le MCP, ce que le projet a déjà coûté ; non retenue, car le MCP sert au travail du porteur du projet, pas à la gestion.
10. **Jamais bloquant.** L'enregistrement ne change ni la requête ni la réponse, s'exécute après coup (`waitUntil`), et toute erreur de lecture ou d'écriture est journalisée puis ignorée : l'appel utile se poursuit comme aujourd'hui, y compris côté répondant.
11. **Conservation : tout est gardé**, sans purge dans ce lot. Une ligne fait environ 400 octets ; un entretien hybride en produit une à deux par question, une génération une à quatre. Même 200 000 appels (80 Mo) restent loin de la limite de D1 (10 Go). L'écran affiche le nombre de lignes ; une purge (avec un cumul mensuel conservé) sera à faire si l'on dépasse le million.

---

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `migrations/0005_suivi_couts.sql` | créer — tables `appels_ia`, `tarifs_ia`, `parametres`, grille initiale |
| `shared/couts.ts` | créer — origines, statuts, types échangés avec l'admin |
| `server/services/tarifs.ts` | créer — lire et modifier la grille, trouver un tarif, calculer un coût (pur) |
| `server/services/couts.ts` | créer — enregistrer un appel, cumuls, derniers appels, coût d'un projet, recalcul des lignes sans tarif |
| `server/ia/suivi.ts` | créer — `fetchSuivi` (enveloppe), lecture du flux SSE et du JSON, contexte de suivi |
| `server/ia/appel.ts`, `server/ia/anthropic.ts`, `server/ia/index.ts` | modifier — accepter un suivi et envelopper `fetch` |
| `server/ia/analyse.ts`, `server/ia/cadrage.ts`, `server/ia/questionnaires.ts` | modifier — fournir le suivi |
| `functions/api/messages.ts`, `functions/api/public/r/[jeton]/{reponses,suivant}.ts` | modifier — fournir le suivi |
| `functions/api/admin/couts/index.ts`, `…/couts/appels.ts`, `…/couts/tarifs.ts`, `functions/api/admin/projets/[id]/couts.ts` | créer — routes admin |
| `server/schemas.ts` | modifier — schémas des filtres et des tarifs |
| `src/admin/CoutsScreen.tsx`, `src/admin/TarifsIa.tsx`, `src/admin/ProjetCouts.tsx`, `src/admin/montants.ts` | créer — écrans et mise en forme des montants |
| `src/admin/api.ts`, `src/admin/AdminLayout.tsx`, `src/admin/ProjetScreen.tsx`, `src/main.tsx` | modifier |
| `tests/helpers/api-messages.ts` | modifier — compteurs paramétrables, attente des tâches ajoutées en cours |
| `tests/…` | créer ou adapter |

---

### Task 0 : Branche

- [ ] **Step 1** — le lot 5 est encore sur `lot5-ia-admin` : partir de `main` s'il y a été fusionné, sinon de `lot5-ia-admin`.

```bash
git checkout lot5-ia-admin          # ou main, une fois le lot 5 fusionné
git pull --ff-only
git status --short                  # doit être vide
git checkout -b lot6-suivi-couts
npm test                            # tous verts ; noter le nombre de tests
```

---

### Task 1 : Migration 0005 et types partagés

**Files :** Create `migrations/0005_suivi_couts.sql`, `shared/couts.ts`, `tests/server/migration-couts.test.ts`

- [ ] **Step 1 : écrire le test**

```ts
// tests/server/migration-couts.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { creerBaseDeTest } from '../helpers/d1'

let fermer: () => Promise<void>
afterEach(async () => { await fermer?.() })

describe('migration 0005', () => {
  it('crée la grille initiale, datée du relevé', async () => {
    const base = await creerBaseDeTest()
    fermer = base.fermer
    const opus = await base.db.prepare('SELECT * FROM tarifs_ia WHERE modele = ?').bind('claude-opus-5-5').first()
    expect(opus).toMatchObject({ entree: 4, ecriture_5m: 5, ecriture_1h: 8, lecture: 0.2, sortie: 20, seuil_long: null, releve_le: '2026-11-26' })
    const haiku = await base.db.prepare('SELECT * FROM tarifs_ia WHERE modele = ?').bind('claude-haiku-5-5').first()
    expect(haiku).toMatchObject({ entree: 0.1, lecture: 0.01, sortie: 0.5, seuil_long: 100000, entree_long: 0.5, sortie_long: 2.5 })
  })

  it('refuse une origine ou un statut inconnus', async () => {
    const base = await creerBaseDeTest()
    fermer = base.fermer
    const inserer = (origine: string, statut: string) => base.db.prepare(
      `INSERT INTO appels_ia (id, demande_id, cree_le, origine, modele_demande, flux, statut, duree_ms)
       VALUES (?, 'd', '2026-11-26T10:00:00.000Z', ?, 'claude-opus-5-5', 0, ?, 10)`,
    ).bind(crypto.randomUUID(), origine, statut).run()
    await expect(inserer('relance', 'reussi')).resolves.toBeTruthy()
    await expect(inserer('inconnue', 'reussi')).rejects.toThrow()
    await expect(inserer('relance', 'perdu')).rejects.toThrow()
  })
})
```

- [ ] **Step 2 : vérifier l'échec** — `npx vitest run tests/server/migration-couts.test.ts` : FAIL (« no such table: tarifs_ia »).

- [ ] **Step 3 : écrire la migration.** Le chargeur de test (`tests/helpers/d1.ts`) découpe sur `;` et ignore les lignes qui commencent par `--` : aucun point-virgule dans les commentaires.

```sql
-- Suivi de la consommation de l'API Anthropic : une ligne par requête HTTP vers /v1/messages, essais compris.
-- Aucun texte envoyé ou reçu, aucune donnée personnelle : des identifiants internes seulement.
-- Pas de clé étrangère : la dépense d'un projet ou d'un répondant supprimé reste dans les cumuls.
-- Montants en micro-dollars entiers. Coût NULL : aucun tarif connu pour ce modèle au moment de l'appel.
CREATE TABLE appels_ia (
  id TEXT PRIMARY KEY,
  demande_id TEXT NOT NULL,
  cree_le TEXT NOT NULL,
  origine TEXT NOT NULL CHECK (origine IN ('relance', 'tour_entretien', 'cadrage_tour', 'cadrage_note', 'cadrage_resume',
    'publics', 'generation_questionnaire', 'analyse', 'interview_critique')),
  projet_id TEXT,
  questionnaire_id TEXT,
  repondant_id TEXT,
  modele_demande TEXT NOT NULL,
  modele TEXT,
  flux INTEGER NOT NULL CHECK (flux IN (0, 1)),
  statut TEXT NOT NULL CHECK (statut IN ('reussi', 'refuse', 'tronque', 'interrompu', 'erreur')),
  http_statut INTEGER,
  erreur TEXT,
  jetons_entree INTEGER NOT NULL DEFAULT 0,
  jetons_sortie INTEGER NOT NULL DEFAULT 0,
  jetons_reflexion INTEGER NOT NULL DEFAULT 0,
  cache_lecture INTEGER NOT NULL DEFAULT 0,
  cache_ecriture_5m INTEGER NOT NULL DEFAULT 0,
  cache_ecriture_1h INTEGER NOT NULL DEFAULT 0,
  inference_geo TEXT,
  vitesse TEXT,
  duree_ms INTEGER NOT NULL,
  cout_micro_usd INTEGER,
  cout_sans_cache_micro_usd INTEGER,
  tarif_releve_le TEXT
);

CREATE INDEX idx_appels_date ON appels_ia(cree_le);
CREATE INDEX idx_appels_projet ON appels_ia(projet_id, cree_le);

-- Grille en dollars par million de jetons. Palier long (Haiku 5.5) : au-delà de seuil_long jetons d'entrée,
-- cache compris, toute la requête passe aux prix « _long ».
CREATE TABLE tarifs_ia (
  modele TEXT PRIMARY KEY,
  nom TEXT NOT NULL,
  entree REAL NOT NULL CHECK (entree >= 0),
  ecriture_5m REAL NOT NULL CHECK (ecriture_5m >= 0),
  ecriture_1h REAL NOT NULL CHECK (ecriture_1h >= 0),
  lecture REAL NOT NULL CHECK (lecture >= 0),
  sortie REAL NOT NULL CHECK (sortie >= 0),
  seuil_long INTEGER CHECK (seuil_long > 0),
  entree_long REAL,
  ecriture_5m_long REAL,
  ecriture_1h_long REAL,
  lecture_long REAL,
  sortie_long REAL,
  releve_le TEXT NOT NULL,
  CHECK ((seuil_long IS NULL) = (entree_long IS NULL) AND (seuil_long IS NULL) = (ecriture_5m_long IS NULL)
    AND (seuil_long IS NULL) = (ecriture_1h_long IS NULL) AND (seuil_long IS NULL) = (lecture_long IS NULL)
    AND (seuil_long IS NULL) = (sortie_long IS NULL))
);

-- Réglages simples de l'admin (clé, valeur). Taux de conversion des dollars en euros : saisi par l'admin.
CREATE TABLE parametres (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);

-- Tarifs relevés le 26/11/2026 sur platform.claude.com/docs/en/about-claude/pricing (API Anthropic directe).
INSERT INTO tarifs_ia (modele, nom, entree, ecriture_5m, ecriture_1h, lecture, sortie, releve_le) VALUES
  ('claude-fable-5-2', 'Claude Fable 5.2', 8, 10, 16, 0.20, 40, '2026-11-26'),
  ('claude-mythos-5-2', 'Claude Mythos 5.2', 8, 10, 16, 0.20, 40, '2026-11-26'),
  ('claude-fable-5-1', 'Claude Fable 5.1', 10, 12.5, 20, 0.25, 50, '2026-11-26'),
  ('claude-mythos-5-1', 'Claude Mythos 5.1', 10, 12.5, 20, 0.25, 50, '2026-11-26'),
  ('claude-fable-5', 'Claude Fable 5', 10, 12.5, 20, 1, 50, '2026-11-26'),
  ('claude-mythos-5', 'Claude Mythos 5', 10, 12.5, 20, 1, 50, '2026-11-26'),
  ('claude-opus-5-5', 'Claude Opus 5.5', 4, 5, 8, 0.20, 20, '2026-11-26'),
  ('claude-opus-5', 'Claude Opus 5', 5, 6.25, 10, 0.50, 25, '2026-11-26'),
  ('claude-opus-4-8', 'Claude Opus 4.8', 5, 6.25, 10, 0.50, 25, '2026-11-26'),
  ('claude-opus-4-7', 'Claude Opus 4.7', 5, 6.25, 10, 0.50, 25, '2026-11-26'),
  ('claude-opus-4-6', 'Claude Opus 4.6', 5, 6.25, 10, 0.50, 25, '2026-11-26'),
  ('claude-opus-4-5', 'Claude Opus 4.5', 5, 6.25, 10, 0.50, 25, '2026-11-26'),
  ('claude-sonnet-5-5', 'Claude Sonnet 5.5', 2, 2.5, 4, 0.10, 10, '2026-11-26'),
  ('claude-sonnet-5', 'Claude Sonnet 5', 2, 2.5, 4, 0.20, 10, '2026-11-26'),
  ('claude-sonnet-4-6', 'Claude Sonnet 4.6', 3, 3.75, 6, 0.30, 15, '2026-11-26'),
  ('claude-sonnet-4-5', 'Claude Sonnet 4.5', 3, 3.75, 6, 0.30, 15, '2026-11-26'),
  ('claude-haiku-4-5', 'Claude Haiku 4.5', 1, 1.25, 2, 0.10, 5, '2026-11-26');

INSERT INTO tarifs_ia (modele, nom, entree, ecriture_5m, ecriture_1h, lecture, sortie, seuil_long,
  entree_long, ecriture_5m_long, ecriture_1h_long, lecture_long, sortie_long, releve_le) VALUES
  ('claude-haiku-5-5', 'Claude Haiku 5.5', 0.10, 0.125, 0.20, 0.01, 0.50, 100000, 0.50, 0.625, 1, 0.05, 2.50, '2026-11-26');
```

- [ ] **Step 4 : créer `shared/couts.ts`**

```ts
// Suivi des coûts de l'IA : types communs au serveur et à l'admin. Montants en micro-dollars entiers.

export const ORIGINES = [
  'relance', 'tour_entretien', 'cadrage_tour', 'cadrage_note', 'cadrage_resume',
  'publics', 'generation_questionnaire', 'analyse', 'interview_critique',
] as const
export type Origine = (typeof ORIGINES)[number]

export const LIBELLES_ORIGINE: Record<Origine, string> = {
  relance: 'Relance (entretien hybride)',
  tour_entretien: "Tour d'entretien",
  cadrage_tour: 'Dialogue de cadrage',
  cadrage_note: 'Note de cadrage',
  cadrage_resume: 'Résumé de contexte',
  publics: 'Proposition de publics',
  generation_questionnaire: 'Génération de questionnaire',
  analyse: 'Analyse',
  interview_critique: 'Interview critique',
}

export const STATUTS_APPEL = ['reussi', 'refuse', 'tronque', 'interrompu', 'erreur'] as const
export type StatutAppel = (typeof STATUTS_APPEL)[number]

export const LIBELLES_STATUT: Record<StatutAppel, string> = {
  reussi: 'Réussi',
  refuse: 'Refusé par le modèle',
  tronque: 'Tronqué (longueur maximale)',
  interrompu: 'Interrompu (compteurs minimum)',
  erreur: 'En erreur (non facturé)',
}

/** Jetons d'un appel, tels que l'API les compte. */
export interface Jetons {
  jetons_entree: number
  jetons_sortie: number
  /** Comprise dans la sortie : décomposition pour information. */
  jetons_reflexion: number
  cache_lecture: number
  cache_ecriture_5m: number
  cache_ecriture_1h: number
}

export interface AppelIa extends Jetons {
  id: string
  demande_id: string
  cree_le: string
  origine: Origine
  projet_id: string | null
  /** Titre actuel du projet ; null s'il a été supprimé ou si l'appel n'en a pas. */
  projet_titre: string | null
  questionnaire_id: string | null
  repondant_id: string | null
  modele_demande: string
  modele: string | null
  flux: boolean
  statut: StatutAppel
  http_statut: number | null
  erreur: string | null
  inference_geo: string | null
  vitesse: string | null
  duree_ms: number
  /** null : aucun tarif connu au moment de l'appel. */
  cout_micro_usd: number | null
  cout_sans_cache_micro_usd: number | null
  tarif_releve_le: string | null
}

/** Une ligne de cumul (un mois, un projet, une origine ou un modèle). */
export interface Cumul extends Jetons {
  cle: string
  libelle: string
  nb_appels: number
  nb_sans_tarif: number
  cout_micro_usd: number
  cout_sans_cache_micro_usd: number
}

export interface ResumeCouts {
  total: Cumul
  par_mois: Cumul[]
  par_projet: Cumul[]
  par_origine: Cumul[]
  par_modele: Cumul[]
  /** Nombre de lignes de la table, pour surveiller la volumétrie (décision 11). */
  nb_lignes: number
  /** Taux saisi par l'admin (1 dollar = x euros), ou null. */
  taux_eur: number | null
}

export interface FiltreCouts {
  depuis?: string
  jusqu_a?: string
  projet_id?: string
  origine?: Origine
  modele?: string
  statut?: StatutAppel
}

export interface Tarif {
  modele: string
  nom: string
  entree: number
  ecriture_5m: number
  ecriture_1h: number
  lecture: number
  sortie: number
  seuil_long: number | null
  entree_long: number | null
  ecriture_5m_long: number | null
  ecriture_1h_long: number | null
  lecture_long: number | null
  sortie_long: number | null
  releve_le: string
}

/** Économie due au cache : ce qu'aurait coûté l'entrée sans cache, moins ce qu'elle a coûté. Peut être négative. */
export function economieCache(c: { cout_micro_usd: number; cout_sans_cache_micro_usd: number }): number {
  return c.cout_sans_cache_micro_usd - c.cout_micro_usd
}
```

- [ ] **Step 5 : vérifier** — `npx vitest run tests/server/migration-couts.test.ts && npx tsc -b` : PASS.
- [ ] **Step 6 : commit**

```bash
git add migrations/0005_suivi_couts.sql shared/couts.ts tests/server/migration-couts.test.ts
git commit -m "feat: tables du suivi des coûts de l'IA et grille de tarifs"
```

---

### Task 2 : Calcul du coût et grille de tarifs

**Files :** Create `server/services/tarifs.ts`, `tests/server/tarifs.test.ts`

**Comportement.**
- `trouverTarif(tarifs, modele)` : l'identifiant exact, sinon le tarif `m` tel que `modele` vaut `m` suivi de `-AAAAMMJJ` ; sinon `null`. Jamais de rapprochement plus large : `claude-opus-5-6` ne prend pas le tarif de `claude-opus-5`.
- `calculerCout(jetons, contexte, tarif)` : `null` si `vitesse` vaut `fast` (prix non gérés, décision 4) ; sinon micro-dollars arrondis à l'entier, avec palier long si l'entrée totale dépasse `seuil_long`, et ×1,1 si `inference_geo` vaut `us`. Le coût sans cache compte toute l'entrée au prix d'entrée.
- `listerTarifs(db)`, `enregistrerTarif(db, tarif)` (crée ou remplace ; prix positifs ou nuls, palier complet ou absent, sinon 400), `supprimerTarif(db, modele)` (404 si inconnu), `lireTauxEur(db)` / `enregistrerTauxEur(db, taux | null)` (strictement positif, sinon 400).

- [ ] **Step 1 : tests**

```ts
// tests/server/tarifs.test.ts
import { describe, expect, it } from 'vitest'
import type { Jetons, Tarif } from '../../shared/couts'
import { calculerCout, trouverTarif } from '../../server/services/tarifs'

const base = { seuil_long: null, entree_long: null, ecriture_5m_long: null, ecriture_1h_long: null, lecture_long: null, sortie_long: null, releve_le: '2026-11-26' }
const opus: Tarif = { modele: 'claude-opus-5-5', nom: 'Opus 5.5', entree: 4, ecriture_5m: 5, ecriture_1h: 8, lecture: 0.2, sortie: 20, ...base }
const opus5: Tarif = { ...opus, modele: 'claude-opus-5', entree: 5 }
const haiku45: Tarif = { ...opus, modele: 'claude-haiku-4-5', entree: 1 }
const haiku: Tarif = {
  ...opus, modele: 'claude-haiku-5-5', entree: 0.1, ecriture_5m: 0.125, ecriture_1h: 0.2, lecture: 0.01, sortie: 0.5,
  seuil_long: 100_000, entree_long: 0.5, ecriture_5m_long: 0.625, ecriture_1h_long: 1, lecture_long: 0.05, sortie_long: 2.5,
}
const zero: Jetons = { jetons_entree: 0, jetons_sortie: 0, jetons_reflexion: 0, cache_lecture: 0, cache_ecriture_5m: 0, cache_ecriture_1h: 0 }
const standard = { inference_geo: 'global', vitesse: 'standard' }

describe('trouverTarif', () => {
  it("prend l'identifiant exact, puis la famille suivie d'une date, jamais une famille voisine", () => {
    const grille = [opus, opus5, haiku45]
    expect(trouverTarif(grille, 'claude-opus-5-5')).toBe(opus)
    expect(trouverTarif(grille, 'claude-haiku-4-5-20251001')).toBe(haiku45)
    expect(trouverTarif(grille, 'claude-opus-5-6')).toBeNull()
    expect(trouverTarif(grille, 'claude-opus-5-5-preview')).toBeNull()
  })
})

describe('calculerCout', () => {
  it('compte entrée, cache et sortie en micro-dollars', () => {
    // 10 000 × 4 + 50 000 × 0,2 + 2 000 × 5 + 1 000 × 8 + 3 000 × 20 = 40 000 + 10 000 + 10 000 + 8 000 + 60 000
    const jetons = { ...zero, jetons_entree: 10_000, cache_lecture: 50_000, cache_ecriture_5m: 2_000, cache_ecriture_1h: 1_000, jetons_sortie: 3_000 }
    expect(calculerCout(jetons, standard, opus)).toEqual({
      cout_micro_usd: 128_000,
      // 63 000 × 4 + 3 000 × 20
      cout_sans_cache_micro_usd: 312_000,
    })
  })

  it("arrondit à l'entier le plus proche", () => {
    expect(calculerCout({ ...zero, jetons_entree: 3 }, standard, haiku)?.cout_micro_usd).toBe(0)
    expect(calculerCout({ ...zero, jetons_entree: 15 }, standard, haiku)?.cout_micro_usd).toBe(2)
  })

  it("passe toute la requête au palier long au-delà du seuil, cache compris", () => {
    const sous = { ...zero, jetons_entree: 50_000, cache_lecture: 50_000, jetons_sortie: 1_000 }
    const dessus = { ...sous, jetons_entree: 50_001 }
    expect(calculerCout(sous, standard, haiku)?.cout_micro_usd).toBe(5_000 + 500 + 500)
    expect(calculerCout(dessus, standard, haiku)?.cout_micro_usd).toBe(25_001 + 2_500 + 2_500)
  })

  it('applique 1,1 pour une inférence aux États-Unis, et ne chiffre pas le mode rapide', () => {
    expect(calculerCout({ ...zero, jetons_sortie: 1_000 }, { inference_geo: 'us', vitesse: 'standard' }, opus)?.cout_micro_usd).toBe(22_000)
    expect(calculerCout({ ...zero, jetons_sortie: 1_000 }, { inference_geo: 'global', vitesse: 'fast' }, opus)).toBeNull()
  })
})
```

Ajouter dans le même fichier, avec une base de test (`creerBaseDeTest`), les cas du service : liste triée par modèle ; enregistrement d'un nouveau tarif puis remplacement ; prix négatif (400) ; palier incomplet (400) ; suppression d'un modèle inconnu (404) ; taux d'euros enregistré, relu, effacé (`null`), refusé à 0 (400).

- [ ] **Step 2 : vérifier l'échec** — `npx vitest run tests/server/tarifs.test.ts` : FAIL (module absent).

- [ ] **Step 3 : implémenter le calcul**

```ts
// server/services/tarifs.ts (extrait : le calcul ; les fonctions D1 suivent le style de server/services/logiciels.ts)
import type { Jetons, Tarif } from '../../shared/couts'

export interface ContexteTarif {
  inference_geo: string | null
  vitesse: string | null
}

export interface Cout {
  cout_micro_usd: number
  cout_sans_cache_micro_usd: number
}

const DATE_INSTANTANE = /^-\d{8}$/

/** Décision 4 : identifiant exact, sinon la famille suivie d'une date ; jamais une famille voisine. */
export function trouverTarif(tarifs: Tarif[], modele: string): Tarif | null {
  return tarifs.find(t => t.modele === modele)
    ?? tarifs.find(t => modele.startsWith(t.modele) && DATE_INSTANTANE.test(modele.slice(t.modele.length)))
    ?? null
}

/** Jetons × dollars par million = micro-dollars ; arrondi une seule fois, à la fin. */
export function calculerCout(j: Jetons, contexte: ContexteTarif, tarif: Tarif): Cout | null {
  if (contexte.vitesse === 'fast') return null
  const entreeTotale = j.jetons_entree + j.cache_lecture + j.cache_ecriture_5m + j.cache_ecriture_1h
  const long = tarif.seuil_long !== null && entreeTotale > tarif.seuil_long
  const p = long
    ? { entree: tarif.entree_long!, ecriture_5m: tarif.ecriture_5m_long!, ecriture_1h: tarif.ecriture_1h_long!, lecture: tarif.lecture_long!, sortie: tarif.sortie_long! }
    : tarif
  const region = contexte.inference_geo === 'us' ? 1.1 : 1
  const cout = j.jetons_entree * p.entree + j.cache_lecture * p.lecture + j.cache_ecriture_5m * p.ecriture_5m
    + j.cache_ecriture_1h * p.ecriture_1h + j.jetons_sortie * p.sortie
  const sansCache = entreeTotale * p.entree + j.jetons_sortie * p.sortie
  return { cout_micro_usd: Math.round(cout * region), cout_sans_cache_micro_usd: Math.round(sansCache * region) }
}
```

Puis les fonctions D1 : `listerTarifs`, `enregistrerTarif` (`INSERT … ON CONFLICT(modele) DO UPDATE`, puis `recalculerSansTarif`, Task 3), `supprimerTarif`, `lireTauxEur`, `enregistrerTauxEur` (clé `taux_eur_par_usd` de `parametres`, supprimée si `null`). Les erreurs sont des `ErreurMetier` (400, 404).

- [ ] **Step 4 : vérifier** — `npx vitest run tests/server/tarifs.test.ts && npx tsc -b` : PASS.
- [ ] **Step 5 : commit**

```bash
git add server/services/tarifs.ts tests/server/tarifs.test.ts
git commit -m "feat: grille de tarifs et calcul du coût d'un appel"
```

---

### Task 3 : Enregistrement d'un appel

**Files :** Create `server/services/couts.ts` (première partie), `tests/server/couts.test.ts`

**Comportement.**
- `enregistrerAppel(db, saisie: SaisieAppel)` où `SaisieAppel` = tout `AppelIa` sauf `id`, `projet_titre`, `cout_*`, `tarif_releve_le`. Lit la grille, cherche le tarif du modèle de la réponse, à défaut du modèle demandé (`trouverTarif`), calcule le coût (`calculerCout`) ; une ligne `erreur` a un coût de 0 même sans tarif ; insère la ligne avec `tarif_releve_le` du tarif utilisé. Renvoie l'id.
- `recalculerSansTarif(db)` : pour chaque ligne au coût `NULL` dont un tarif existe désormais, calcule et écrit le coût ; ne touche jamais une ligne déjà chiffrée (décision 5). Appelée par `enregistrerTarif`.

- [ ] **Step 1 : tests** (base de test réelle) :
  - un appel Opus 5.5 réussi est chiffré, avec `tarif_releve_le` `2026-11-26` ;
  - un appel `claude-haiku-4-5-20251001` prend le tarif de `claude-haiku-4-5` ;
  - un modèle de réponse inconnu mais un modèle demandé connu : tarif du modèle demandé ;
  - un modèle inconnu : coût `NULL` ; après `enregistrerTarif` de ce modèle, la ligne est chiffrée ; une ligne déjà chiffrée garde son coût quand on change ensuite le tarif ;
  - une ligne `erreur` sans jeton : coût 0 ;
  - aucune colonne ne reçoit de texte libre autre que `erreur` (type d'erreur de l'API, 100 caractères au plus, coupé au-delà).
- [ ] **Step 2 : vérifier l'échec, implémenter, vérifier le succès** (`npx vitest run tests/server/couts.test.ts && npx tsc -b`).
- [ ] **Step 3 : commit**

```bash
git add server/services/couts.ts server/services/tarifs.ts tests/server/couts.test.ts
git commit -m "feat: enregistrement chiffré des appels à l'IA"
```

---

### Task 4 : Le compteur sur `fetch`

**Files :** Create `server/ia/suivi.ts`, `tests/server/ia-suivi.test.ts` ; Modify `tests/helpers/api-messages.ts`

**Comportement de `fetchSuivi(suivi, sous?)`.** Sans `sous`, la fonction renvoyée lit `globalThis.fetch` à chaque appel (et non à sa création), pour que les tests qui remplacent `fetch` global continuent de fonctionner.
- Ne s'occupe que des `POST` dont le chemin finit par `/v1/messages` ; tout le reste (liste des modèles, `count_tokens`) passe sans être enregistré.
- Lit dans le corps de la requête (chaîne JSON envoyée par le SDK) `model` et `stream` ; corps illisible : `modele_demande` `inconnu`, `flux` faux. Ne modifie jamais la requête.
- Erreur réseau ou abandon avant les en-têtes : ligne `erreur` (`erreur` = nom de l'exception), puis l'exception est relancée telle quelle.
- Réponse HTTP d'erreur : renvoyée telle quelle ; ligne `erreur` avec `http_statut` et le `error.type` lu sur une copie (`clone()`), en arrière-plan.
- Réponse JSON : renvoyée telle quelle ; `usage`, `model` et `stop_reason` lus sur une copie, en arrière-plan.
- Réponse en flux (`text/event-stream`) : le corps est dédoublé (`tee()`) ; le SDK reçoit une `Response` avec le même statut et les mêmes en-têtes ; la copie est lue en arrière-plan : `message_start` (modèle, premiers compteurs), `message_delta` (compteurs cumulatifs, le dernier remplace, et `stop_reason`), `message_stop`, `error`. Sans `message_stop` ou avec un `error` : statut `interrompu` avec les derniers compteurs.
- Statut d'un message complet : `refusal` → `refuse`, `max_tokens` → `tronque`, autre → `reussi`.
- Compteurs : `cache_creation.ephemeral_5m/1h_input_tokens` s'ils existent, sinon tout `cache_creation_input_tokens` en 5 min ; `output_tokens_details.thinking_tokens` pour la réflexion ; `inference_geo`, `speed`.
- Durée : du départ de la requête à la fin de la lecture (fin du flux pour un flux).
- L'écriture (`enregistrerAppel`) est confiée à `suivi.attendre` (le `waitUntil` de la route) ; toute erreur de lecture ou d'écriture est journalisée (`console.error('Suivi des coûts de l\'IA', …)`, sans le corps) et avalée. Sans `attendre`, la promesse court seule, avec la même protection.

- [ ] **Step 1 : étendre l'aide des tests.** Dans `tests/helpers/api-messages.ts`, `reponseSse` et `reponseJson` acceptent des compteurs (sans changer leur comportement par défaut, pour ne casser aucun test existant), et `contexteRoute().tache()` attend aussi les tâches ajoutées pendant l'attente (l'écriture du suivi est confiée à `waitUntil` depuis une tâche déjà en cours) :

```ts
export interface CompteursSimules {
  input_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  cache_creation?: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number }
  output_tokens?: number
  output_tokens_details?: { thinking_tokens: number }
}

/** Réponse en flux de l'API : le texte en morceaux, puis la raison d'arrêt. */
export function reponseSse(
  morceaux: string[], stop_reason = 'end_turn', modele = 'claude-simule', compteurs: CompteursSimules = {},
): Response {
  const { output_tokens = 20, output_tokens_details, ...entree } = compteurs
  const evenements: Evenement[] = [
    {
      type: 'message_start',
      message: {
        id: 'msg_1', type: 'message', role: 'assistant', model: modele, content: [], stop_reason: null, stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...entree },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...morceaux.map(t => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })),
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta', delta: { stop_reason, stop_sequence: null },
      usage: { output_tokens, ...(output_tokens_details ? { output_tokens_details } : {}) },
    },
    { type: 'message_stop' },
  ]
  return new Response(evenements.map(sse).join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

// Dans contexteRoute : attendre jusqu'à ce qu'aucune tâche nouvelle n'apparaisse.
tache: async () => {
  for (let vus = 0; vus < enCours.length;) {
    const lot = enCours.slice(vus)
    vus = enCours.length
    await Promise.all(lot)
  }
},
```

`reponseJson(valeur, stop_reason, compteurs?)` transmet `compteurs` à `reponseSse`.

- [ ] **Step 2 : tests** (`tests/server/ia-suivi.test.ts`), avec une vraie base de test, un `attendre` qui collecte les promesses, et `apiSimulee` comme `fetch` sous-jacent. Chaque test appelle la fonction obtenue comme le ferait le SDK, lit la réponse jusqu'au bout, attend les tâches, puis lit `appels_ia` :
  1. flux complet : modèle de la réponse, entrée, lecture et écriture du cache, sortie et réflexion du dernier `message_delta`, statut `reussi`, `flux` 1, `demande_id` et identifiants du suivi, coût calculé ;
  2. **le texte reçu par le lecteur est identique, octet pour octet, à celui de la réponse simulée** ; statut HTTP et `Content-Type` conservés ;
  3. `stop_reason` `max_tokens` → `tronque` ; `refusal` → `refuse` ;
  4. flux coupé (`reponseCoupee`) → `interrompu`, `erreur` `overloaded_error`, entrée comptée ;
  5. réponse JSON (`messages.parse`) : compteurs lus, corps renvoyé intact ;
  6. réponse 529 : ligne `erreur`, `http_statut` 529, zéro jeton, et la réponse d'erreur parvient intacte à l'appelant ;
  7. `sous` qui lève : ligne `erreur`, même exception relancée ;
  8. `GET /v1/models` et `POST /v1/messages/count_tokens` : aucune ligne ;
  9. **écriture D1 en panne** (base fermée, ou `db.prepare` qui lève) : la réponse est rendue et lue normalement, aucune exception ne remonte, `console.error` est appelé une fois ;
  10. **lecteur lent** : le SDK reçoit le premier morceau avant que la copie soit lue (la copie n'est jamais attendue par la réponse) ;
  11. compteurs sans détail du cache : tout `cache_creation_input_tokens` compté en 5 min.
- [ ] **Step 3 : vérifier l'échec** — `npx vitest run tests/server/ia-suivi.test.ts` : FAIL.
- [ ] **Step 4 : implémenter**

```ts
// server/ia/suivi.ts
// Point de passage unique du suivi des coûts : la fonction `fetch` du client SDK (et du proxy de l'interview critique).
// La requête et la réponse passent sans changement ; les compteurs sont lus sur une copie, après coup, puis
// l'appel est enregistré par `waitUntil`. Une panne du suivi est journalisée et n'interrompt jamais l'appel utile.

import type { Origine, StatutAppel } from '../../shared/couts'
import { nouvelId } from '../ids'
import { enregistrerAppel } from '../services/couts'

/** Ce que la route sait de l'appel. */
export interface ContexteSuivi {
  db: D1Database
  projet_id?: string | null
  questionnaire_id?: string | null
  repondant_id?: string | null
  /** `context.waitUntil` de la route : garde l'écriture vivante après la réponse. */
  attendre?: (promesse: Promise<unknown>) => void
}

export interface Suivi extends ContexteSuivi {
  origine: Origine
  /** Commun aux requêtes d'une même action : essais du SDK, reprise sans effort, second essai. */
  demande_id: string
}

export function suivre(contexte: ContexteSuivi, origine: Origine): Suivi {
  return { ...contexte, origine, demande_id: nouvelId() }
}

interface Usage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } | null
  output_tokens_details?: { thinking_tokens?: number } | null
  inference_geo?: string | null
  speed?: string | null
}

interface Lecture {
  modele: string | null
  usage: Usage
  stop_reason: string | null
  complet: boolean
  erreur: string | null
}

function planifier(suivi: Suivi, travail: Promise<unknown>): void {
  const protege = travail.catch(e => console.error("Suivi des coûts de l'IA", e instanceof Error ? e.message : e))
  if (suivi.attendre) suivi.attendre(protege)
}

function estAppelMessages(url: string, methode: string): boolean {
  try {
    return methode.toUpperCase() === 'POST' && new URL(url).pathname.endsWith('/v1/messages')
  } catch {
    return false
  }
}

function lireDemande(corps: unknown): { modele_demande: string; flux: boolean } {
  if (typeof corps !== 'string') return { modele_demande: 'inconnu', flux: false }
  try {
    const json = JSON.parse(corps) as { model?: unknown; stream?: unknown }
    return { modele_demande: typeof json.model === 'string' ? json.model : 'inconnu', flux: json.stream === true }
  } catch {
    return { modele_demande: 'inconnu', flux: false }
  }
}

/** `usage` des `message_delta` est cumulatif : chaque champ reçu remplace le précédent. */
function fusionner(cible: Usage, source: Usage | undefined): void {
  if (source) Object.assign(cible, Object.fromEntries(Object.entries(source).filter(([, v]) => v != null)))
}

function statutDe(lecture: Lecture): StatutAppel {
  if (lecture.erreur || !lecture.complet) return 'interrompu'
  if (lecture.stop_reason === 'refusal') return 'refuse'
  if (lecture.stop_reason === 'max_tokens') return 'tronque'
  return 'reussi'
}

export async function lireFlux(corps: ReadableStream<Uint8Array>): Promise<Lecture> {
  const lecture: Lecture = { modele: null, usage: {}, stop_reason: null, complet: false, erreur: null }
  const lecteur = corps.pipeThrough(new TextDecoderStream()).getReader()
  let tampon = ''
  try {
    for (;;) {
      const { value, done } = await lecteur.read()
      if (done) break
      tampon += value
      for (let fin = tampon.indexOf('\n\n'); fin >= 0; fin = tampon.indexOf('\n\n')) {
        const bloc = tampon.slice(0, fin)
        tampon = tampon.slice(fin + 2)
        const donnees = bloc.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n')
        if (!donnees) continue
        let e: { type?: string; message?: { model?: string; usage?: Usage }; usage?: Usage; delta?: { stop_reason?: string | null }; error?: { type?: string } }
        try { e = JSON.parse(donnees) } catch { continue }
        if (e.type === 'message_start') { lecture.modele = e.message?.model ?? null; fusionner(lecture.usage, e.message?.usage) }
        else if (e.type === 'message_delta') { fusionner(lecture.usage, e.usage); lecture.stop_reason = e.delta?.stop_reason ?? lecture.stop_reason }
        else if (e.type === 'message_stop') lecture.complet = true
        else if (e.type === 'error') lecture.erreur = e.error?.type ?? 'error'
      }
    }
  } catch (e) {
    lecture.erreur ??= e instanceof Error ? e.name : 'interruption'
  }
  return lecture
}
```

Puis `fetchSuivi` : mesure le départ, distingue les cas ci-dessus, et pour chaque cas construit la `SaisieAppel` (jetons tirés de `usage`, voir le comportement) et appelle `planifier(suivi, enregistrerAppel(suivi.db, saisie))`. Pour le flux :

```ts
const [pourAppelant, pourCompteur] = reponse.body.tee()
planifier(suivi, lireFlux(pourCompteur).then(lecture => enregistrerAppel(suivi.db, saisieDepuis(lecture, …))))
return new Response(pourAppelant, { status: reponse.status, statusText: reponse.statusText, headers: reponse.headers })
```

Tout ce qui suit la réception de la réponse est dans un `try` : en cas d'exception du suivi lui-même, la réponse d'origine est rendue telle quelle.

- [ ] **Step 5 : vérifier** — `npx vitest run tests/server/ia-suivi.test.ts && npm test && npx tsc -b` : PASS (aucun test existant cassé par l'aide modifiée).
- [ ] **Step 6 : commit**

```bash
git add server/ia/suivi.ts tests/server/ia-suivi.test.ts tests/helpers/api-messages.ts
git commit -m "feat: compteur de consommation sur la fonction fetch des appels à l'IA"
```

---

### Task 5 : Brancher tous les appels

**Files :** Modify `server/ia/appel.ts`, `server/ia/anthropic.ts`, `server/ia/index.ts`, `server/ia/analyse.ts`, `server/ia/cadrage.ts`, `server/ia/questionnaires.ts`, `functions/api/messages.ts`, `functions/api/public/r/[jeton]/reponses.ts`, `functions/api/public/r/[jeton]/suivant.ts` ; tests existants correspondants.

- [ ] **Step 1 : `server/ia/appel.ts`.** `DemandeIa` gagne `suivi?: Suivi`. Dans `parcourir`, le client reçoit :

```ts
fetch: demande.suivi ? fetchSuivi(demande.suivi, demande.fetch) : demande.fetch,
```

Rien d'autre ne change : la reprise sans effort et l'essai du SDK passent par la même fonction et partagent le `demande_id`.

- [ ] **Step 2 : `server/ia/anthropic.ts`.** `OptionsIa` gagne `suivi?: ContexteSuivi`. L'origine dépend de la méthode : `demander` reçoit l'origine et construit son client à chaque décision (construction légère, sans réseau) :

```ts
const client = new Anthropic({
  apiKey: options.cleApi, timeout: DELAI_APPEL_MS, maxRetries: NOUVEAUX_ESSAIS,
  fetch: options.suivi ? fetchSuivi(suivre(options.suivi, origine), options.fetch) : options.fetch,
})
```

`deciderRelance` passe `'relance'`, `prochainTour` `'tour_entretien'`. Le délai de 12 s et le nouvel essai unique ne changent pas.

- [ ] **Step 3 : `server/ia/index.ts`.** `iaPourQuestionnaire(env, db, questionnaire, suivi?: Omit<ContexteSuivi, 'db'>)` transmet `{ db, projet_id: questionnaire.projet_id, questionnaire_id: questionnaire.id, ...suivi }` à `creerIaAnthropic`. `iaPourJeton(env, jeton, attendre?)` ajoute `repondant_id: repondant.id` (fourni par `lireRepondantParJeton`) et `attendre`. Les deux routes publiques passent `context.waitUntil.bind(context)` :

```ts
export const onRequestPost = route<'jeton'>(async contexte => {
  const { env, params } = contexte
  const jeton = parametre(params.jeton)
  const ia = await iaPourJeton(env, jeton, p => contexte.waitUntil(p))
  return json(await relancerSuite(env.DB, ia, jeton))
})
```

- [ ] **Step 4 : routes de l'admin.** Dans `cadrage.ts`, `questionnaires.ts` et `analyse.ts`, chaque `DemandeIa` (ou `OptionsAnalyse`, qui gagne `suivi?: Suivi` transmis à `genererTexte`) reçoit `suivi: suivre({ db: env.DB, projet_id, attendre: p => contexte.waitUntil(p) }, origine)` avec l'origine de la décision 3 ; une analyse ajoute `questionnaire_id` et `repondant_id` de sa portée. Dans `repondreGeneration`, le suivi est créé **une fois**, hors de `essayer`, pour que les deux essais partagent le `demande_id`.

- [ ] **Step 5 : proxy de l'interview critique** (`functions/api/messages.ts`) : la route prend le contexte complet et appelle

```ts
const appeler = fetchSuivi(suivre({ db: env.DB, attendre: p => context.waitUntil(p) }, 'interview_critique'))
reponse = await appeler('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(corps) })
```

Le reste (statuts 401/403 traduits, corps relayé) ne change pas. Le test existant stubbe `fetch` global : `fetchSuivi` le prend par défaut au moment de l'appel (lire `globalThis.fetch` dans la fonction renvoyée, pas à sa création), et le contexte de test gagne `waitUntil` et une base.

- [ ] **Step 6 : tests de branchement.**
  - `tests/server/ia-anthropic.test.ts` : une relance avec `suivi` écrit une ligne `relance` avec projet, questionnaire, répondant ; un refus du réglage d'effort suivi d'un appel sans effort écrit **deux** lignes (`erreur` 400 puis `reussi`) de même `demande_id` ; sans `suivi`, aucune ligne et aucun appel à la base.
  - `tests/functions/api-public.test.ts` : un parcours hybride avec une relance enregistre une ligne `relance` ; **aucun champ des réponses publiques ne change** (comparer aux attentes existantes) ; base du suivi en panne : la relance est quand même posée.
  - `tests/functions/api-cadrage.test.ts` : un tour de cadrage écrit une ligne `cadrage_tour` avec le `projet_id` et les compteurs de cache simulés ; note et résumé, `cadrage_note` et `cadrage_resume`.
  - `tests/functions/api-generation.test.ts` : génération invalide puis corrigée → deux lignes `generation_questionnaire` de même `demande_id` ; publics → `publics`.
  - `tests/functions/api-analyses.test.ts` : une analyse écrit une ligne `analyse`, même si le navigateur s'est déconnecté (cas existant).
  - `tests/functions/messages.test.ts` : une ligne `interview_critique` sans projet ; réponse relayée inchangée.
  - Le plafond de questions du cadrage (aucun appel à l'IA) n'écrit aucune ligne.
- [ ] **Step 7 : vérifier** — `npm test && npx tsc -b && npm run build` : PASS.
- [ ] **Step 8 : commit**

```bash
git add server/ia functions/api tests
git commit -m "feat: suivi de la consommation de tous les appels à l'IA"
```

---

### Task 6 : Cumuls et détail

**Files :** Modify `server/services/couts.ts`, `tests/server/couts.test.ts`

**Comportement.**
- `resumerCouts(db, filtre: FiltreCouts)` → `ResumeCouts` : total ; par mois (`substr(cree_le, 1, 7)`, mois le plus récent d'abord, libellé « novembre 2026 ») ; par projet (titre actuel par jointure gauche sur `projets`, « Projet supprimé » si absent, « Sans projet » pour l'interview critique), du plus cher au moins cher ; par origine (libellés de `LIBELLES_ORIGINE`) ; par modèle (modèle de la réponse, à défaut le modèle demandé ; libellé = nom de la grille s'il existe). Chaque cumul : nombre d'appels, nombre sans tarif, sommes des jetons, coût, coût sans cache (une ligne sans tarif compte 0 dans les sommes et 1 dans `nb_sans_tarif`). `nb_lignes` : toute la table, sans filtre. `taux_eur`.
- `listerAppels(db, filtre, { avant?: string, limite = 50 })` → `{ appels: AppelIa[], suite: string | null }` : plus récents d'abord ; pagination par curseur sur `cree_le` puis `id` ; `limite` 200 au plus.
- `coutProjet(db, projetId)` → `{ total: Cumul, par_origine: Cumul[] }` (404 si le projet n'existe pas ; les lignes restent comptées pour un projet supprimé, mais cette fonction ne sert qu'à la fiche d'un projet existant).
- Les dates de filtre sont des jours `AAAA-MM-JJ` (UTC) ; `jusqu_a` inclut le jour.

- [ ] **Step 1 : tests** : jeu de lignes insérées directement (deux projets, dont un supprimé ensuite, un appel d'interview critique, trois mois, deux modèles, une ligne sans tarif, une erreur) ; vérifier chaque regroupement, les libellés, l'ordre, les filtres (période, projet, origine, modèle, statut), la pagination sans doublon ni trou sur deux lignes de même `cree_le`, `nb_lignes` indifférent aux filtres, et l'économie du cache (`economieCache`) sur un cumul.
- [ ] **Step 2 : vérifier l'échec, implémenter (SQL agrégé avec `GROUP BY`, une requête par regroupement), vérifier le succès.**
- [ ] **Step 3 : commit**

```bash
git add server/services/couts.ts tests/server/couts.test.ts
git commit -m "feat: cumuls et détail des coûts de l'IA"
```

---

### Task 7 : Routes de l'admin

**Files :** Create `functions/api/admin/couts/index.ts`, `functions/api/admin/couts/appels.ts`, `functions/api/admin/couts/tarifs.ts`, `functions/api/admin/projets/[id]/couts.ts`, `tests/functions/api-couts.test.ts` ; Modify `server/schemas.ts`

| Route | Rôle |
|---|---|
| `GET /api/admin/couts?depuis&jusqu_a&projet_id&origine&modele&statut` | `ResumeCouts` |
| `GET /api/admin/couts/appels?…mêmes filtres…&avant&limite` | `{ appels, suite }` |
| `GET /api/admin/couts/tarifs` | `{ tarifs: Tarif[], taux_eur }` |
| `PUT /api/admin/couts/tarifs` avec un `Tarif` | crée ou remplace, recalcule les lignes sans tarif, renvoie la grille |
| `DELETE /api/admin/couts/tarifs?modele=…` | 204 |
| `PUT /api/admin/couts/taux` avec `{ taux_eur: number \| null }` | 204 |
| `GET /api/admin/projets/:id/couts` | `coutProjet` |

Chaque route : `route()` de `server/api.ts`, validation Zod (`schemaFiltreCouts` avec `z.enum(ORIGINES)` et `z.enum(STATUTS_APPEL)`, dates `^\d{4}-\d{2}-\d{2}$` ; `schemaTarif` ; `schemaTaux`), appel du service. La session est vérifiée par le `_middleware.ts` existant de `/api/admin`.

- [ ] **Step 1 : tests** : chaque route renvoie la forme attendue ; filtre invalide (origine inconnue, date mal formée) → 400 ; **sans session, 401 sur chaque route** ; `PUT` d'un tarif chiffre une ligne qui ne l'était pas ; **aucune route `/api/public/*` ni aucun outil MCP n'expose ces données** (le catalogue MCP garde son nombre d'outils ; une recherche de `appels_ia` dans `server/mcp/` et `functions/api/public/` ne trouve rien, test par lecture des fichiers).
- [ ] **Step 2 : vérifier l'échec, implémenter, vérifier le succès** (`npm test && npx tsc -b`).
- [ ] **Step 3 : commit**

```bash
git add functions/api/admin server/schemas.ts tests/functions/api-couts.test.ts
git commit -m "feat: routes admin du suivi des coûts"
```

---

### Conventions des écrans (Task 8)

Celles du lot 2B (composants de `src/admin/commun.tsx`, `champs.tsx`, libellés dans `libelles.ts`, erreurs en `role="alert"`, garde des saisies `src/admin/saisies.tsx` pour la grille de tarifs, pas de nouvelle dépendance ni de graphique). Montants : `src/admin/montants.ts` (pur, testé) — `dollars(micro)` donne « 0,0123 $ » sous 1 $, « 12,34 $ » au-delà, en `fr-FR` ; `euros(micro, taux)` « ≈ 11,35 € » ; `jetons(n)` « 12 345 » ; un montant inconnu s'affiche « — (tarif manquant) ».

### Task 8 : Écrans

**Files :** Create `src/admin/CoutsScreen.tsx`, `src/admin/TarifsIa.tsx`, `src/admin/ProjetCouts.tsx`, `src/admin/montants.ts`, `tests/src/montants.test.ts` ; Modify `src/admin/api.ts`, `src/admin/AdminLayout.tsx`, `src/admin/ProjetScreen.tsx`, `src/main.tsx`

- [ ] **Step 1 : client** — `api.couts.resumer(filtre)`, `lister(filtre, avant?)`, `tarifs()`, `enregistrerTarif(t)`, `supprimerTarif(modele)`, `enregistrerTaux(taux)`, `projet(id)`.
- [ ] **Step 2 : `/admin/couts`** (entrée « Coûts de l'IA » dans le menu de `AdminLayout`) :
  - filtres en haut : période (ce mois, mois dernier, 12 derniers mois, tout, ou deux dates), projet, type d'appel, modèle, statut ; ils s'appliquent aux cumuls et au détail, et sont gardés dans l'adresse (`?depuis=…`) pour qu'un rechargement les conserve ;
  - bandeau : coût total, ≈ euros si un taux est saisi, nombre d'appels, « dont N sans tarif » s'il y en a (avec un lien vers la grille), économie due au cache (« le cache a évité 12,40 $, soit 38 % de l'entrée ») ;
  - quatre tableaux de cumul (par mois, par projet, par type d'appel, par modèle) : appels, jetons d'entrée, lus en cache, écrits en cache, sortie, coût ; un clic sur une ligne applique le filtre correspondant ;
  - détail des derniers appels : date et heure, type, projet (lien vers sa fiche), modèle (signalé si différent du modèle demandé), statut, jetons (entrée / cache lu / cache écrit / sortie dont réflexion), durée, coût ; « Afficher plus » suit le curseur ; une ligne `interrompu` porte la mention « compteurs minimum » ;
  - pied de page : nombre de lignes enregistrées (décision 11), date du relevé de tarifs le plus ancien.
- [ ] **Step 3 : grille de tarifs** (`TarifsIa`, section repliable de `/admin/couts`) : tableau éditable (modèle, nom, cinq prix, palier facultatif, date du relevé), « Ajouter un modèle », « Supprimer » avec confirmation, taux $ → € ; rappel en tête : « Prix en dollars par million de jetons, d'après platform.claude.com/docs/en/about-claude/pricing. Un changement ne modifie pas le coût des appels déjà enregistrés, sauf ceux restés sans tarif. » ; les modèles du catalogue (`/api/admin/modeles`) absents de la grille sont listés pour être ajoutés.
- [ ] **Step 4 : fiche projet** — section « Coût de l'IA » (`ProjetCouts`, en bas de `ProjetScreen`) : total, ≈ euros, nombre d'appels, répartition par type d'appel, lien « Voir le détail » vers `/admin/couts?projet_id=…`.
- [ ] **Step 5 : tests** — `tests/src/montants.test.ts` : formats ci-dessus, arrondis, montant inconnu, taux absent. `npm run build && npm test`.
- [ ] **Step 6 : commit**

```bash
git add src tests/src/montants.test.ts
git commit -m "feat: écran des coûts de l'IA et coût d'un projet"
```

---

### Task 9 : Vérification

Instance locale à jour (`npm run db:local` pour la migration 0005, `npm run build`, `npm run pages:dev`), vraie clé API, modèles par défaut, quelques appels seulement. Les jetons enregistrés se lisent avec :

```bash
npx wrangler d1 execute vasseur-interview --local --command "SELECT origine, modele, statut, jetons_entree, cache_lecture, cache_ecriture_5m, jetons_sortie, jetons_reflexion, cout_micro_usd, demande_id FROM appels_ia ORDER BY cree_le DESC LIMIT 20"
```

Pour comparer avec ce que renvoie l'API, ajouter **temporairement** (non commité) un `console.log('usage', message.model, JSON.stringify(message.usage))` après `finalMessage()` dans `server/ia/appel.ts` et après `parse` dans `server/ia/anthropic.ts`, et lire la sortie de `pages:dev`.

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Tour de cadrage n° 1 sur un projet avec un document de plusieurs pages | une ligne `cadrage_tour` ; jetons identiques au `usage` journalisé ; `cache_ecriture_5m` non nul |
| 2 | Tour n° 2 dans les 5 minutes | `cache_lecture` non nul et proche de l'écriture du tour 1 : **le cache de prompt du lot 5 est lu d'un tour à l'autre** ; économie du cache positive sur l'écran |
| 3 | Rédiger la note de cadrage | ligne `cadrage_note`, `flux` 1, jetons identiques au journal, réflexion non nulle (Opus 5.5) |
| 4 | Générer un questionnaire | ligne(s) `generation_questionnaire` ; s'il y a eu un second essai, deux lignes de même `demande_id` |
| 5 | Parcours répondant hybride avec une relance | ligne `relance` avec projet, questionnaire et répondant ; temps de réponse de la page inchangé à l'œil (et `duree_ms` cohérent) |
| 6 | Interview critique (`/`) : générer les questions | ligne `interview_critique` sans projet |
| 7 | Synthèse d'un projet, onglet fermé pendant la génération | ligne `analyse` enregistrée quand même (même limite que l'analyse : ~30 s après la fin de la réponse) |
| 8 | Coût d'une ligne recalculé à la main avec la grille | identique au micro-dollar près |
| 9 | Comparer le total du jour à la page Usage de la console Anthropic (même clé, le lendemain) | écart inférieur à quelques pour cent, ou expliqué (appels hors application, interrompus) |
| 10 | Supprimer le tarif de Sonnet 5.5, faire une relance, rajouter le tarif | ligne d'abord « tarif manquant », puis chiffrée ; les autres lignes inchangées |
| 11 | Écran `/admin/couts` : filtres, clic sur un cumul, « Afficher plus », rechargement | conforme ; fiche projet : section « Coût de l'IA » juste |
| 12 | Session expirée, puis `/api/admin/couts` | 401 ; aucun coût visible côté répondant ni dans le MCP |
| 13 | Console et réseau | aucune erreur ; aucun message « Suivi des coûts de l'IA » dans les journaux en fonctionnement normal |

Retirer les `console.log` temporaires avant de continuer (`git diff` vide sur `server/ia`).

---

### Task 10 : Documentation

- [ ] `CLAUDE.md` : arborescence (`server/ia/suivi.ts`, `server/services/{tarifs,couts}.ts`, routes `admin/couts`), navigation (`/admin/couts`), une section « Suivi des coûts » (point de passage unique sur `fetch`, une ligne par requête HTTP, coût figé en micro-dollars, grille éditable, jamais bloquant, admin seulement), migration 0005 à appliquer en production et sur la preview ; règle pour la suite : **tout nouvel appel à l'API passe un `suivi`** (`suivre(contexte, origine)`), et une nouvelle origine s'ajoute à `ORIGINES`, à `LIBELLES_ORIGINE` et au `CHECK` de la table par une migration.
- [ ] Spec : section 3 (tables `appels_ia`, `tarifs_ia`, `parametres`), section 10 (lot 6 livré, décisions 1 à 11).
- [ ] `docs/mcp.md` : une phrase — les coûts ne sont pas exposés au MCP (décision 9).

```bash
git add CLAUDE.md docs
git commit -m "docs: suivi des coûts de l'IA"
```

---

## Auto-relecture

- **Couverture de la demande** (« stocké quelque part, cumulatif et un peu détaillé, visible que en admin ») : stockage → Tasks 1, 3, 4, 5 ; cumul (global, mois, projet, type, modèle) → Task 6 ; détail par appel et filtres → Tasks 6, 8 ; admin seulement → Task 7 (401, rien en public ni au MCP), décision 9 ; coût d'un projet → Tasks 6, 8.
- **Recensement** : les dix endroits du tableau sont traités (1 à 8 branchés en Task 5, 9 et 10 exclus par la décision 3) ; les essais automatiques sont comptés un par un parce qu'ils passent par `fetch` (Step 6 de la Task 5).
- **Cohérence des noms** : `Origine`, `ORIGINES`, `StatutAppel`, `Jetons`, `AppelIa`, `Cumul`, `ResumeCouts`, `FiltreCouts`, `Tarif`, `economieCache` (Task 1) ; `trouverTarif`, `calculerCout`, `ContexteTarif`, `listerTarifs`, `enregistrerTarif`, `supprimerTarif`, `lireTauxEur`, `enregistrerTauxEur` (Task 2) ; `enregistrerAppel`, `SaisieAppel`, `recalculerSansTarif` (Task 3) ; `ContexteSuivi`, `Suivi`, `suivre`, `fetchSuivi`, `lireFlux` (Task 4) ; `resumerCouts`, `listerAppels`, `coutProjet` (Task 6).
- **Risques** : ralentir ou casser un appel utile (réponse renvoyée avant toute lecture, copie lue en arrière-plan, erreurs avalées, tests 2, 9 et 10 de la Task 4 et test de panne côté répondant) ; écriture perdue si Cloudflare arrête la tâche (`waitUntil`, même limite que les analyses, connue) ; facturation exacte des flux interrompus non documentée (décision 7, contrôle 9 de la Task 9) ; tarifs qui changent (grille éditable, date du relevé affichée) ; nouvelle origine oubliée (règle ajoutée à `CLAUDE.md`, et le `CHECK` de la table refuse une origine inconnue : l'erreur apparaît dans les journaux sans toucher à l'appel).
