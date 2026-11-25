# Vasseur Interview

Application web d'interview critique générique. L'utilisateur fournit un sujet + document, l'IA génère des questions critiques structurées, conduit l'interview Q par Q avec feedback, puis produit des rendus finaux.

## Stack

- **React 18 + Vite + TypeScript**
- **Tailwind CSS v3** avec variables CSS personnalisées (`--vs-*`)
- **Zustand 5** pour la navigation et l'état global
- **Cloudflare Pages** pour l'hébergement
- **Cloudflare Pages Function** (`functions/api/messages.ts`) comme proxy Anthropic API
- **localStorage** pour les presets de prompts

## Commandes

```bash
npm run dev          # Vite dev server (port 5173) — frontend seulement
npm run build        # TypeScript check + Vite build → dist/
npm run pages:dev    # wrangler pages dev dist --port 8790 — frontend + API
npm run preview      # Preview du build
```

## Développement local avec l'API

1. Créer `.dev.vars` (copié depuis `.dev.vars.example`) avec `ANTHROPIC_API_KEY=sk-ant-...`
2. `npm run build` une fois pour créer `dist/`
3. Terminal 1 : `npm run dev` (hot reload, port 5173)
4. Terminal 2 : `npm run pages:dev` (API proxy, port 8790)
5. `.env.local` pointe déjà vers `http://localhost:8790/api/messages`

## Architecture

```
src/
  types/index.ts       — Types TypeScript (Question, Answer, Templates, etc.)
  store/useStore.ts    — Store Zustand (navigation, config, interview, templates)
  lib/
    api.ts             — callAnthropic(), generateQuestions(), generateOutput()
    templates.ts       — DEFAULT_TEMPLATES + renderTemplate()
    presets.ts         — CRUD localStorage presets
  components/
    ui/                — Button, Card, Chip, Spinner, ModelSelector, FeedbackCard
    layout/            — Header, VasseurCard
  screens/             — ConfigScreen, LoadingScreen, InterviewScreen, SynthesisScreen, TemplatesScreen
functions/
  api/messages.ts      — Pages Function proxy vers api.anthropic.com/v1/messages
```

## Navigation

Pas de React Router — navigation via `useStore().screen` :
`config` → `loading` → `interview` → `synthesis`
`config`/`synthesis` → `templates` → retour

## Déploiement Cloudflare Pages

```bash
npm run build
# Dans le dashboard Cloudflare Pages :
# Build command  : npm run build
# Build output   : dist/
# Root directory : /
# Variable secrète : ANTHROPIC_API_KEY (depuis Settings > Environment Variables)
```

## Couleurs (CSS variables `--vs-*`)

Définies dans `src/index.css` en RGB triplets pour Tailwind.  
Classes Tailwind : `bg-ink`, `text-paper`, `border-red`, `text-gold`, etc.

## Branche de déploiement : main
