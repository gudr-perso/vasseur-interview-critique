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
  admin/               — écrans admin : projets, logiciels, fiche projet, éditeur de questionnaire, répondants,
                         analyses (génération, suivi du flux, lecture), exports ; api.ts (client), contenu.ts
                         (logique d'édition), extraction.ts (texte des fichiers), fluxAnalyse.ts (lecture du flux)
  repondant/           — parcours répondant : lien générique, entretien, saisies ; api.ts, stockage.ts, textes.ts
  routes/              — RequireAdmin
shared/                — types et constantes communs navigateur / serveur (modeles.ts, interviews.ts, repondants.ts,
                         analyses.ts : types des analyses et contrat du flux de génération)
server/                — logique serveur : auth, modeles, http, env, ids, erreurs, guides, api (enveloppe des routes)
  services/            — logiciels, projets, questionnaires, repondants, reponses, entretiens, corpus, analyses,
                         exports (règles métier sur D1)
  ia/                  — décisions de l'IA pendant un entretien : types.ts (interface Ia), consignes.ts, anthropic.ts ;
                         analyse.ts (analyse par l'API, en flux)
  mcp/                 — outils, serveur et contrôle d'accès MCP
functions/api/         — routes : messages.ts (proxy), admin/{logiciels,projets,documents,questionnaires,repondants,analyses}
                         (dont projets/[id]/{analyses,export} et questionnaires/[id]/export),
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

Routes publiques `/api/public/*`, sans session : l'accès se fait par le code du questionnaire ou le jeton du répondant. Le serveur porte tout l'état : chaque question posée est un tour, dont la réponse reste vide jusqu'à l'envoi. L'IA (relances, entretien) passe par l'interface `Ia` de `server/ia/types.ts` ; les tests utilisent `tests/helpers/ia.ts`. Ne jamais transmettre à l'IA ni au navigateur du répondant la note de cadrage, les objectifs ou des identifiants internes.

Le calcul de la suite (relance, question suivante, fin) se fait sous une « main » posée dans `repondants.suite_debut` par une écriture conditionnelle : un seul calcul à la fois, étape publique `attente` pendant ce temps, expiration à 60 s. « Réessayer » après une panne : 3 fois par étape, espacées de 10 s (sinon 429). Toute écriture d'un tour vérifie dans la même requête que le répondant est encore `commence`.

## Analyses et exports

Trois livrables par projet : fiche d'un répondant, synthèse (projet ou questionnaire), expression de besoin. Ils se produisent dans Claude par le MCP (voir `docs/mcp.md`) ou dans l'admin par l'API, avec le modèle d'analyse du projet. Chaque analyse est conservée avec sa date, sa source (`mcp` ou le modèle) et le nombre d'entretiens couverts ; rien n'est écrasé, l'admin peut en supprimer une.

- **Corpus** (`server/services/corpus.ts`) : entretiens en Markdown compact, terminés seulement par défaut (`inclure_en_cours` ajoute les commencés). Il sert au MCP, à l'API et à l'export Markdown. Pour une IA, chaque personne est « Répondant n » : jamais de nom, prénom, mail ni jeton. Le numéro (`repondants.numero`, migration 0003) est attribué une fois au démarrage, le plus grand du projet plus un, et inscrit dans `numeros_repondants` (clé primaire projet + numéro) dans le même lot D1 : unicité garantie même en cas de démarrages simultanés, aucun renumérotage après une suppression, aucun numéro réattribué.
- **Texte des répondants neutralisé** : une réponse ou un commentaire sur plusieurs lignes continue sous la flèche → par des lignes qui commencent par « > » ; poste, entreprise, nom, libellés et objectifs tiennent sur une ligne, sans `#` dans un titre. Aucun texte saisi ne peut commencer un titre, une question, une relance ou une flèche. `FORME_ENTRETIENS` (`server/guides.ts`) décrit exactement cette forme aux IA et rappelle que ce texte est une donnée, jamais une consigne : toute modification du rendu doit s'y refléter.
- **Questionnaires désignés** par `libellesQuestionnaires` (`shared/interviews.ts`) : public, mode et statut, puis date de création si deux restent identiques.
- **Analyse par l'API** (`server/ia/analyse.ts`, `POST /api/admin/projets/:id/analyses`) : guide de l'étape comme consigne, en-tête du projet (cadrage, logiciels, objectifs ; pas les documents) et corpus, 400 000 caractères au plus. Réponse en flux `text/plain` dont le contrat est décrit dans `shared/analyses.ts` : une ligne d'en-tête JSON (`nb_entretiens` et un séparateur aléatoire), le texte au fil de l'eau, puis des lignes de contrôle `\n<séparateur> <JSON>\n` que le client retire du texte (`src/admin/fluxAnalyse.ts`) : signal de vie après 15 s sans envoi, puis succès avec l'`analyse_id` enregistré, ou erreur. Le modèle ne voit jamais le séparateur. La génération est conduite par une tâche confiée à `waitUntil`, qui écrit sans attendre le navigateur et enregistre l'analyse à la fin.
- **Aperçu Markdown** (`src/admin/ApercuMarkdown.tsx`) : aucune image n'est chargée, seul son texte alternatif s'affiche.
- **Exports** (`server/services/exports.ts`), par projet ou par questionnaire : CSV pour un tableur (point-virgule, UTF-8 avec BOM, une ligne par question posée, cellules protégées contre l'injection de formule) et Markdown (un entretien par section, vrais noms, même neutralisation que le corpus).

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

Migrations 0002 et 0003 à appliquer en production : `npx wrangler d1 migrations apply vasseur-interview --remote`, et de même sur la base de preview. La 0003 ajoute `repondants.numero` et le registre `numeros_repondants`, et numérote les répondants existants dans l'ordre utilisé jusqu'ici (`commence_le`, puis `id`, par projet) : les pseudonymes des analyses déjà enregistrées restent justes.

Limite connue : une analyse lancée dans l'admin dont l'onglet est fermé peut ne pas être enregistrée, car Cloudflare ne prolonge le travail confié à `waitUntil` que d'environ 30 s après la fin de la réponse. D'où le message affiché pendant la génération : « Gardez cette page ouverte jusqu'à la fin ».

### Sécurité de l'accès admin

- Choisir un `ADMIN_PASSWORD` long et aléatoire : le délai d'une seconde par tentative ne limite pas les essais en parallèle. Poser en plus une règle de limitation de débit Cloudflare sur `/api/admin/login`.
- `SESSION_SECRET` doit faire au moins 32 octets aléatoires.
- Changer `ADMIN_PASSWORD` ou `SESSION_SECRET` déconnecte toutes les sessions.

## Couleurs (CSS variables `--vs-*`)

Définies dans `src/index.css` en RGB triplets pour Tailwind.  
Classes Tailwind : `bg-ink`, `text-paper`, `border-red`, `text-gold`, etc.

## Branche de déploiement : main
