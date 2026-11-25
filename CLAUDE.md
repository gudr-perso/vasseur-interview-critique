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
```

## Développement local avec l'API

1. Créer `.dev.vars` depuis `.dev.vars.example` : `ANTHROPIC_API_KEY`, `ADMIN_PASSWORD`, `SESSION_SECRET`
2. `npm run db:local` une fois pour créer la base D1 locale
3. `npm run build` une fois pour créer `dist/`
4. Terminal 1 : `npm run dev` (port 5173) — Vite relaie `/api` vers le port 8790
5. Terminal 2 : `npm run pages:dev` (Functions + D1, port 8790)

Tout appel à `/api/messages` et `/api/admin/*` exige la session admin (cookie posé par `/api/admin/login`).

## Architecture

```
src/
  types/index.ts       — Types de l'interview critique
  store/useStore.ts    — Store Zustand de l'interview critique
  lib/                 — api.ts, adminApi.ts, modeles.ts, templates.ts, presets.ts
  components/          — ui/, layout/
  screens/             — écrans de l'interview critique, NotFound
  admin/               — écrans admin : projets, logiciels, fiche projet, éditeur de questionnaire ;
                         api.ts (client), contenu.ts (logique d'édition), extraction.ts (texte des fichiers)
  routes/              — RequireAdmin
shared/                — types et constantes communs navigateur / serveur (modeles.ts, interviews.ts)
server/                — logique serveur : auth, modeles, http, env, ids, erreurs, guides
  services/            — logiciels, projets, questionnaires (règles métier sur D1)
  mcp/                 — outils, serveur et contrôle d'accès MCP
functions/api/         — routes : messages.ts (proxy), admin/{logiciels,projets,documents,questionnaires}
functions/mcp/         — serveur MCP : /mcp/<jeton> et /mcp (Bearer)
scripts/               — verifier-mcp.mjs
migrations/            — schéma D1
tests/                 — tests Vitest (server/, functions/)
```

## Navigation

React Router : `/` (interview critique), `/admin`, toute autre adresse → « Lien invalide ». Ces deux pages passent par `RequireAdmin`.
Admin : `/admin` (projets), `/admin/logiciels`, `/admin/projets/nouveau`, `/admin/projets/:id`, `/admin/questionnaires/:id`.
Les écrans admin avertissent avant de quitter une page qui porte une saisie non enregistrée : routeur de données (`createBrowserRouter`) et `useBlocker`, dans `src/admin/saisies.tsx`.
À l'intérieur de l'interview critique, la navigation reste pilotée par `useStore().screen` :
`config` → `loading` → `interview` → `synthesis`, et `config`/`synthesis` → `templates` → retour.

## Serveur MCP

Cadrage, questionnaires et publication depuis Claude : voir `docs/mcp.md`. Secret `MCP_TOKEN`.
Toute règle métier vit dans `server/services/` ; un outil MCP ne fait que valider ses arguments et appeler un service.

## API admin

`/api/admin/*`, protégée par la session. Une route = validation Zod (`server/schemas.ts`) + appel d'un service, dans l'enveloppe `route()` de `server/api.ts` qui traduit les `ErreurMetier`. Les mêmes services servent le MCP : une règle métier ne s'écrit qu'une fois, dans `server/services/`.

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

### Sécurité de l'accès admin

- Choisir un `ADMIN_PASSWORD` long et aléatoire : le délai d'une seconde par tentative ne limite pas les essais en parallèle. Poser en plus une règle de limitation de débit Cloudflare sur `/api/admin/login`.
- `SESSION_SECRET` doit faire au moins 32 octets aléatoires.
- Changer `ADMIN_PASSWORD` ou `SESSION_SECRET` déconnecte toutes les sessions.

## Couleurs (CSS variables `--vs-*`)

Définies dans `src/index.css` en RGB triplets pour Tailwind.  
Classes Tailwind : `bg-ink`, `text-paper`, `border-red`, `text-gold`, etc.

## Branche de déploiement : main
