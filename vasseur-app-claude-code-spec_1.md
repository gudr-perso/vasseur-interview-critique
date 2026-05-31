# Spec — Application web "Vasseur Interview" (React + Cloudflare)

> **Prompt pour Claude Code.** Ce document décrit l'intégralité de l'application à construire. Lis-le en entier avant d'écrire la moindre ligne de code. Pose des questions si une section est ambiguë plutôt que de deviner.

---

## 1. Vue d'ensemble

**Nom de l'application :** Vasseur Interview  
**Tagline :** Moteur d'interview critique générique — style journalisme d'investigation

**Ce que fait l'app :**  
L'utilisateur fournit un sujet, un contexte sectoriel et le contenu d'un document (pitch deck, business plan, cahier des charges, dossier commercial…). L'application appelle l'API Anthropic pour générer dynamiquement 10 à 100 questions d'interview critiques et structurées, adaptées au document, dans le style d'un journaliste d'investigation. L'interview se déroule ensuite question par question (choix A/B/C + réponse libre), avec feedback immédiat, détection de flags de risque, et génération de rendus finaux (analyse critique, article, vérification factuelle) via l'API.

**Utilisateur cible :** Porteurs de projets, entrepreneurs, consultants — qui veulent challenger leur pitch ou dossier avant une présentation à un jury, un investisseur, ou un client exigeant.

---

## 2. Stack technique

| Couche | Techno |
|--------|--------|
| Frontend | React 18+ (Vite), TypeScript |
| Routing | React Router v6 |
| State | Zustand (store global) |
| Styling | Tailwind CSS v3 + variables CSS personnalisées |
| Backend proxy | Cloudflare Worker (TypeScript) |
| Hosting | Cloudflare Pages |
| Persistance locale | localStorage (presets de prompts) |
| API IA | Anthropic Messages API (`/v1/messages`) |

**Pourquoi un Worker proxy :**  
La clé API Anthropic ne doit jamais être exposée côté client. Le Worker reçoit les requêtes du frontend, ajoute la clé API en header, et les forward à Anthropic. Il peut aussi gérer le rate limiting si nécessaire.

---

## 3. Architecture du projet

```
vasseur-interview/
├── apps/
│   ├── web/                          # React SPA (Cloudflare Pages)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── ui/               # Composants génériques (Button, Card, Chip, Spinner…)
│   │   │   │   ├── layout/           # Header, VasseurCard
│   │   │   │   └── screens/          # Un composant par écran
│   │   │   ├── screens/
│   │   │   │   ├── ConfigScreen.tsx
│   │   │   │   ├── TemplatesScreen.tsx
│   │   │   │   ├── LoadingScreen.tsx
│   │   │   │   ├── InterviewScreen.tsx
│   │   │   │   └── SynthesisScreen.tsx
│   │   │   ├── store/
│   │   │   │   └── useStore.ts       # Store Zustand global
│   │   │   ├── lib/
│   │   │   │   ├── api.ts            # Appels au Worker proxy
│   │   │   │   ├── templates.ts      # Prompts par défaut + renderTemplate()
│   │   │   │   └── presets.ts        # CRUD localStorage presets
│   │   │   ├── types/
│   │   │   │   └── index.ts          # Types TypeScript partagés
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   │
│   └── worker/                       # Cloudflare Worker proxy
│       ├── src/
│       │   └── index.ts
│       └── wrangler.toml
│
├── package.json                      # Workspace root (pnpm workspaces)
└── README.md
```

---

## 4. Design system

### Palette de couleurs (CSS variables)

```css
:root {
  --ink:      #1a1410;  /* texte principal, fonds sombres */
  --paper:    #f5f0e8;  /* fond global */
  --paper2:   #ede6d6;  /* fond secondaire, hover états */
  --red:      #c0392b;  /* accent principal, CTA, flags */
  --red-dark: #922b21;  /* hover red */
  --gold:     #b7860a;  /* section banners, KB */
  --muted:    #7a7060;  /* texte secondaire, labels */
  --border:   #c8bda8;  /* bordures */
  --ok-bg:    #f2faf4;  /* feedback positif fond */
  --ok-fg:    #1e6b3e;  /* feedback positif texte */
  --warn-bg:  #fffbf0;  /* feedback warning fond */
  --warn-fg:  #7d4e0f;  /* feedback warning texte */
  --flag-bg:  #fdf3f2;  /* feedback risque fond */
  --flag-fg:  #8b1a1a;  /* feedback risque texte */
}
```

