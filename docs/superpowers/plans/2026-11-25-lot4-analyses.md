# Lot 4 — Analyses et exports : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** transformer les entretiens recueillis en livrables : fiche par répondant, synthèse transversale, expression de besoin ; les produire soit dans Claude via le MCP (sans tokens API), soit dans l'admin web (API Anthropic, avec le modèle d'analyse du projet) ; les conserver et les relire ; exporter les réponses brutes en CSV et en Markdown.

**Architecture :** un service `corpus` met les entretiens en texte compact, pseudonymisé et découpable ; il sert à la fois aux outils MCP, à l'analyse par l'API et à l'export Markdown. Un service `analyses` enregistre et relit les livrables. Les guides de méthode existants (`server/guides.ts`) gagnent trois étapes d'analyse, utilisées telles quelles par Claude (outil `lire_guide`) et comme consigne système de l'analyse par l'API. L'analyse par l'API est diffusée en continu vers le navigateur et enregistrée à la fin, même si l'onglet est fermé entre-temps.

**Tech stack :** Cloudflare Pages Functions, D1, `@anthropic-ai/sdk` (`messages.stream`), Zod 4, React 18, Vitest + Miniflare.

**Spec :** `docs/superpowers/specs/2026-11-25-interview-utilisateurs-design.md`, sections 3 (table `analyses`), 4 (point 8), 6 (outils MCP) et 10 (lot 4).

**Hors de ce lot :** IA de cadrage et de génération de questionnaires dans l'admin (lot 5) ; envoi des analyses par mail ; graphiques.

---

## Décisions de ce plan (à valider par Guillaume)

