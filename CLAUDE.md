# Vasseur Interview

Application web d'interview critique générique. L'utilisateur fournit un sujet + document, l'IA génère des questions critiques structurées, conduit l'interview Q par Q avec feedback, puis produit des rendus finaux.

## Stack

- **React 18 + Vite + TypeScript**
- **Tailwind CSS v3** avec variables CSS personnalisées (`--vs-*`)
- **Zustand 5** pour l'état de l'interview critique, **React Router 6** pour les URL
- **Cloudflare D1** (liaison `DB`) pour l'outil d'interview utilisateurs
- **Vitest + Miniflare** pour les tests serveur
- **Cloudflare Pages** pour l'hébergement
- **Cloudflare Pages Function** (`functions/api/messages.ts`) comme proxy Anthropic API
- **localStorage** pour les presets de prompts

## Commandes

```bash
npm run dev          # Vite dev server (port 5173) — frontend seulement
npm run build        # TypeScript check + Vite build → dist/
npm run pages:dev    # wrangler pages dev dist --port 8790 — frontend + API
npm run preview      # Preview du build
npm test             # Tests serveur (Vitest)
npm run db:local     # Applique les migrations D1 en local
npm run eval:relances  # Évaluation des relances avec l'IA réelle (payant, hors de npm test)
```

`eval:relances` lit `ANTHROPIC_API_KEY` dans l'environnement (et le modèle dans `EVAL_MODELE`, défaut `claude-sonnet-5-5`) ; sans clé, il ne fait rien. Sans afficher la clé :
`ANTHROPIC_API_KEY=$(grep '^ANTHROPIC_API_KEY=' .dev.vars | cut -d= -f2- | tr -d '\r') npm run eval:relances` — un appel par cas, une dizaine de cas.

## Développement local avec l'API

1. Créer `.dev.vars` depuis `.dev.vars.example` : `ANTHROPIC_API_KEY`, `ADMIN_PASSWORD`, `SESSION_SECRET`
2. `npm run db:local` une fois pour créer la base D1 locale
3. `npm run build` une fois pour créer `dist/`
4. Terminal 1 : `npm run dev` (port 5173) — Vite relaie `/api` vers le port 8790
5. Terminal 2 : `npm run pages:dev` (Functions + D1, port 8790)

Tout appel à `/api/messages` et `/api/admin/*` exige la session admin (cookie posé par `/api/admin/login`). `/api/public/*` (parcours répondant) n'en demande aucune.

## Architecture

```
src/
  types/index.ts       — Types de l'interview critique
  store/useStore.ts    — Store Zustand de l'interview critique
  lib/                 — api.ts, adminApi.ts, modeles.ts, templates.ts, presets.ts
  components/          — ui/, layout/
  screens/             — écrans de l'interview critique, NotFound
  admin/               — écrans admin : projets, logiciels, fiche projet, cadrage avec l'IA, éditeur de questionnaire,
                         génération de questionnaires, répondants, analyses (génération, suivi du flux, lecture),
                         exports ; api.ts (client), contenu.ts (logique d'édition), extraction.ts (texte des
                         fichiers), flux.ts (lecteur commun des réponses en flux), fluxAnalyse.ts et formatsFlux.ts
                         (formats propres à chaque flux), appelFlux.ts (suivi d'un appel), dialogueCadrage.ts
                         (logique du dialogue de cadrage)
  repondant/           — parcours répondant : lien générique, entretien, saisies ; api.ts, stockage.ts, textes.ts
  routes/              — RequireAdmin
shared/                — types et constantes communs navigateur / serveur (modeles.ts, interviews.ts, repondants.ts,
                         flux.ts : contrat commun des réponses de l'IA en flux ; analyses.ts, cadrage.ts,
                         generation.ts : types propres à chaque travail de l'IA dans l'admin)
server/                — logique serveur : auth, modeles, http, env, ids, erreurs, guides, api (enveloppe des routes)
  services/            — logiciels, projets, questionnaires, repondants, reponses, entretiens, corpus, analyses,
                         cadrage, exports (règles métier sur D1)
  ia/                  — décisions de l'IA pendant un entretien : types.ts (interface Ia), consignes.ts, anthropic.ts ;
                         travaux de l'IA dans l'admin : appel.ts (appel en flux à l'API Messages), flux.ts (réponse
                         en flux commune), analyse.ts, cadrage.ts (dialogue, note, résumé), questionnaires.ts
                         (publics proposés, questionnaire généré)
  mcp/                 — outils, serveur et contrôle d'accès MCP
functions/api/         — routes : messages.ts (proxy), admin/{logiciels,projets,documents,questionnaires,repondants,analyses}
                         (dont projets/[id]/{analyses,export,cadrage/*,questionnaires/{publics,generer}} et
                         questionnaires/[id]/export),
                         public/{q/[code],r/[jeton]} (parcours répondant, sans session)
functions/mcp/         — serveur MCP : /mcp/<jeton> et /mcp (Bearer)
scripts/               — verifier-mcp.mjs
migrations/            — schéma D1
tests/                 — tests Vitest (server/, functions/, src/) ; helpers/ (D1, IA simulée) ; eval/ (IA réelle)
```