### Typographie

```
Font display  : 'Playfair Display' (Serif) — titres, citations Vasseur, synthèse
Font mono     : 'IBM Plex Mono' — labels, numéros de question, badges, code
Font body     : 'IBM Plex Sans' — corps de texte, options
```

Charger via Google Fonts dans `index.html`.

### Composants UI de base à créer

- `Button` — variantes : `primary` (rouge), `dark` (encre), `outline`, `ghost`, `danger`, `sm`
- `Card` — fond blanc, bordure `--border`, padding configurable
- `Chip` — badge flag risque (fond rouge clair, bordure rouge)
- `Spinner` — cercle animé 13px ou 28px selon contexte
- `ModelSelector` — deux options visuelles (Sonnet / Opus) avec badge, nom, description
- `ProgressBar` — barre fine en header
- `SectionBanner` — bandeau doré avec label de section
- `FeedbackCard` — variantes `ok` / `warn` / `flag` avec bordure gauche colorée
- `VasseurCard` — fond encre, bordure rouge gauche, texte en Playfair italique

---

## 5. Types TypeScript

```typescript
// types/index.ts

export type ModelId = 'claude-sonnet-4-6' | 'claude-opus-4-6';

export interface AppConfig {
  journalist: string;
  subject: string;
  sector: string;
  doc: string;
  questionCount: 10 | 25 | 50 | 100;
  genModel: ModelId;
}

export interface Section {
  id: string;       // 'A', 'B', 'C'…
  label: string;
  intro: string;
}

export interface Question {
  id: number;
  sec: string;
  tag: string;
  q: string;
  opts: [string, string, string];
  flags: { A: string | null; B: string | null; C: string | null };
  fb:    { A: string; B: string; C: string };
}

export interface GeneratedInterview {
  journalist_name: string;
  journalist_intro: string;
  knowledge_base: string;
  sections: Section[];
  questions: Question[];
}

export type AnswerChoice = 'A' | 'B' | 'C' | 'D';

export interface Answer {
  id: number;           // 0 = intro libre
  sec: string;
  tag: string;
  question: string;
  opts: string[];
  choice: AnswerChoice;
  free: string;
  ts: string;           // ISO timestamp
  flags: string[];
}

export type TemplateKey = 'critique' | 'article' | 'verif';

export interface Templates {
  critique: string;
  article: string;
  verif: string;
}

export interface Preset {
  name: string;
  templates: Templates;
  createdAt: string;
}

export type Screen = 'config' | 'templates' | 'loading' | 'interview' | 'synthesis';

export type FeedbackType = 'ok' | 'warn' | 'flag';
```

---

## 6. Store Zustand (`store/useStore.ts`)

```typescript
interface AppState {
  // Navigation
  screen: Screen;
  setScreen: (s: Screen) => void;
  templateFrom: 'config' | 'synth';
  setTemplateFrom: (s: 'config' | 'synth') => void;

  // Config
  config: AppConfig;
  setConfig: (c: Partial<AppConfig>) => void;

  // Generated interview
  interview: GeneratedInterview | null;
  setInterview: (i: GeneratedInterview) => void;

  // Interview progress
  currentQ: number;
  answers: Answer[];
  globalFlags: string[];
  selectedOption: AnswerChoice | null;
  setSelectedOption: (o: AnswerChoice | null) => void;
  submitAnswer: (choice: AnswerChoice | null, free: string) => void;
  nextQuestion: () => void;
  goToSynthesis: () => void;

  // Templates
  templates: Templates;
  setTemplate: (key: TemplateKey, value: string) => void;
  resetTemplate: (key: TemplateKey) => void;
  loadPreset: (preset: Preset) => void;

  // Output model
  outModel: ModelId;
  setOutModel: (m: ModelId) => void;

  // Reset
  reset: () => void;
}
```

---

## 7. Écrans (Screens)

### 7.1 ConfigScreen

**Route :** `/` (screen `config`)

**Champs du formulaire :**

