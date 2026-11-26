# Lot 5 — IA de cadrage et de génération dans l'admin : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** faire dans l'admin web, avec l'API Anthropic et les modèles du projet, ce qui ne se fait aujourd'hui que dans Claude via le MCP : être interrogé par l'IA pour cadrer un projet, obtenir la note de cadrage et le résumé de contexte, puis faire proposer les publics à interroger et générer leurs questionnaires.

**Architecture :** les guides de méthode existants (`server/guides.ts`, étapes `cadrage` et `questionnaire`) restent la seule source de la méthode : ils servent de consigne système, sans leur section « Avec les outils », exactement comme pour les analyses. Le mécanisme de flux du lot 4 (en-tête immédiat, signaux de vie, lignes de contrôle, `text/event-stream`, `waitUntil`) est extrait dans un module commun et réutilisé pour toute réponse de l'IA qui peut dépasser quelques secondes. Le contexte du projet (description, logiciels, documents) est placé dans un bloc système mis en cache, pour que les tours successifs du dialogue ne repaient pas les documents.

**Tech stack :** Cloudflare Pages Functions, D1, `@anthropic-ai/sdk` (`messages.stream`, sorties structurées `zodOutputFormat`, cache de prompt), Zod 4, React 18, Vitest + Miniflare.

**Spec :** `docs/superpowers/specs/2026-11-25-interview-utilisateurs-design.md`, section 4 (points 5 et 6), section 3 (table `cadrage_messages`), section 10 (lot 5).

**Hors de ce lot :** génération automatique d'invitations, envoi de mails, modification de questionnaires publiés.

---

## Décisions de ce plan (à valider par Guillaume)

1. **Rien n'est écrasé sans relecture.** La note de cadrage et le résumé de contexte produits par l'IA remplissent les zones de saisie de la fiche projet ; ils ne sont enregistrés que lorsque vous cliquez « Enregistrer », comme une saisie manuelle.
2. **Questionnaire généré = brouillon.** Il est créé directement en brouillon et s'ouvre dans l'éditeur existant pour relecture ; rien n'est publié.
3. **Le dialogue de cadrage est conservé.** On peut le quitter et le reprendre ; « Recommencer » efface le dialogue (pas la note).
4. **Plafond de questions appliqué par le serveur** selon le type de demande : 3 (évolution simple), 6 (amélioration), 12 (nouvelle fonctionnalité). L'IA peut s'arrêter avant ; « Terminer le cadrage » coupe à tout moment.
5. **Le cadrage voit les documents complets.** C'est un travail interne : l'IA reçoit la description, les fiches des logiciels et le texte des documents, jusqu'à 300 000 caractères au total ; au-delà, chaque document est tronqué avec une mention, et l'IA est invitée à le signaler. Ce contexte est mis en cache entre deux tours pour limiter le coût.
6. **Modèle utilisé :** le modèle de cadrage du projet, pour le dialogue, la note, le résumé et la génération des questionnaires.

---

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `server/ia/flux.ts` | créer — réponse en flux commune (extraite de `server/ia/analyse.ts`) |
| `shared/flux.ts` | créer — contrat du flux commun (déplacé depuis `shared/analyses.ts`) |
| `src/admin/flux.ts` | créer — lecture du flux commune (extraite de `src/admin/fluxAnalyse.ts`) |
| `server/services/cadrage.ts` | créer — messages du dialogue, contexte du projet pour l'IA, plafond |
| `server/ia/cadrage.ts` | créer — tour de dialogue, note de cadrage, résumé de contexte |
| `server/ia/questionnaires.ts` | créer — proposition de publics, génération d'un questionnaire |
| `functions/api/admin/projets/[id]/cadrage/*.ts`, `functions/api/admin/projets/[id]/questionnaires/{publics,generer}.ts` | créer — routes |
| `src/admin/CadrageIa.tsx`, `src/admin/GenerationQuestionnaire.tsx` | créer — écrans |
| `src/admin/ProjetCadrage.tsx`, `src/admin/ProjetQuestionnaires.tsx`, `src/admin/api.ts` | modifier |
| `tests/…` | créer ou adapter |

Aucune migration : la table `cadrage_messages` existe depuis la migration 0001.

---

### Task 0 : Branche

- [ ] **Step 1**