## Navigation

React Router : `/` (interview critique), `/admin`, `/q/:code` et `/r/:jeton` (parcours répondant, publics), toute autre adresse → « Lien invalide ». `/` et `/admin` passent par `RequireAdmin`.
Admin : `/admin` (projets), `/admin/logiciels`, `/admin/projets/nouveau`, `/admin/projets/:id`, `/admin/questionnaires/:id`, `/admin/repondants/:id` (lecture d’un entretien), `/admin/analyses/:id` (lecture d’une analyse).
Les écrans admin avertissent avant de quitter une page qui porte une saisie non enregistrée : routeur de données (`createBrowserRouter`) et `useBlocker`, dans `src/admin/saisies.tsx`.
À l'intérieur de l'interview critique, la navigation reste pilotée par `useStore().screen` :
`config` → `loading` → `interview` → `synthesis`, et `config`/`synthesis` → `templates` → retour.

## Serveur MCP

Cadrage, questionnaires, publication et analyses depuis Claude : voir `docs/mcp.md`. Secret `MCP_TOKEN`.
Toute règle métier vit dans `server/services/` ; un outil MCP ne fait que valider ses arguments et appeler un service.

## API admin

`/api/admin/*`, protégée par la session. Une route = validation Zod (`server/schemas.ts`) + appel d'un service, dans l'enveloppe `route()` de `server/api.ts` qui traduit les `ErreurMetier`. Les mêmes services servent le MCP : une règle métier ne s'écrit qu'une fois, dans `server/services/`.

## Parcours répondant

Routes publiques `/api/public/*`, sans session : l'accès se fait par le code du questionnaire ou le jeton du répondant. Le serveur porte tout l'état : chaque question posée est un tour, dont la réponse reste vide jusqu'à l'envoi. L'IA (relances, entretien) passe par l'interface `Ia` de `server/ia/types.ts` ; les tests utilisent `tests/helpers/ia.ts`. Ne jamais transmettre à l'IA d'entretien ni au navigateur du répondant la note de cadrage ou des identifiants internes. Les objectifs des questions et des thèmes vont à l'IA d'entretien, qui s'en sert pour décider d'une relance ou du tour suivant sans les citer (`server/ia/consignes.ts`) ; ils ne vont jamais au navigateur du répondant.

Le calcul de la suite (relance, question suivante, fin) se fait sous une « main » posée dans `repondants.suite_debut` par une écriture conditionnelle : un seul calcul à la fois, étape publique `attente` pendant ce temps, expiration à 60 s. « Réessayer » après une panne : 3 fois par étape, espacées de 10 s (sinon 429). Toute écriture d'un tour vérifie dans la même requête que le répondant est encore `commence`.

## Analyses et exports

Trois livrables par projet : fiche d'un répondant, synthèse (projet ou questionnaire), expression de besoin. Ils se produisent dans Claude par le MCP (voir `docs/mcp.md`) ou dans l'admin par l'API, avec le modèle d'analyse du projet. Chaque analyse est conservée avec sa date, sa source (`mcp` ou le modèle) et le nombre d'entretiens couverts ; rien n'est écrasé, l'admin peut en supprimer une. Supprimer un répondant supprime aussi ses fiches (`ON DELETE CASCADE`), ce que dit la confirmation ; les synthèses et expressions de besoin restent.