1. **Pseudonymisation pour l'IA.** Les entretiens envoyés à une IA (Claude via le MCP, ou l'API) désignent chaque personne par « Répondant 3 — Comptable, CUMA du Val » : jamais de nom, prénom ni mail. L'admin, lui, voit les vrais noms, et les exports aussi. Une fiche par répondant est rattachée à ce répondant dans la base : l'admin la lit sous son vrai nom.
2. **Entretiens pris en compte.** Par défaut, les entretiens terminés seulement. Une case « inclure les entretiens en cours » permet d'y ajouter les commencés (marqués « entretien inachevé »).
3. **Ce que l'IA d'analyse reçoit en plus des entretiens.** Contrairement à l'entretien, l'analyse est un travail interne : elle reçoit la note de cadrage (objectif, hypothèses à vérifier…), le résumé de contexte, les logiciels et, pour chaque question, son objectif. Elle ne reçoit pas le texte des documents joints.
4. **Taille maximale d'une analyse par l'API.** 400 000 caractères d'entretiens (environ 100 000 mots). Au-delà, l'admin est invité à analyser questionnaire par questionnaire, ou à passer par Claude (MCP), qui lit les entretiens par morceaux.
5. **Exports.** CSV pour un tableur (séparateur point-virgule, UTF-8 avec BOM : Excel en français l'ouvre directement), une ligne par question posée. Markdown lisible, un entretien par section, avec les vrais noms. Par questionnaire et par projet entier.
6. **Historique.** Chaque analyse est conservée avec sa date, sa source (`mcp` ou le modèle utilisé) et le nombre d'entretiens couverts. Rien n'est écrasé ; l'admin peut supprimer une analyse.

---

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `shared/analyses.ts` | créer — types et constantes des analyses |
| `server/services/corpus.ts` | créer — entretiens en texte compact et pseudonymisé, par projet, questionnaire ou répondant, découpable |
| `server/services/analyses.ts` | créer — enregistrer, lister, lire, supprimer |
| `server/services/exports.ts` | créer — CSV et Markdown |
| `server/guides.ts` | modifier — étapes `fiche_repondant`, `synthese`, `expression_besoin` |
| `server/ia/analyse.ts` | créer — génération d'une analyse par l'API, en flux |
| `server/mcp/outils.ts` | modifier — six outils d'analyse |
| `functions/api/admin/projets/[id]/analyses.ts`, `functions/api/admin/analyses/[id].ts`, `functions/api/admin/projets/[id]/export.ts`, `functions/api/admin/questionnaires/[id]/export.ts` | créer |
| `src/admin/ProjetAnalyses.tsx`, `src/admin/AnalyseScreen.tsx`, `src/admin/GenerationAnalyse.tsx`, `src/admin/BoutonsExport.tsx` | créer |
| `src/admin/api.ts`, `src/admin/ProjetScreen.tsx`, `src/admin/QuestionnaireRepondants.tsx`, `src/admin/EntretienScreen.tsx`, `src/main.tsx` | modifier |
| `tests/…` | créer |

Aucune migration : la table `analyses` existe depuis la migration 0001.

---

### Task 0 : Branche

- [ ] **Step 1**

```bash
git checkout lot3-parcours-repondant
git status --short            # doit être vide
git checkout -b lot4-analyses
npm test                      # 314 tests verts attendus
```

---

### Task 1 : Types partagés

**Files :** Create `shared/analyses.ts`

- [ ] **Step 1 : créer `shared/analyses.ts`**

```ts
export const TYPES_ANALYSE = ['fiche_repondant', 'synthese', 'expression_besoin'] as const
export type TypeAnalyse = (typeof TYPES_ANALYSE)[number]

export const LIMITES_ANALYSE = {
  /** Texte d'une analyse enregistrée. */
  contenu: 200_000,
  /** Entretiens envoyés en une fois à l'API (décision 4). */
  corpus_api: 400_000,
  /** Morceau de corpus renvoyé par un appel d'outil MCP. */
  morceau_mcp: 20_000,
} as const

export interface Analyse {
  id: string
  projet_id: string
  questionnaire_id: string | null
  repondant_id: string | null
  type: TypeAnalyse
  contenu: string
  /** `mcp`, ou l'identifiant du modèle API utilisé. */
  source: string
  nb_entretiens: number
  cree_le: string
}

/** Pour les listes : sans le contenu, avec un libellé de portée lisible. */
export interface AnalyseResume extends Omit<Analyse, 'contenu'> {
  portee: string
  taille: number
}

export interface PorteeAnalyse {
  projet_id: string
  questionnaire_id?: string
  repondant_id?: string
  /** Décision 2 : par défaut, entretiens terminés seulement. */
  inclure_en_cours?: boolean
}
```

- [ ] **Step 2 : vérifier et commit**

Run : `npx tsc -b`

```bash
git add shared/analyses.ts
git commit -m "feat: types des analyses"
```

---

### Task 2 : Corpus des entretiens

**Files :** Create `server/services/corpus.ts`, `tests/server/corpus.test.ts`

**Comportement.**
- `construireCorpus(db, portee)` renvoie `{ texte, nb_entretiens, repondants: { id, pseudonyme }[] }`.
  - Portée : un répondant (`repondant_id`, quel que soit son statut), un questionnaire, ou tout un projet (tous ses questionnaires).
  - Hors portée répondant : entretiens `termine` seulement, plus les `commence` si `inclure_en_cours` (décision 2). Jamais les `invite`.
  - Vérifie que le questionnaire ou le répondant appartient bien au projet (404 sinon).
- **Pseudonymes stables** : « Répondant n », numérotés dans l'ordre de `commence_le` puis `id` sur l'ensemble du projet (le numéro d'une personne ne change pas selon la portée demandée).
- **Format du texte** (Markdown), pour chaque entretien :

```
## Répondant 3 — Comptable, CUMA du Val
Questionnaire : Comptables (hybride) · terminé le 25/11/2026

**Q1. À quelle fréquence saisissez-vous les temps ?**
Objectif : mesurer la charge
→ Chaque semaine — commentaire : surtout en fin de mois

**Relance.** Pouvez-vous donner un exemple ?
→ Le vendredi soir, avec mon carnet.
```

  - Le poste et l'entreprise sont omis s'ils sont vides (« Répondant 3 — CUMA du Val »).
  - Un entretien inachevé porte la mention « entretien inachevé ».
  - En mode entretien, les questions sont numérotées dans l'ordre et sans objectif (il n'y en a pas par question).
  - Une question posée sans réponse est omise.
  - Les réponses sont rendues par `reponseEnTexte` (`shared/repondants.ts`).
- **Jamais dans le corpus** : nom, prénom, mail, jeton, identifiants internes.
- **Le numéro du répondant est un pseudonyme** : la correspondance `pseudonyme → repondant_id` est renvoyée à part (`repondants`), pour que l'enregistrement d'une fiche se rattache au bon répondant sans exposer son identité.
- `decouper(texte, debut, longueur)` renvoie `{ texte, debut, taille, suite }`, en caractères Unicode entiers (comme `lire_document`), avec `suite = null` à la fin. Le découpage se fait de préférence au début d'une ligne `## ` qui précède la limite, pour ne pas couper un entretien en deux quand c'est possible.
- `enteteAnalyse(db, projet_id)` renvoie le contexte du projet pour l'analyse (décision 3) : titre, type de demande, logiciels, note de cadrage, résumé de contexte, et pour chaque questionnaire son public, son mode et ses questions ou thèmes avec leur objectif. Pas le texte des documents.

- [ ] **Step 1 : écrire `tests/server/corpus.test.ts`**. Cas à couvrir, avec une base de test peuplée par les services existants (projet, deux questionnaires dont un en mode entretien, répondants créés par `creerRepondantGenerique`/`creerInvitation`, tours insérés directement) :
  - un corpus de projet contient les deux questionnaires, les répondants terminés seulement, dans l'ordre des pseudonymes, et `nb_entretiens` juste ;
  - `inclure_en_cours` ajoute le commencé, marqué « entretien inachevé » ; un invité n'apparaît jamais ;
  - ni nom, ni prénom, ni mail, ni jeton, ni identifiant interne n'apparaît dans `texte` (vérifier avec les valeurs exactes des fixtures) ;
  - le pseudonyme d'une personne est le même dans le corpus du projet et dans celui de son questionnaire ;
  - les objectifs des questions hybrides apparaissent ; une relance est marquée « Relance. » ; une question sans réponse est omise ;
  - un `questionnaire_id` d'un autre projet donne 404 ;
  - `decouper` : morceaux qui se recollent exactement, coupure sur un `## ` quand il y en a un, `suite` nul à la fin, emoji jamais coupé ;
  - `enteteAnalyse` contient la note de cadrage et les objectifs, pas le contenu d'un document joint.

- [ ] **Step 2 : vérifier l'échec, implémenter, vérifier le succès** (`npm test && npx tsc -b`).

- [ ] **Step 3 : commit**

```bash
git add server/services/corpus.ts tests/server/corpus.test.ts
git commit -m "feat: corpus des entretiens, pseudonymisé et découpable"
```

---

### Task 3 : Service des analyses

**Files :** Create `server/services/analyses.ts`, `tests/server/analyses.test.ts`

**Comportement.**
- `enregistrerAnalyse(db, saisie)` : `{ projet_id, type, contenu, source, questionnaire_id?, repondant_id?, nb_entretiens }` ; contenu visible et de `LIMITES_ANALYSE.contenu` caractères au plus ; `fiche_repondant` exige un `repondant_id`, les deux autres types l'interdisent ; questionnaire et répondant doivent appartenir au projet (404 sinon) ; source non vide, 100 caractères au plus. Renvoie l'`Analyse`.
- `listerAnalyses(db, filtre)` : par projet (obligatoire), avec filtres facultatifs `questionnaire_id`, `repondant_id`, `type` ; plus récentes d'abord ; renvoie des `AnalyseResume` dont `portee` vaut « Projet entier », « Questionnaire : <public visé> » ou « Répondant : <prénom nom> » (l'admin voit les vrais noms) et `taille` le nombre de caractères.
- `lireAnalyse(db, id)` (404 si inconnue), `supprimerAnalyse(db, id)` (404 si inconnue).