| Champ | Type | Requis | Valeur par défaut |
|-------|------|--------|-------------------|
| Journaliste | `textarea` (1 ligne extensible) | Non | *"Étienne Vasseur, journaliste d'investigation spécialisé en conformité et qualité industrielle, 15 ans d'expérience presse professionnelle. Direct, factuel, incisif. Il cherche les incohérences, les promesses intenables et les angles morts. Jamais complaisant."* |
| Sujet | `input[text]` | Oui | — |
| Secteur / Contexte | `input[text]` | Non | — |
| Document | `textarea` (grande, 10+ lignes) | Oui | — |
| Nombre de questions | Boutons radio stylisés : `10` / `25` / `50` / `100` | — | `25` |
| Modèle génération | `ModelSelector` : Sonnet / Opus | — | Sonnet |

**Hints pour le nombre de questions :**
- 10 → "~10 min · Survol rapide"
- 25 → "~25 min · Analyse solide"  
- 50 → "~45 min · Couverture complète"
- 100 → "~90 min · Due diligence approfondie"

**Actions :**
- **[Lancer la préparation →]** — bouton primaire — valide et lance la génération
- **[Configurer les rendus ⚙]** — bouton outline small — ouvre `TemplatesScreen` (from: 'config')

**Validation :**
- Sujet vide → message d'erreur inline
- Document vide → message d'erreur inline
- Pas de navigation vers TemplatesScreen si pas d'erreur critique

**Comportement après submit :**
1. Passe à `LoadingScreen`
2. Lance `generateQuestions()` via `api.ts`
3. Succès → parse JSON, hydrate store, passe à `InterviewScreen`
4. Erreur → revient à `ConfigScreen` avec message d'erreur

---

### 7.2 TemplatesScreen

**Route :** `/templates` (screen `templates`)

**Description :** Éditeur de prompts pour les 3 types de rendus. Accessible depuis Config et depuis Synthesis.

**Layout :**
```
[En-tête avec titre "Configurer les rendus"]
[Description courte]

[Barre de variables cliquables]
  Variables : [{{journaliste}}] [{{sujet}}] [{{secteur}}] [{{qa}}] [{{flags}}] [{{kb}}]

[Onglets] : [Analyse critique] [Article] [Vérification faits]

[Textarea grande — contenu du template actif]

[Bouton "Réinitialiser par défaut"]  |  [Message flash "Sauvegardé"]

---

[Zone Presets]
  Nom : [____________]  [Sauvegarder]
  Charger : [Select ▼]  [Charger]  [Supprimer]

[← Retour]
```

**Variables disponibles et ce qu'elles injectent :**

| Variable | Injecte |
|----------|---------|
| `{{journaliste}}` | Nom + bio complète du journaliste |
| `{{sujet}}` | Sujet de l'interview |
| `{{secteur}}` | Secteur (vide si non renseigné) |
| `{{qa}}` | Intégralité du Q&A (questions + réponses + flags) |
| `{{flags}}` | Liste des flags déclenchés |
| `{{kb}}` | Base de connaissances générée par l'IA |

**Clic sur une variable :** insère `{{variable}}` à la position du curseur dans le textarea actif.

**Presets (localStorage) :**
- Clé : `vasseur_presets`
- Format : `Preset[]` (voir type)
- Sauvegarder : upsert par nom (si nom existe → confirmation avant écrasement)
- Charger : remplace les 3 templates en mémoire
- Supprimer : confirmation + suppression

**Retour :** revient à l'écran d'origine (config ou synthesis) sans perdre les modifications.

---

### 7.3 LoadingScreen

**Route :** géré par le store (pas de route dédiée)

**Layout :** Spinner centré + message animé qui tourne toutes les 3,5s :
1. "Vasseur analyse le dossier…"
2. "Identification des angles morts…"
3. "Préparation des questions létales…"
4. "Vérification des incohérences…"
5. "Calibration du niveau d'exigence…"

+ Indication : "Les questions sont générées spécifiquement pour votre sujet. Comptez 20 à 90 secondes selon le modèle choisi."

---

### 7.4 InterviewScreen

**Route :** `/interview` (screen `interview`)

**Layout :**
```
[Header global — titre du sujet + barre de progression + badge modèle]
[VasseurCard — citation/intro Vasseur, mise à jour à chaque section]
[KnowledgeBaseCard — repliable, affiche la base de connaissances]
[SectionBanner — visible au changement de section]
[QuestionCard]
  [Numéro + tag]
  [Texte de la question]
  [Options A / B / C — boutons sélectionnables]
  [Zone D — Réponse libre (textarea)]
  [Bouton "Confirmer →"]
  [FeedbackCard — visible après confirmation]
  [Bouton "Question suivante →" — visible après confirmation]
```