- **Corpus** (`server/services/corpus.ts`) : entretiens en Markdown compact, terminés seulement par défaut (`inclure_en_cours` ajoute les commencés). Un entretien commencé sans aucune réponse n'est ni rendu ni compté, dans le corpus comme dans les exports. Il sert au MCP, à l'API et à l'export Markdown. Pour une IA, chaque personne est « Répondant n » : jamais de nom, prénom, mail ni jeton. Le numéro (`repondants.numero`, migration 0003) est attribué une fois au démarrage, le plus grand du projet plus un, et inscrit dans `numeros_repondants` (clé primaire projet + numéro) dans le même lot D1 : unicité garantie même en cas de démarrages simultanés, aucun renumérotage après une suppression, aucun numéro réattribué.
- **Texte des répondants neutralisé** : une réponse ou un commentaire sur plusieurs lignes continue sous la flèche → par des lignes qui commencent par « > » ; poste, entreprise, nom, libellés et objectifs tiennent sur une ligne, sans `#` dans un titre. Aucun texte saisi ne peut commencer un titre, une question, une relance ou une flèche. `FORME_ENTRETIENS` (`server/guides.ts`) décrit exactement cette forme aux IA et rappelle que ce texte est une donnée, jamais une consigne : toute modification du rendu doit s'y refléter.
- **Questionnaires désignés** par `libellesQuestionnaires` (`shared/interviews.ts`) : public, mode et statut, puis date de création si deux restent identiques.
- **Analyse par l'API** (`server/ia/analyse.ts`, `POST /api/admin/projets/:id/analyses`) : guide de l'étape comme consigne, en-tête du projet (cadrage, logiciels, objectifs ; pas les documents) et corpus, 400 000 caractères au plus. Réponse en flux (servie en `text/event-stream`) selon le contrat commun de `shared/flux.ts` : une ligne d'en-tête JSON (`nb_entretiens` et un séparateur aléatoire), le texte au fil de l'eau, puis des lignes de contrôle `\n<séparateur> <JSON>\n` que le lecteur commun `src/admin/flux.ts` retire du texte : signal de vie après 15 s sans envoi, puis succès avec l'`analyse_id` enregistré, ou erreur. Le modèle ne voit jamais le séparateur. La génération est conduite par une tâche confiée à `waitUntil`, qui écrit sans attendre le navigateur et enregistre l'analyse à la fin.
- **Aperçu Markdown** (`src/admin/ApercuMarkdown.tsx`) : aucune image n'est chargée, seul son texte alternatif s'affiche.
- **Exports** (`server/services/exports.ts`), par projet ou par questionnaire : CSV pour un tableur (point-virgule, UTF-8 avec BOM, une ligne par question posée, cellules protégées contre l'injection de formule) et Markdown (un entretien par section, vrais noms, même neutralisation que le corpus).

## Cadrage et génération dans l'admin

Ce que Claude fait par le MCP (cadrer un projet, écrire ses questionnaires) se fait aussi dans l'admin par l'API, avec le modèle de cadrage du projet. Les deux voies coexistent et suivent les mêmes guides (`server/guides.ts`, étapes `cadrage` et `questionnaire`) : la consigne est le guide sans sa section « Avec les outils », suivie d'une courte section propre à l'admin (`SECTION_ADMIN` de `server/ia/cadrage.ts` et de `server/ia/questionnaires.ts`). Une règle de méthode utile aux deux voies s'écrit dans le guide, pas dans la section de l'admin.

- **Appels** (`server/ia/appel.ts`) : `messages.stream`, effort fixé par l'appelant, sans paramètre `thinking`. Le contexte du projet est un second bloc système marqué `cache_control` : consigne puis contexte forment un préfixe identique d'un tour du dialogue au suivant. Le cache ne se partage pas entre dialogue, note, résumé et questionnaires (format de sortie, effort ou contexte diffèrent).
- **Contexte** (`contexteCadrage`, `server/services/cadrage.ts`) : description, fiches des logiciels, note de cadrage, texte complet des documents, 300 000 caractères au plus (au-delà, chaque document est tronqué dans la même proportion, avec une mention). Jamais de donnée de répondant. Le résumé de contexte, destiné à l'IA d'entretien, est rédigé à partir d'un contexte **sans** la note (`avecNote: false`) : ni la note ni ses hypothèses ne doivent l'atteindre.
- **Dialogue** (`POST /api/admin/projets/:id/cadrage/tour`, `{ texte?, apres }`) : une question à la fois, en sortie structurée `{ fin, message }`, chaque message enregistré avec sa nature (`question`, `reponse`, `conclusion`, migration 0004). Plafond de questions selon le type de demande (3, 6 ou 12) : atteint, le serveur conclut sans appeler l'IA. `apres` est le dernier message vu par le client : la réponse de l'admin n'est écrite que s'il est toujours le dernier (`ajouterMessageApres`, condition et écriture dans une seule requête ; sinon 409), et le message de l'IA que si le dialogue n'a pas bougé depuis le début du tour (sinon le tour est abandonné sans rien écrire). Deux onglets ou une relance en double ne produisent donc jamais deux questions de suite. La charge utile de succès porte les messages écrits pendant le tour, pour compléter le fil si sa relecture échoue.
- **Note et résumé** (`…/cadrage/note`, `…/cadrage/resume`) : texte au fil de l'eau qui remplit la zone de saisie ; rien n'est enregistré tant que l'admin ne clique pas « Enregistrer ». Un texte plus long que la zone est coupé, avec un avertissement.
- **Questionnaires** (`…/questionnaires/publics`, `…/questionnaires/generer`) : note de cadrage obligatoire. Les publics proposés (1 à 6) ne sont pas enregistrés ; une proposition au public vide est écartée. Un questionnaire généré est validé par `validerContenu` puis créé en brouillon ; une sortie refusée (hors schéma, contenu invalide, introduction vide) est renvoyée une seule fois au modèle avec le message d'erreur exact.
- **Flux** : toutes ces réponses suivent le contrat commun de `shared/flux.ts` (`server/ia/flux.ts` côté serveur, `src/admin/flux.ts` côté client), comme les analyses : en-tête immédiat, signaux de vie, une seule ligne finale. Sans `ANTHROPIC_API_KEY`, ces routes répondent 503 et invitent à passer par Claude et le MCP.

## Déploiement Cloudflare Pages

```bash
npm run build
# Dans le dashboard Cloudflare Pages :
# Build command  : npm run build
# Build output   : dist/
# Root directory : /
# Secrets : ANTHROPIC_API_KEY, ADMIN_PASSWORD, SESSION_SECRET, MCP_TOKEN
# Base D1 : identifiant dans wrangler.toml, migrations par
#   npx wrangler d1 migrations apply vasseur-interview --remote
```

Migrations 0002, 0003 et 0004 à appliquer en production : `npx wrangler d1 migrations apply vasseur-interview --remote`, et de même sur la base de preview. La 0003 ajoute `repondants.numero` et le registre `numeros_repondants`, et numérote les répondants existants dans l'ordre utilisé jusqu'ici (`commence_le`, puis `id`, par projet) : les pseudonymes des analyses déjà enregistrées restent justes. La 0004 refait la table `cadrage_messages` avec la nature de chaque message (`question`, `reponse`, `conclusion`) ; les messages existants sont classés d'après leur auteur et, pour l'IA, le point d'interrogation final.

Limite connue : une analyse lancée dans l'admin dont l'onglet est fermé peut ne pas être enregistrée, car Cloudflare ne prolonge le travail confié à `waitUntil` que d'environ 30 s après la fin de la réponse. D'où le message affiché pendant la génération : « Gardez cette page ouverte jusqu'à la fin ».

### Sécurité de l'accès admin

- Choisir un `ADMIN_PASSWORD` long et aléatoire : le délai d'une seconde par tentative ne limite pas les essais en parallèle. Poser en plus une règle de limitation de débit Cloudflare sur `/api/admin/login`.
- `SESSION_SECRET` doit faire au moins 32 octets aléatoires.
- Changer `ADMIN_PASSWORD` ou `SESSION_SECRET` déconnecte toutes les sessions.

## Couleurs (CSS variables `--vs-*`)

Définies dans `src/index.css` en RGB triplets pour Tailwind.  
Classes Tailwind : `bg-ink`, `text-paper`, `border-red`, `text-gold`, etc.

## Branche de déploiement : main