- [ ] **Step 1 : tests** couvrant chacune de ces règles, dont : une fiche sans répondant (400), une synthèse avec répondant (400), un répondant d'un autre projet (404), un contenu fait d'espaces (400), l'ordre de la liste, les trois libellés de portée, la suppression.
- [ ] **Step 2 : vérifier l'échec, implémenter, vérifier le succès.**
- [ ] **Step 3 : commit**

```bash
git add server/services/analyses.ts tests/server/analyses.test.ts
git commit -m "feat: enregistrement et lecture des analyses"
```

---

### Task 4 : Guides d'analyse

**Files :** Modify `server/guides.ts`, `tests/server/guides.test.ts`

- [ ] **Step 1 : étendre `ETAPES_GUIDE`** à `['cadrage', 'questionnaire', 'fiche_repondant', 'synthese', 'expression_besoin']` et adapter le test existant (cinq guides de plus de 800 caractères ; chaque guide d'analyse cite `lire_reponses` ou `lire_entretien` et `enregistrer_analyse`).

- [ ] **Step 2 : écrire les trois guides.** Ils sont lus par Claude via le MCP et servent aussi de consigne système à l'analyse par l'API (Task 6) : chacun commence par la méthode, puis une courte section « Avec les outils » qui ne concerne que Claude. Écrits comme les guides existants : instructions directes en français qui expliquent le pourquoi, sans exemple de contenu recopiable. Contenu attendu :

  Règles communes aux trois (à écrire dans chacun) :
  - partir des réponses, pas de la note de cadrage : la note dit ce que l'équipe veut savoir et ce qu'elle suppose ; l'analyse dit ce que les utilisateurs ont réellement dit ;
  - distinguer ce qui est dit par plusieurs personnes de ce qui ne l'est que par une ; donner les effectifs (« 4 répondants sur 6 ») plutôt que des adjectifs ;
  - citer des verbatims courts, entre guillemets, avec le pseudonyme ; ne jamais inventer ni reformuler une citation ;
  - signaler ce que les entretiens ne permettent pas de conclure (trop peu de réponses, public absent, question mal comprise) ;
  - désigner les personnes par leur pseudonyme ; ne pas chercher à les identifier ;
  - écrire en Markdown, en français, avec des titres `##`.

  `fiche_repondant` — résumé d'un entretien pour quelqu'un qui ne le lira pas en entier : profil (poste, entreprise), pratique actuelle, difficultés avec exemples, attentes, objections ou réticences, citations marquantes, points à creuser avec cette personne. Une page au plus.

  `synthese` — synthèse transversale d'un questionnaire ou d'un projet : qui a répondu (effectifs par public et par statut) ; constats principaux classés par fréquence ; différences entre publics (par exemple comptables et animateurs terrain) ; irritants classés par gravité et fréquence ; attentes ; confrontation avec les hypothèses à vérifier de la note de cadrage (confirmée, infirmée, non tranchée, avec les éléments) ; questions restées ouvertes et suites possibles (entretiens complémentaires, publics manquants).

  `expression_besoin` — livrable prêt à transmettre, point de départ d'une spécification ou d'un ticket d'évolution : contexte et objectif ; utilisateurs concernés ; situation actuelle ; besoins reformulés, chacun avec sa justification tirée des entretiens et sa priorité (indispensable, important, souhaitable) ; règles de gestion identifiées ; cas d'usage principaux ; hors périmètre ; questions ouvertes à trancher par l'équipe. Pas de solution technique : décrire le besoin, pas l'écran.

  Section « Avec les outils » : quel outil lire (`lire_entretien` pour une fiche, `lire_reponses` en suivant `suite` jusqu'au bout pour les deux autres, `lire_projet` pour la note de cadrage et les objectifs), montrer l'analyse au porteur du projet, puis l'enregistrer avec `enregistrer_analyse` (type, portée, contenu) ; ne pas l'enregistrer sans son accord.

- [ ] **Step 3 : vérifier et commit**

Run : `npm test && npx tsc -b`

```bash
git add server/guides.ts tests/server/guides.test.ts
git commit -m "feat: guides de fiche, de synthèse et d'expression de besoin"
```

---

### Task 5 : Outils MCP d'analyse

**Files :** Modify `server/mcp/outils.ts`, `tests/server/outils-mcp.test.ts`, `tests/functions/mcp.test.ts`, `scripts/verifier-mcp.mjs`

Six outils, enveloppes fines autour des services :

| Outil | Arguments | Renvoie | Lecture seule |
|---|---|---|---|
| `lister_repondants` | `questionnaire_id` | pour chacun : `repondant_id`, pseudonyme, poste, entreprise, statut, nombre de réponses, dates — **sans** nom, prénom, mail ni jeton | oui |
| `lire_entretien` | `repondant_id` | le corpus de ce seul répondant (Task 2) et son `projet_id` | oui |
| `lire_reponses` | `projet_id`, `questionnaire_id?`, `inclure_en_cours?`, `debut?` (0), `longueur?` (20 000 max) | `{ nb_entretiens, taille, debut, texte, suite, repondants: { pseudonyme, repondant_id }[] }` | oui |
| `enregistrer_analyse` | `projet_id`, `type`, `contenu`, `questionnaire_id?`, `repondant_id?`, `nb_entretiens` | l'analyse (sans contenu), avec la source `mcp` | non |
| `lister_analyses` | `projet_id`, filtres facultatifs | `AnalyseResume[]`, la portée « Répondant » affichée par pseudonyme et non par nom | oui |
| `lire_analyse` | `analyse_id` | l'analyse complète, découpée comme `lire_document` si elle dépasse 20 000 caractères | oui |

Les descriptions disent quand utiliser chaque outil, rappellent de lire le guide correspondant avant d'analyser, et pour `enregistrer_analyse` de ne l'appeler qu'avec l'accord du porteur du projet.

- [ ] **Step 1 : tests.** Dans `outils-mcp.test.ts` : le catalogue passe à 19 outils et la liste des outils en lecture seule s'allonge ; un parcours « lister → lire_reponses en suivant `suite` → enregistrer_analyse → lister_analyses → lire_analyse » ; **aucun résultat d'outil d'analyse ne contient le nom, le prénom, le mail ou le jeton d'un répondant** (vérifier sur les valeurs exactes) ; erreurs lisibles (répondant inconnu, fiche sans répondant). Dans `tests/functions/mcp.test.ts` et `scripts/verifier-mcp.mjs` : 19 outils.
- [ ] **Step 2 : vérifier l'échec, implémenter, vérifier le succès.**
- [ ] **Step 3 : commit**

```bash
git add server/mcp/outils.ts tests/server/outils-mcp.test.ts tests/functions/mcp.test.ts scripts/verifier-mcp.mjs
git commit -m "feat: outils MCP de lecture des réponses et d'analyse"
```

---

### Task 6 : Analyse par l'API, en flux

**Files :** Create `server/ia/analyse.ts`, `functions/api/admin/projets/[id]/analyses.ts`, `functions/api/admin/analyses/[id].ts`, `tests/server/ia-analyse.test.ts`, `tests/functions/api-analyses.test.ts` ; Modify `server/schemas.ts`

**Comportement.**
- `POST /api/admin/projets/:id/analyses` avec `{ type, questionnaire_id?, repondant_id?, inclure_en_cours? }` :
  - construit le corpus (Task 2) et l'en-tête du projet (`enteteAnalyse`) ; 400 « Aucun entretien à analyser pour cette portée. » si `nb_entretiens` vaut 0 ; 413 avec le message de la décision 4 si le corpus dépasse `LIMITES_ANALYSE.corpus_api` ;
  - appelle l'API avec le `modele_analyse` du projet : consigne système = guide de l'étape (Task 4) ; message = en-tête du projet puis corpus, chacun sous un titre ; `max_tokens` 32 000, effort `high`, sans paramètre `thinking`, en flux (`client.messages.stream`) ;
  - répond tout de suite `200` avec un corps en flux `text/plain; charset=utf-8` qui transmet le texte au fur et à mesure ; la première ligne du flux est un objet JSON d'en-tête (`{"nb_entretiens":4}`), le texte suit ; en cas d'échec en cours de route, le flux se termine par une ligne `\n\n[[ERREUR]] <message lisible>` ;
  - à la fin, **même si le navigateur s'est déconnecté**, enregistre l'analyse avec `source` = identifiant du modèle (utiliser `context.waitUntil` pour que l'enregistrement aille au bout) ; un refus du modèle (`stop_reason` `refusal`) ou une réponse vide n'est pas enregistré, une réponse tronquée (`max_tokens`) est enregistrée avec la mention finale « *(Analyse interrompue : longueur maximale atteinte.)* » ;
  - aucune clé API : 503 « Analyse par l'API indisponible : clé non configurée. Utilisez Claude avec le connecteur MCP. ».
- `GET /api/admin/projets/:id/analyses` : `AnalyseResume[]` (filtres en paramètres d'URL).
- `GET /api/admin/analyses/:id` : `Analyse` ; `DELETE` : 204.
- `server/ia/analyse.ts` expose `genererAnalyse({ cleApi, modele, consigne, message, fetch? }): AsyncIterable<string>` et une fonction de fin qui renvoie `{ texte, tronquee, refusee }` ; le client SDK accepte une fonction `fetch` pour les tests.

- [ ] **Step 1 : vérifier l'API réelle du SDK installé** pour `messages.stream` (événements de texte, `finalMessage`, `stop_reason`), et le type de `context.waitUntil` dans les Pages Functions.
- [ ] **Step 2 : tests.** `ia-analyse.test.ts` avec une fonction `fetch` qui renvoie un flux SSE au format de l'API Messages : le texte arrive en morceaux ; refus ; troncature ; paramètres envoyés (modèle, consigne, `max_tokens`, effort, `stream: true`). `api-analyses.test.ts` avec une génération simulée injectée : flux qui commence par l'en-tête JSON, enregistrement à la fin avec la bonne source et le bon `nb_entretiens`, 400 sans entretien, 413 au-delà de la limite, 503 sans clé, liste et suppression. Aucun appel réseau réel.
- [ ] **Step 3 : implémenter, vérifier le succès** (`npm test && npx tsc -b`).
- [ ] **Step 4 : commit**

```bash
git add server/ia/analyse.ts server/schemas.ts functions/api/admin/projets functions/api/admin/analyses tests/server/ia-analyse.test.ts tests/functions/api-analyses.test.ts
git commit -m "feat: analyses générées par l'API, diffusées en continu"
```

---

### Task 7 : Exports

**Files :** Create `server/services/exports.ts`, `functions/api/admin/projets/[id]/export.ts`, `functions/api/admin/questionnaires/[id]/export.ts`, `tests/server/exports.test.ts`

**Comportement.**
- `GET …/export?format=csv|md&inclure_en_cours=0|1` sur un projet ou un questionnaire ; répond avec `Content-Disposition: attachment; filename="<titre-ou-public>-<AAAA-MM-JJ>.<ext>"` (nom de fichier sans accent ni caractère spécial).
- **CSV** (décision 5) : BOM UTF-8, séparateur `;`, fins de ligne `\r\n`, une ligne d'en-tête puis une ligne par tour répondu. Colonnes : `projet`, `questionnaire`, `public`, `mode`, `nom`, `prenom`, `poste`, `entreprise`, `mail`, `origine`, `statut`, `commence_le`, `termine_le`, `ordre`, `type` (question ou relance), `question_id`, `question`, `reponse` (rendu lisible), `valeur` (valeur brute : option, options séparées par ` | `, ou note), `commentaire`, `repondu_le`. Échappement CSV correct (guillemets doublés, champs contenant `;`, guillemet ou saut de ligne entre guillemets). **Protection contre l'injection de formule** : une cellule qui commence par `=`, `+`, `-`, `@`, tabulation ou retour chariot est préfixée d'une apostrophe.
- **Markdown** : titre du projet, date d'export, puis un entretien par section `## Prénom Nom — Poste, Entreprise (statut)`, avec les vrais noms, les questions et réponses comme dans le corpus mais sans les objectifs.

- [ ] **Step 1 : tests** : en-têtes et colonnes exacts ; BOM et `\r\n` ; échappement d'une réponse contenant `;`, `"` et un saut de ligne ; une réponse commençant par `=1+1` est neutralisée ; choix multiple rendu `A | C` ; filtre `inclure_en_cours` ; Markdown avec les vrais noms ; `Content-Disposition` correct pour un titre accentué.
- [ ] **Step 2 : implémenter, vérifier, commit**

```bash
git add server/services/exports.ts functions/api/admin/projets functions/api/admin/questionnaires tests/server/exports.test.ts
git commit -m "feat: exports CSV et Markdown des réponses"
```

---

### Conventions des écrans (Tasks 8 et 9)

Celles du lot 2B s'appliquent (composants de `src/admin/commun.tsx`, `champs.tsx`, libellés dans `libelles.ts`, erreurs en `role="alert"`, pas de nouvelle dépendance). L'aperçu Markdown réutilise `ApercuMarkdown`. Un téléchargement passe par un lien vers la route d'export (le cookie de session suit), pas par un `fetch` suivi d'un blob.

---

### Task 8 : Analyses dans l'admin

**Files :** Create `src/admin/ProjetAnalyses.tsx`, `src/admin/GenerationAnalyse.tsx`, `src/admin/AnalyseScreen.tsx` ; Modify `src/admin/api.ts`, `src/admin/ProjetScreen.tsx`, `src/admin/EntretienScreen.tsx`, `src/main.tsx`

- [ ] **Step 1 : client** — `api.analyses.lister(projetId, filtre)`, `lire(id)`, `supprimer(id)`, et `generer(projetId, demande, surTexte)` qui lit le flux : `surTexte` est appelé à chaque morceau ; la fonction renvoie `{ nb_entretiens, texte, erreur? }` (ligne `[[ERREUR]]` détectée et retirée du texte).

- [ ] **Step 2 : section « Analyses » de la fiche projet** (sous Questionnaires) :
  - liste : type (« Fiche répondant », « Synthèse », « Expression de besoin »), portée, source (« Claude (MCP) » ou le nom du modèle), date et heure, nombre d'entretiens ; chaque ligne mène à `/admin/analyses/:id` ;
  - liste vide : « Aucune analyse. Générez-en une ici, ou demandez à Claude avec le connecteur MCP. » ;
  - « Nouvelle analyse » ouvre `GenerationAnalyse`.

- [ ] **Step 3 : `GenerationAnalyse`** :
  - choix du type ; pour une synthèse ou une expression de besoin, portée « Projet entier » ou un questionnaire ; pour une fiche, choix du répondant parmi les entretiens commencés ou terminés ; case « Inclure les entretiens en cours » ;
  - rappel du modèle utilisé (modèle d'analyse du projet) et de la durée : « Une analyse prend en général une à trois minutes. » ;
  - « Générer » : le texte s'affiche au fur et à mesure dans l'aperçu Markdown ; bouton désactivé pendant la génération ; avertissement avant de quitter la page (garde existante) avec le message « L'analyse continue d'être produite et sera enregistrée même si vous quittez la page. » ;
  - fin : lien vers l'analyse enregistrée, liste rafraîchie ; erreur : message lisible (400, 413, 503, ou ligne `[[ERREUR]]`).

- [ ] **Step 3 bis : depuis la lecture d'un entretien** (`EntretienScreen` admin), un bouton « Générer la fiche de ce répondant » ouvre `GenerationAnalyse` préréglée.

- [ ] **Step 4 : `AnalyseScreen`** (`/admin/analyses/:id`) : en-tête (type, portée, source, date, nombre d'entretiens, lien retour vers le projet), aperçu Markdown, boutons « Copier le Markdown », « Télécharger (.md) » (fichier construit dans le navigateur à partir du contenu), « Supprimer » avec confirmation.

- [ ] **Step 5 : vérifier et commit** — Run : `npm run build && npm test`

```bash
git add src
git commit -m "feat: analyses dans l'admin"
```

---

### Task 9 : Boutons d'export

**Files :** Create `src/admin/BoutonsExport.tsx` ; Modify `src/admin/QuestionnaireRepondants.tsx`, `src/admin/ProjetAnalyses.tsx`

- [ ] **Step 1** — un composant qui affiche « Exporter en CSV » et « Exporter en Markdown », avec la case « inclure les entretiens en cours », sous forme de liens vers la route d'export. Placé dans la section Répondants d'un questionnaire et dans la section Analyses de la fiche projet (export du projet entier).
- [ ] **Step 2 : vérifier et commit**

```bash
git add src
git commit -m "feat: boutons d'export des réponses"
```

---

### Task 10 : Vérification

Sur une instance locale à jour, avec la vraie clé API pour les contrôles marqués **IA** (quelques appels, modèle d'analyse par défaut), en reprenant les projets et entretiens de test du lot 3.

| # | Action | Résultat attendu |
|---|---|---|
| 1 | `MCP_TOKEN=… node scripts/verifier-mcp.mjs http://localhost:8791` | 19 outils, dans les deux générations de clients |
| 2 | Par le client MCP : `lire_reponses` sur le projet de test, en suivant `suite` | texte complet, pseudonymisé, aucun nom ni mail |
| 3 | Par le client MCP : `enregistrer_analyse` d'une synthèse | visible dans l'admin, source « Claude (MCP) » |
| 4 | **IA** — admin : synthèse du projet entier | texte affiché au fil de l'eau, puis analyse enregistrée avec le nom du modèle |
| 5 | Relire cette synthèse | effectifs chiffrés, verbatims attribués à des pseudonymes, confrontation aux hypothèses de la note de cadrage |
| 6 | **IA** — admin : fiche d'un répondant depuis la lecture de son entretien | fiche rattachée à ce répondant, affichée sous son vrai nom dans la liste |
| 7 | **IA** — lancer une analyse puis fermer l'onglet ; rouvrir la fiche projet deux minutes plus tard | l'analyse est enregistrée |
| 8 | Analyse sur un questionnaire sans entretien terminé | « Aucun entretien à analyser pour cette portée. » |
| 9 | Exports CSV et Markdown d'un questionnaire et du projet | fichiers téléchargés ; le CSV s'ouvre correctement dans un tableur (accents, colonnes, une ligne par question) |
| 10 | Copier, télécharger, supprimer une analyse | conforme |
| 11 | Réseau : réponses de l'analyse en flux et des outils MCP | aucun nom, prénom ni mail de répondant envoyé à l'IA (vérifier le corps envoyé par `server/ia/analyse.ts` dans un test, et le texte des outils) |
| 12 | Console | aucune erreur de script |

---

### Task 11 : Documentation

- [ ] `docs/mcp.md` : les six outils d'analyse et un déroulé type « analyse dans Claude » ; `CLAUDE.md` : arborescence et section « Analyses et exports » (pseudonymisation, analyse en flux enregistrée par `waitUntil`, exports) ; spec : sections 4 (point 8), 6 et 10 (lot 4 livré), et les décisions 1 à 6.

```bash
git add docs CLAUDE.md
git commit -m "docs: analyses et exports"
```

---

## Auto-relecture

- **Couverture de la spec** : fiche par répondant, synthèse, expression de besoin → Tasks 4, 6, 8 ; analyses via le MCP et dépôt visible dans l'admin → Tasks 4, 5, 8 ; génération à la demande dans l'admin avec le modèle d'analyse du projet, historique conservé → Tasks 3, 6, 8 ; exports CSV (une ligne par tour) et Markdown (un entretien par section) → Tasks 7, 9 ; `lire_guide` avec les étapes d'analyse → Task 4.
- **Cohérence des noms** : `TYPES_ANALYSE`, `LIMITES_ANALYSE`, `Analyse`, `AnalyseResume`, `PorteeAnalyse` (Task 1) ; `construireCorpus`, `decouper`, `enteteAnalyse` (Task 2) ; `enregistrerAnalyse`, `listerAnalyses`, `lireAnalyse`, `supprimerAnalyse` (Task 3) ; `genererAnalyse` (Task 6).
- **Risques** : durée d'une analyse (flux continu et `waitUntil`) ; taille du corpus (décision 4, lecture par morceaux côté MCP) ; données personnelles envoyées à l'IA (décision 1, tests dédiés en Tasks 2, 5 et 6).