**Comportement :**

1. **Phase intro :** Avant Q1, afficher une question de présentation libre (pas d'options fermées). La réponse est enregistrée en `Answer` avec `id: 0`.

2. **Sélection d'option :** Un seul clic sélectionne (highlight). Un nouveau clic sur une autre option change la sélection.

3. **Confirmation :**
   - Valide si au moins une option OU une réponse libre
   - Calcule le feedback : option sélectionnée → check `q.fb[choice]` et `q.flags[choice]`
   - Réponse libre sans option → feedback neutre "Réponse libre enregistrée."
   - Ajoute le flag au store si présent
   - Affiche `FeedbackCard` avec type ok/warn/flag
   - Affiche bouton "Question suivante →"

4. **Passage à la section suivante :** Détecter `q.sec !== questions[idx-1].sec` → afficher `SectionBanner` + mettre à jour `VasseurCard`.

5. **Fin des questions :** Passer automatiquement à `SynthesisScreen`.

---

### 7.5 SynthesisScreen

**Route :** `/synthesis` (screen `synthesis`)

**Layout :**
```
[VasseurCard — "C'est terminé. Voici ce que j'ai retenu."]

[SynthesisCard]
  Titre : "Synthèse — Points critiques détectés"
  [Liste des 5-8 réponses avec flags critiques]
  [Chips de tous les flags déclenchés]

[ModelSelectorCard — choix Sonnet/Opus pour les rendus]

[Barre d'actions]
  [Analyse critique (Vasseur)]  [Rédiger l'article]  [Vérifier les faits]
  |sep|
  [Modifier les prompts ⚙]
  |sep|
  [Export Q&A (.md)]  [← Nouvelle interview]

[Spinner — visible pendant génération]

[OutputCard — visible après génération]
  [Titre du rendu + modèle utilisé]
  [Texte généré — scrollable, max-height 480px]
```

**Logique de synthèse :**  
Identifier les réponses "critiques" : celles dont `answer.flags` contient un flag dont le nom contient un des mots-clés : `legal`, `rgpd`, `credibilite`, `zero_client`, `solo`, `chiffres`, `signature`, `vendor`, `positionnement`, `promesse`. Afficher les 8 premières.

**Export markdown :**  
Générer un `.md` avec : titre, journaliste, date, modèle utilisé, nombre de questions, présentation initiale, puis toutes les réponses organisées par section (Q, choix, réponse libre, flags, timestamp).

**Nouvelle interview :**  
Reset complet du store + retour à ConfigScreen.

---

## 8. Templates par défaut

```typescript
// lib/templates.ts

export const DEFAULT_TEMPLATES: Templates = {
  critique: `Tu es {{journaliste}}. Tu viens de conduire cette interview.

Sujet : {{sujet}}{{secteur}}
{{kb}}
Réponses de l'interviewé :
{{qa}}

Flags déclenchés : {{flags}}

Rédige une analyse critique de 300 à 600 mots, au style journalistique factuel et incisif.
Structure :
1. Jugement d'ensemble (2-3 phrases)
2. Points solides identifiés (s'il y en a)
3. Liste numérotée des réponses "à approfondir" (n° de question + pourquoi, 1-2 phrases chacune)
4. Conclusion sans concession.

Ton : direct, factuel. Ni complaisant ni hostile.`,

  article: `Tu es {{journaliste}}, journaliste.

Sujet : {{sujet}}{{secteur}}
{{kb}}
Réponses : {{qa}}

Rédige un article de 600 à 1200 mots :
- Titre accrocheur
- Chapeau 2-3 phrases
- Corps structuré avec sous-titres courts
- Citations stylisées reconstituées à partir des réponses (signale-les comme "reconstituées")
- Points saillants
- Conclusion critique

Style : journalisme professionnel, factuel.`,

  verif: `Tu es {{journaliste}}.

Sujet : {{sujet}}{{secteur}}
{{kb}}
Réponses : {{qa}}

Confronte 3 à 5 affirmations importantes de cet interview à la réalité factuelle vérifiable (réglementations, chiffres officiels, réalités du marché, limites techniques).
Pour chaque affirmation : cite la réponse concernée, donne le fait réel, rends un verdict (confirmé / contesté / invérifiable).
Précis, bref, factuel.`
};

export function renderTemplate(
  tpl: string,
  data: {
    journalist: string;
    subject: string;
    sector: string;
    qa: string;
    flags: string;
    kb: string;
  }
): string {
  const sectorStr = data.sector ? ` (${data.sector})` : '';
  const kbStr = data.kb ? `Base de connaissances :\n${data.kb}` : '';
  return tpl
    .replace(/\{\{journaliste\}\}/g, data.journalist)
    .replace(/\{\{sujet\}\}/g, data.subject)
    .replace(/\{\{secteur\}\}/g, sectorStr)
    .replace(/\{\{qa\}\}/g, data.qa)
    .replace(/\{\{flags\}\}/g, data.flags || 'aucun')
    .replace(/\{\{kb\}\}/g, kbStr);
}
```

---

## 9. Prompt de génération des questions

```typescript
// lib/api.ts — buildGenerationPrompt()

function buildGenerationPrompt(config: AppConfig): string {
  const { journalist, subject, sector, doc, questionCount } = config;
  
  return [
    `Tu es un générateur de questions d'interview critique. Tu incarnes ce journaliste :`,
    ``,
    journalist,
    ``,
    `SUJET : ${subject}`,
    sector ? `SECTEUR : ${sector}` : null,
    ``,
    `DOCUMENT :`,
    doc.substring(0, 12000),
    ``,
    `RÈGLES :`,
    `1. Organise en 5-6 sections thématiques, de la plus létale à la moins létale`,
    `2. Génère exactement ${questionCount} questions au total, réparties entre les sections`,
    `3. Chaque question : 3 choix A/B/C. Option D libre disponible.`,
    `4. Chaque option peut avoir un flag (string snake_case identifiant le risque, ou null)`,
    `5. Chaque option a un feedback du journaliste (direct, factuel, incisif, jamais complaisant)`,
    `6. Identifie : promesses invérifiables, risques juridiques, angles morts techniques, concurrence, viabilité`,
    `7. La base de connaissances liste les faits vérifiés pertinents`,
    ``,
    `RETOURNE UNIQUEMENT du JSON valide, sans balises markdown, sans texte avant ou après :`,
    `{`,
    `  "journalist_name": "Nom court",`,
    `  "journalist_intro": "Phrase d'ouverture spécifique au sujet",`,
    `  "knowledge_base": "Faits clés à vérifier (tirets)",`,
    `  "sections": [{"id":"A","label":"Titre","intro":"Intro section"}],`,
    `  "questions": [{"id":1,"sec":"A","tag":"#tag","q":"Question ?","opts":["A","B","C"],"flags":{"A":"risque_x","B":null,"C":null},"fb":{"A":"Feedback A","B":"Feedback B","C":"Feedback C"}}]`,
    `}`
  ].filter(Boolean).join('\n');
}
```

---

## 10. Cloudflare Worker (proxy API)

```typescript
// apps/worker/src/index.ts

export interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;  // URL du frontend en prod
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS
    const origin = request.headers.get('Origin') || '';
    const isAllowed = origin === env.ALLOWED_ORIGIN || 
                      origin.includes('localhost') || 
                      origin.includes('pages.dev');
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': isAllowed ? origin : env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Forward vers Anthropic
    const body = await request.json();
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  },
};
```

**`wrangler.toml` :**
```toml
name = "vasseur-interview-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
ALLOWED_ORIGIN = "https://vasseur-interview.pages.dev"

# ANTHROPIC_API_KEY à mettre via : wrangler secret put ANTHROPIC_API_KEY
```

**Appel depuis le frontend (`lib/api.ts`) :**
```typescript
const WORKER_URL = import.meta.env.VITE_WORKER_URL; // défini dans .env

async function callAnthropic(payload: {
  model: string;
  max_tokens: number;
  messages: { role: string; content: string }[];
}): Promise<string> {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return data.content.map((c: any) => c.text || '').join('');
}
```

---

## 11. Variables d'environnement

**Frontend (`apps/web/.env.local`) :**
```
VITE_WORKER_URL=http://localhost:8787   # dev local
```

**Frontend (`apps/web/.env.production`) :**
```
VITE_WORKER_URL=https://vasseur-interview-api.workers.dev
```

**Worker (secret Cloudflare, jamais dans le code) :**
```
ANTHROPIC_API_KEY=sk-ant-...
```

---

## 12. Déploiement

### Cloudflare Pages (frontend)
```bash
# Build
cd apps/web && pnpm build