```bash
git checkout main
git pull --ff-only
git status --short          # doit être vide (server/schemas.ts peut apparaître pour des fins de ligne : vérifier `git diff --ignore-cr-at-eol` vide, puis `git checkout -- server/schemas.ts`)
git checkout -b lot5-ia-admin
npm test                    # 429 tests verts attendus
```

---

### Task 1 : Flux commun

**But :** que le cadrage et la génération de questionnaires profitent du même flux robuste que les analyses, sans dupliquer le code.

- [ ] **Step 1 — serveur.** Extraire de `server/ia/analyse.ts` dans `server/ia/flux.ts` tout ce qui ne dépend pas des analyses : en-tête avec séparateur aléatoire, signal de vie toutes les 15 s, lignes de contrôle, ligne finale de succès (avec une charge utile JSON libre, par exemple `{ analyse_id }` ou `{ questionnaire_id }`) ou d'erreur, `TransformStream`, `waitUntil`, en-têtes HTTP (`text/event-stream; charset=utf-8`, `no-store, no-transform`, `nosniff`). Le module expose une fonction du type `repondreEnFlux(contexte, { entete, produire })` où `produire` reçoit une fonction d'écriture de texte et renvoie la charge utile de succès ou lève une erreur affichable.
- [ ] **Step 2 — contrat.** Déplacer le contrat du flux de `shared/analyses.ts` vers `shared/flux.ts` (réexporté depuis `shared/analyses.ts` pour ne rien casser), avec une ligne de succès dont la charge utile est typée par l'appelant.
- [ ] **Step 3 — client.** Extraire de `src/admin/fluxAnalyse.ts` un lecteur générique `src/admin/flux.ts` (texte, signaux de vie, charge utile de succès typée, erreur) ; `fluxAnalyse.ts` devient une fine enveloppe.
- [ ] **Step 4 — vérifier.** Tous les tests existants des analyses passent sans affaiblissement ; les tests du flux sont déplacés vers le module commun et complétés d'un cas avec une charge utile de succès différente. `npm test`, `npx tsc -b`, `npm run build`.
- [ ] **Step 5 — commit** : « refactor: flux de réponse de l'IA commun aux analyses et au cadrage ».

---

### Task 2 : Service du cadrage

**Files :** Create `server/services/cadrage.ts`, `tests/server/cadrage.test.ts`

**Comportement.**
- `listerMessages(db, projetId)` : messages du dialogue dans l'ordre (`role` `ia` ou `admin`, `contenu`, `cree_le`).
- `ajouterMessage(db, projetId, role, contenu)` : contenu visible, 4 000 caractères au plus pour l'admin, 2 000 pour l'IA ; 404 si le projet est inconnu.
- `effacerDialogue(db, projetId)`.
- `plafondQuestions(typeDemande)` : 3, 6 ou 12 (décision 4) ; `questionsPosees(messages)` : nombre de messages `ia` qui sont des questions.
- `contexteCadrage(db, projetId)` : texte Markdown pour l'IA — titre, type de demande, description, logiciels avec leur fiche de contexte, note de cadrage existante si elle n'est pas vide, puis les documents avec leur nom et leur texte complet ; si le total dépasse 300 000 caractères (décision 5), chaque document est tronqué proportionnellement et suivi de « *(document tronqué : N caractères sur M)* ». Jamais de données de répondant.

- [ ] Tests pour chaque règle (ordre, longueurs, plafonds par type, contexte complet, troncature proportionnelle avec mention, absence de toute donnée de répondant même si le projet a des entretiens). TDD, puis commit « feat: service du dialogue de cadrage ».

---

### Task 3 : IA de cadrage

**Files :** Create `server/ia/cadrage.ts`, `functions/api/admin/projets/[id]/cadrage/index.ts` (`GET`, `DELETE`), `…/cadrage/tour.ts` (`POST`), `…/cadrage/note.ts` (`POST`), `…/cadrage/resume.ts` (`POST`), tests.