# Deploy via CLI ou connecter le repo GitHub dans le dashboard Cloudflare Pages
# Build command : pnpm run build
# Build output : dist/
# Root directory : apps/web
```

### Cloudflare Worker (proxy)
```bash
cd apps/worker
wrangler secret put ANTHROPIC_API_KEY   # entrer la clé interactivement
wrangler deploy
```

### Liaison Pages ↔ Worker
Dans le dashboard Cloudflare Pages → Settings → Functions → ajouter un binding KV ou simplement laisser le Worker être appelé par URL depuis le frontend.

---

## 13. Points d'attention et règles de dev

1. **Jamais la clé API dans le frontend.** Toutes les requêtes Anthropic passent par le Worker.

2. **Parsing JSON robuste.** La réponse de l'API peut contenir des balises markdown ` ```json ` autour du JSON. Toujours stripper avant `JSON.parse()`. Si le parse échoue, afficher l'erreur et revenir à ConfigScreen.

3. **max_tokens par type d'appel :**
   - Génération des questions : `8000`
   - Rendus (analyse, article, vérif) : `2000`

4. **Pas de React Router** si l'application est mono-page sans besoin de deep-linking. Utiliser uniquement le state `screen` du store Zustand pour la navigation entre écrans. Router optionnel si on veut des URLs propres.

5. **Accessibilité minimale :** labels sur tous les inputs, boutons avec texte lisible, contraste suffisant (vérifier avec la palette définie).

6. **Responsive :** L'app doit être utilisable sur tablette. Sur mobile < 640px, les `ModelSelector` passent en colonne, les boutons d'action s'empilent.

7. **UX loading :** Le message de chargement tourne toutes les 3,5 secondes pendant la génération. Ne pas bloquer le thread UI.

8. **Presets localStorage :** Clé `vasseur_presets`, format `Preset[]`. Entourer tous les accès d'un try/catch (localStorage peut être bloqué en navigation privée).

9. **Export markdown :** Utiliser `URL.createObjectURL(new Blob([content], { type: 'text/markdown' }))` pour le téléchargement côté client. Pas de dépendance externe nécessaire.

10. **Gestion de l'état templates :** Quand l'utilisateur navigue vers TemplatesScreen et modifie un template, les changements sont dans le store. Le bouton "Retour" sauvegarde le template actif avant de naviguer. "Réinitialiser" restore le DEFAULT_TEMPLATES pour le template actif uniquement.

---

## 14. Ordre de développement suggéré

1. Setup monorepo pnpm + Vite + Tailwind + Zustand
2. Worker Cloudflare — proxy basique, tester avec `wrangler dev`
3. Design system — composants UI (`Button`, `Card`, `Chip`, `Spinner`, `ModelSelector`)
4. `ConfigScreen` — formulaire complet + validation
5. `LoadingScreen` + intégration API génération questions
6. `InterviewScreen` — moteur de questions complet
7. `SynthesisScreen` — synthèse + 3 boutons de rendu
8. `TemplatesScreen` — éditeur + system de presets
9. Export markdown
10. Tests manuels end-to-end
11. Deploy Cloudflare Pages + Worker

---

## 15. Comportements UX à reproduire fidèlement

- **VasseurCard** : mise à jour du texte à chaque nouvelle section de l'interview (texte d'intro de section) et lors des transitions d'écran (synthèse, config des templates).
- **KnowledgeBaseCard** : affichée en haut de l'InterviewScreen, repliable, visible uniquement si `knowledge_base` non vide.
- **SectionBanner** : visible uniquement au premier affichage d'une section, disparaît à la question suivante dans la même section.
- **FeedbackCard** : animée (fade-in), couleur selon type (ok/warn/flag), chips des flags en rouge.
- **Bouton "Question suivante →"** : visible uniquement après confirmation, pas avant.
- **Badge modèle** dans le header : affiche "SONNET" ou "OPUS" en rouge selon le modèle de génération.
- **Titre dans le header** : tronqué à 48 caractères avec ellipse si le sujet est long.