**Comportement.**
- **Consigne système :** le guide `cadrage` sans « ## Avec les outils » (même découpe que `consigneAnalyse`), suivie d'une courte section propre au dialogue dans l'admin : on pose une seule question à la fois ; quand on a assez d'éléments, on l'annonce et on s'arrête ; on n'écrit pas la note pendant le dialogue.
- **Bloc de contexte :** `contexteCadrage` dans un second bloc système marqué `cache_control: { type: 'ephemeral' }` ; vérifier dans le SDK installé la forme exacte du cache de prompt et le minimum de longueur cachable.
- **`POST …/cadrage/tour`** avec `{ texte? }` : enregistre le message de l'admin s'il y en a un (le premier tour n'en a pas), puis demande à l'IA la suite en **sortie structurée** `{ fin: boolean, message: string }` : `message` est la question suivante, ou, si `fin`, une phrase qui dit que le cadrage peut être conclu. Si le plafond de questions est atteint, le serveur n'appelle pas l'IA pour une nouvelle question et renvoie `fin` avec un message fixe. Le message de l'IA est enregistré. Réponse en flux commun (Task 1) avec en charge utile de succès `{ fin, message }` ; aucun texte au fil de l'eau. Effort `medium`.
- **`POST …/cadrage/note`** : demande à l'IA la note de cadrage au format décrit par le guide (titres Objectif, Publics à interroger, Existant, Contraintes, Hors périmètre, Hypothèses à vérifier, Points encore ouverts), à partir du contexte et du dialogue. Texte au fil de l'eau dans le flux commun ; **rien n'est enregistré** (décision 1) ; charge utile de succès `{ tronquee }`. Effort `high`.
- **`POST …/cadrage/resume`** : résumé de contexte d'une vingtaine de lignes à partir des documents et de la description, pour servir à chaque entretien ; même fonctionnement, rien n'est enregistré. Effort `medium`.
- **`GET`** : messages, plafond, questions posées. **`DELETE`** : efface le dialogue.
- Erreurs : 503 sans clé API (message invitant à passer par Claude et le MCP) ; refus du modèle ou réponse vide → ligne d'erreur ; aucun nouvel essai une fois le flux commencé.
- Tests (sans appel réseau, `fetch` simulé au format SSE de l'API Messages) : consigne sans les outils ; contexte en bloc mis en cache ; plafond respecté sans appel à l'IA ; messages enregistrés dans l'ordre ; note et résumé non enregistrés ; 503 sans clé ; refus.
- Commit : « feat: dialogue de cadrage, note et résumé de contexte par l'API ».

---

### Task 4 : IA de génération des questionnaires

**Files :** Create `server/ia/questionnaires.ts`, `functions/api/admin/projets/[id]/questionnaires/publics.ts`, `…/questionnaires/generer.ts`, tests.

**Comportement.**
- **Consigne système :** le guide `questionnaire` sans « ## Avec les outils » ; contexte du projet en bloc mis en cache, **note de cadrage obligatoire** (400 « Rédigez d'abord la note de cadrage. » si elle est vide).
- **`POST …/questionnaires/publics`** : l'IA propose les publics à interroger, en sortie structurée `{ publics: { public_vise, mode, justification }[] }` (1 à 6), en tenant compte des questionnaires déjà existants du projet (pour ne pas en reproposer). Flux commun, charge utile `{ publics }`. Rien n'est enregistré.
- **`POST …/questionnaires/generer`** avec `{ public_vise, mode, consignes? }` : l'IA rédige le questionnaire en sortie structurée `{ introduction, duree_estimee_min, contenu }` où `contenu` suit le format du mode (questions avec type, libellé, options, objectif ; ou question d'ouverture et thèmes). Le serveur valide avec `validerContenu` ; si la validation échoue, **un** second essai renvoie à l'IA le message d'erreur exact ; si elle échoue encore, ligne d'erreur. Sinon le questionnaire est créé en brouillon (`enregistrerQuestionnaire`) et la charge utile de succès est `{ questionnaire_id }` (décision 2). Effort `high`.
- Le schéma Zod de la sortie structurée reprend les limites de `LIMITES` (longueurs) et les bornes du guide (40 questions, 12 thèmes, 2 à 10 options) ; vérifier ce que les sorties structurées acceptent comme contraintes de schéma dans le SDK installé et garder la validation serveur comme garde-fou.
- Tests : note vide (400) ; publics déjà couverts transmis à l'IA ; contenu valide → brouillon créé ; contenu invalide puis corrigé au second essai → brouillon ; deux échecs → erreur, aucun brouillon ; 503 sans clé.
- Commit : « feat: proposition de publics et génération de questionnaires par l'API ».

---

### Conventions des écrans (Task 5)

Celles du lot 2B (composants de `src/admin/commun.tsx`, `champs.tsx`, `libelles.ts`, erreurs en `role="alert"`, garde des saisies). Un appel en flux affiche son état (« L'IA réfléchit… », chronomètre) et prévient de garder la page ouverte. Le modèle utilisé est rappelé près du bouton qui lance l'appel.

### Task 5 : Écrans

**Files :** Create `src/admin/CadrageIa.tsx`, `src/admin/GenerationQuestionnaire.tsx` ; Modify `src/admin/ProjetCadrage.tsx`, `src/admin/ProjetQuestionnaires.tsx`, `src/admin/api.ts`, `src/admin/ProjetDocuments.tsx` si besoin.

- [ ] **Cadrage avec l'IA** (dans la section « Note de cadrage » de la fiche projet, au-dessus de la zone de note) :
  - bouton « Être interrogé par l'IA » qui ouvre le dialogue ; s'il existe déjà, il est affiché tel quel ;
  - fil des échanges (questions de l'IA, réponses de l'admin), zone de réponse, « Envoyer » ; compteur « question n sur le plafond » ;
  - quand l'IA a fini, ou sur « Terminer le cadrage » : bouton « Rédiger la note de cadrage » qui remplit la zone de note au fil de l'eau ; la zone passe en « modifiée, non enregistrée » et l'admin enregistre lui-même ; si la zone contenait déjà une note, confirmation avant de la remplacer ;
  - « Générer le résumé de contexte » près du champ correspondant, même principe ;
  - « Recommencer le dialogue » avec confirmation.
- [ ] **Génération de questionnaires** (section Questionnaires) :
  - « Proposer des publics » : liste des propositions (public, mode, justification), chacune avec « Générer ce questionnaire » ; une saisie libre permet aussi de demander un public et un mode précis, avec des consignes facultatives ;
  - pendant la génération, état et chronomètre ; à la fin, ouverture de l'éditeur sur le brouillon créé.
- [ ] Tests de la logique pure si un module en contient (par exemple l'état du dialogue). `npm run build && npm test`, commit « feat: cadrage et génération de questionnaires dans l'admin ».

---

### Task 6 : Vérification

Avec la vraie clé API et les modèles par défaut (quelques appels), sur un nouveau projet « Nouvelle fonctionnalité » avec un document joint :

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Être interrogé par l'IA | une question à la fois, en lien avec la description et le document |
| 2 | Répondre à trois questions | questions qui ne redemandent pas ce qui est déjà dit ; compteur juste |
| 3 | Terminer, rédiger la note | note structurée selon le guide, dans la zone, non enregistrée tant qu'on n'a pas cliqué |
| 4 | Recharger la page | dialogue conservé ; la note non enregistrée a disparu (comportement voulu) |
| 5 | Générer le résumé de contexte | une vingtaine de lignes, dans la zone |
| 6 | Proposer des publics | 1 à 6 propositions justifiées |
| 7 | Générer un questionnaire hybride et un entretien | brouillons valides, éditeur ouvert, objectifs remplis |
| 8 | Projet « Évolution simple » : plafond de 3 | pas de 4e question, sans appel à l'IA |
| 9 | Second tour du dialogue | `usage.cache_read_input_tokens` non nul dans les journaux (cache de prompt effectif) |
| 10 | Console et réseau | aucune erreur ; en-tête et signaux de vie reçus pendant la réflexion |

### Task 7 : Documentation

`CLAUDE.md` (cadrage et génération dans l'admin, flux commun), `docs/mcp.md` (rappel : les deux voies coexistent et partagent les guides), spec (section 4 points 5 et 6, section 10 : lot 5 livré, décisions 1 à 6). Commit « docs: IA de cadrage et de génération dans l'admin ».

---

## Auto-relecture

- **Couverture de la spec :** dialogue question par question avec profondeur selon le type et arrêt anticipé → Tasks 2, 3, 5 ; note de cadrage modifiable à la main → Tasks 3, 5 (décision 1) ; génération des questionnaires (publics proposés, mode, questions ou guide) puis édition manuelle → Tasks 4, 5 (décision 2) ; modèles du projet → Tasks 3, 4 (décision 6).
- **Réutilisation :** guides inchangés et partagés avec le MCP ; flux commun extrait du lot 4 ; validation des questionnaires par `validerContenu`.
- **Risques :** coût du contexte répété à chaque tour (cache de prompt, décision 5) ; sortie structurée hors des règles de validation (second essai avec l'erreur, puis échec propre) ; durée des appels (flux commun avec signaux de vie).
