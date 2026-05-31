# Vasseur Interview — Documentation v1

> Moteur d'interview critique générique — style journalisme d'investigation

---

## Sommaire

1. [Vue d'ensemble](#1-vue-densemble)
2. [Prise en main rapide](#2-prise-en-main-rapide)
3. [Les cinq écrans](#3-les-cinq-écrans)
4. [Détail de l'interview](#4-détail-de-linterview)
5. [Les rendus finaux](#5-les-rendus-finaux)
6. [Configurer les prompts](#6-configurer-les-prompts)
7. [Presets de prompts](#7-presets-de-prompts)
8. [Export Q&A](#8-export-qa)
9. [Choix du modèle](#9-choix-du-modèle)
10. [Installation locale](#10-installation-locale)
11. [Déploiement Cloudflare](#11-déploiement-cloudflare)
12. [Architecture technique](#12-architecture-technique)
13. [Limites connues v1](#13-limites-connues-v1)

---

## 1. Vue d'ensemble

**Vasseur Interview** simule une séance d'interview critique conduite par un journaliste d'investigation fictif — Étienne Vasseur. L'utilisateur fournit un document (pitch deck, business plan, cahier des charges, dossier commercial…) et répond à une série de questions générées dynamiquement par l'IA, adaptées au contenu du document.

### Ce que ça fait

- **Génère** 10 à 100 questions structurées en 5-6 sections thématiques, de la plus létale à la moins létale
- **Conduit** l'interview question par question avec 3 choix fermés (A/B/C) + réponse libre
- **Donne un feedback immédiat** après chaque réponse (neutre, avertissement, risque détecté)
- **Détecte les flags de risque** : juridique, RGPD, crédibilité, absence de clients, modèle solo, chiffres fragiles, etc.
- **Produit des rendus finaux** : analyse critique, article journalistique, vérification factuelle
- **Exporte** le Q&A complet en Markdown

### Pour qui

Porteurs de projets, entrepreneurs, consultants — qui veulent **challenger leur pitch ou dossier** avant une présentation à un jury, un investisseur, ou un client exigeant.

---

## 2. Prise en main rapide

1. **Remplissez le formulaire** de configuration :
   - Le sujet de l'interview (ex : "Levée de fonds Série A")
   - Le secteur / contexte (optionnel)
   - Le contenu du document à analyser (coller le texte)
   - Le nombre de questions souhaité (10 / 25 / 50 / 100)
   - Le modèle IA à utiliser (Sonnet ou Opus)

2. **Cliquez sur "Lancer la préparation →"** — l'IA génère les questions (~20 à 90 secondes)

3. **Répondez aux questions** une par une — choisissez A, B ou C, ou répondez librement dans le champ D

4. **Consultez la synthèse** — les points critiques détectés, puis lancez un rendu final

---

## 3. Les cinq écrans

### Config — Configurer l'interview

Le point d'entrée. Tous les paramètres de la session.

| Champ | Obligatoire | Description |
|-------|-------------|-------------|
| Journaliste | Non | Persona du journaliste. Modifiable pour personnaliser le style des questions. |
| Sujet | **Oui** | Objet de l'interview. Apparaîtra dans le titre et les rendus. |
| Secteur / Contexte | Non | Cadre sectoriel. Affine les questions (ex : "agroalimentaire", "fintech"). |
| Document | **Oui** | Contenu textuel du dossier à analyser. Limité à 12 000 caractères pour le prompt. |
| Nombre de questions | — | 10 / 25 / 50 / 100. Défaut : 25. |
| Modèle | — | Sonnet 4.6 (rapide) ou Opus 4.6 (approfondi). |

> **Astuce :** Le champ "Journaliste" accepte n'importe quel persona. Vous pouvez remplacer Étienne Vasseur par un investisseur VC, un auditeur qualité, ou un expert sectoriel.

---

### Loading — Génération en cours

Écran de chargement pendant que l'IA génère les questions (~20 à 90s selon le modèle). Messages animés toutes les 3,5 secondes.

---

### Interview — Questions / Réponses

L'écran principal. Voir [section 4](#4-détail-de-linterview) pour le détail complet.

---

### Synthesis — Synthèse & Rendus

Bilan de l'interview avec les points critiques détectés. Voir [section 5](#5-les-rendus-finaux).

---

### Templates — Configuration des prompts

Éditeur des prompts pour les 3 types de rendus. Voir [section 6](#6-configurer-les-prompts).

---

## 4. Détail de l'interview

### La base de connaissances

En haut de l'écran, une carte repliable **"Base de connaissances"** liste les faits vérifiables que l'IA a identifiés dans votre document (réglementations, chiffres officiels, réalités du marché). Elle sert de référence pendant l'interview.

### La présentation initiale

Avant Q1, une phase libre : présentez-vous (rôle, légitimité sur le sujet). Obligatoire pour commencer. Enregistrée en Q0 dans l'export.

### Structure d'une question

```
[Q12] [#tag]
Texte de la question ?

[A] Option A
[B] Option B
[C] Option C

D — Réponse libre (facultatif ou à la place d'un choix)
[Confirmer →]
```

- **Sélectionner A, B ou C** : clic sur le bouton. Un deuxième clic sur une autre option change la sélection.
- **Réponse libre (D)** : saisie libre dans le textarea. Peut se combiner avec A/B/C, ou remplacer entièrement.
- **Au moins un des deux** est requis pour confirmer.

### Le feedback

Après confirmation, une carte apparaît :

| Couleur | Signification |
|---------|---------------|
| 🟢 Vert — "Acté." | Réponse neutre, aucun risque détecté |
| 🟡 Orange — "Note" | Réponse libre sans choix fermé |
| 🔴 Rouge — "Risque détecté" | L'option choisie déclenche un flag de risque |

Les **flags** sont des identifiants snake_case (ex : `risque_juridique`, `zero_client`, `promesse_invérifiable`). Ils s'accumulent au fil de l'interview et apparaissent comme des chips rouges.

### Les sections

L'interview est organisée en 5-6 sections thématiques, de la plus critique à la moins critique. Un bandeau doré indique chaque changement de section. La VasseurCard se met à jour avec l'introduction de la nouvelle section.

### Progression

La barre de progression en header indique `question actuelle / total`. Elle ne compte pas la phase d'introduction.

---

## 5. Les rendus finaux

Accessibles depuis l'écran Synthesis après avoir complété toutes les questions.

### Synthèse automatique

Avant les rendus, l'écran affiche les **8 réponses les plus critiques** : celles dont les flags contiennent les mots-clés suivants :

`legal` · `rgpd` · `credibilite` · `zero_client` · `solo` · `chiffres` · `signature` · `vendor` · `positionnement` · `promesse`

Les flags 🚩 (juridique/RGPD) se distinguent des ⚠ (autres risques).

### Analyse critique (Vasseur)

Rédaction journalistique de 300 à 600 mots :
1. Jugement d'ensemble
2. Points solides identifiés
3. Réponses à approfondir (numérotées)
4. Conclusion sans concession

### Rédiger l'article

Article de 600 à 1 200 mots : titre accrocheur, chapeau, corps structuré avec sous-titres, citations reconstituées signalées, conclusion critique.

### Vérifier les faits

Confrontation de 3 à 5 affirmations clés à la réalité factuelle vérifiable. Verdict par affirmation : **confirmé / contesté / invérifiable**.

### Choix du modèle pour les rendus

Indépendant du modèle de génération. Sonnet = rapide, Opus = plus dense et nuancé.

---

## 6. Configurer les prompts

Accessible via **"Configurer les rendus ⚙"** (depuis Config ou Synthesis).

### Trois templates éditables

| Template | Bouton associé |
|----------|---------------|
| Analyse critique | "Analyse critique (Vasseur)" |
| Article | "Rédiger l'article" |
| Vérification faits | "Vérifier les faits" |

### Variables disponibles

Cliquer sur une variable l'insère à la position du curseur dans le textarea actif.

| Variable | Contenu injecté |
|----------|----------------|
| `{{journaliste}}` | Nom + bio complète du journaliste |
| `{{sujet}}` | Sujet de l'interview |
| `{{secteur}}` | Secteur entre parenthèses (vide si non renseigné) |
| `{{qa}}` | Intégralité du Q&A (questions, réponses, flags) |
| `{{flags}}` | Liste des flags déclenchés, séparés par des virgules |
| `{{kb}}` | Base de connaissances générée par l'IA |

### Réinitialiser

Le bouton **"Réinitialiser par défaut"** restaure uniquement le template actif (onglet sélectionné), sans toucher aux deux autres.

---

## 7. Presets de prompts

Système de sauvegarde des templates dans le navigateur (`localStorage`).

### Sauvegarder un preset

1. Modifiez un ou plusieurs templates
2. Donnez un nom dans le champ "Nom du preset…"
3. Cliquez **"Sauvegarder"**

Si un preset du même nom existe, une confirmation est demandée avant écrasement.

### Charger un preset

1. Sélectionnez un preset dans le menu déroulant
2. Cliquez **"Charger"** — les 3 templates sont remplacés en mémoire

### Supprimer un preset

1. Sélectionnez le preset
2. Cliquez **"Supprimer"** — confirmation demandée

> **Note :** Les presets sont stockés dans `localStorage` sous la clé `vasseur_presets`. Ils sont perdus si le cache du navigateur est effacé, ou en navigation privée.

---

## 8. Export Q&A

Bouton **"Export Q&A (.md)"** disponible depuis l'écran Synthesis.

### Contenu du fichier Markdown généré

```
# Interview — [Sujet]
Journaliste / Date / Questions / Modèle

## Présentation
[Réponse libre initiale]

## Réponses
### Section A — [Label]
**Q1** `#tag` — [Question]
- Choix : A — [Texte option A]
- Réponse libre : [...]
- Flags : [flag1, flag2]
- *[timestamp ISO]*

[...]

## Flags globaux
- flag1
- flag2
```

Le fichier est téléchargé directement (`vasseur-YYYY-MM-DD.md`) sans dépendance serveur.

---

## 9. Choix du modèle

### Pour la génération des questions

| Modèle | Temps (~) | Usage conseillé |
|--------|-----------|-----------------|
| **Sonnet 4.6** | 20–30s | Sessions courtes, itérations rapides, 10–25 questions |
| **Opus 4.6** | 60–90s | Due diligence approfondie, 50–100 questions, sujets complexes |

### Pour les rendus

| Modèle | Résultat |
|--------|----------|
| **Sonnet 4.6** | Analyse claire, bien structurée, ~5s |
| **Opus 4.6** | Analyse dense, nuancée, plus chirurgicale, ~15–30s |

Les deux modèles sont indépendants : vous pouvez générer avec Sonnet et rédiger le rendu avec Opus.

### Limites de tokens

- Génération des questions : `max_tokens: 8 000`
- Rendus finaux : `max_tokens: 2 000`
- Document analysé : tronqué à 12 000 caractères

---

## 10. Installation locale

### Prérequis

- Node.js 18+
- npm
- Un compte Cloudflare (pour le proxy API en dev)
- Une clé API Anthropic (`sk-ant-...`)

### Installation

```bash
git clone https://github.com/gudr-perso/vasseur-interview-critique.git
cd vasseur-interview-critique
npm install
```

### Configuration

Créez un fichier `.dev.vars` à la racine (copié depuis `.dev.vars.example`) :

```
ANTHROPIC_API_KEY=sk-ant-votre-cle-ici
```

> `.dev.vars` est dans `.gitignore` — ne jamais le committer.

### Lancer en développement

**Terminal 1** — Frontend avec hot reload :
```bash
npm run dev
# → http://localhost:5173
```

**Terminal 2** — Proxy API (nécessite un build préalable) :
```bash
npm run build
npm run pages:dev
# → http://localhost:8788
```

Le frontend (`.env.local`) pointe automatiquement vers `http://localhost:8788/api/messages`.

---

## 11. Déploiement Cloudflare

### Cloudflare Pages (frontend + API)

1. Dashboard Cloudflare → **Pages** → **Create a project** → **Connect to Git**
2. Sélectionner le repo `vasseur-interview-critique`
3. Paramètres de build :

| Paramètre | Valeur |
|-----------|--------|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |

4. **Settings → Environment Variables** → ajouter :

| Name | Type | Value |
|------|------|-------|
| `ANTHROPIC_API_KEY` | Secret | `sk-ant-...` |

5. **Save and Deploy**

Cloudflare détecte automatiquement le dossier `functions/` et déploie le proxy en même temps que le frontend. Chaque push sur `main` redéploie tout automatiquement.

### URL de production

Le proxy est accessible à `/api/messages` (même domaine que le frontend). Aucune configuration CORS supplémentaire n'est nécessaire.

---

## 12. Architecture technique

### Stack

| Couche | Technologie |
|--------|-------------|
| Frontend | React 18 + Vite + TypeScript |
| State | Zustand 5 |
| Styling | Tailwind CSS v3 + CSS variables |
| Proxy API | Cloudflare Pages Function |
| Hosting | Cloudflare Pages |
| Persistance | localStorage (presets uniquement) |
| IA | Anthropic API — `claude-sonnet-4-6` / `claude-opus-4-6` |

### Structure des fichiers

```
vasseur-interview-critique/
├── index.html                    ← Google Fonts (Playfair Display, IBM Plex)
├── src/
│   ├── types/index.ts            ← Types TypeScript (Question, Answer, Templates…)
│   ├── store/useStore.ts         ← Store Zustand — navigation + état complet
│   ├── lib/
│   │   ├── api.ts                ← callAnthropic(), generateQuestions(), generateOutput()
│   │   ├── templates.ts          ← DEFAULT_TEMPLATES + renderTemplate()
│   │   └── presets.ts            ← CRUD localStorage
│   ├── components/
│   │   ├── ui/                   ← Button, Card, Chip, Spinner, ModelSelector, FeedbackCard
│   │   └── layout/               ← Header, VasseurCard
│   └── screens/
│       ├── ConfigScreen.tsx
│       ├── LoadingScreen.tsx
│       ├── InterviewScreen.tsx
│       ├── SynthesisScreen.tsx
│       └── TemplatesScreen.tsx
└── functions/
    └── api/messages.ts           ← Pages Function — proxy Anthropic API
```

### Flux de navigation

```
ConfigScreen
    │ (submit) → generateQuestions()
    ↓
LoadingScreen
    │ (succès)
    ↓
InterviewScreen ← Q0 intro → Q1…Qn
    │ (fin des questions)
    ↓
SynthesisScreen
    │
    ├── generateOutput() → analyse / article / vérification
    ├── Export .md
    └── reset() → ConfigScreen

ConfigScreen / SynthesisScreen → TemplatesScreen → retour
```

### Sécurité de la clé API

La clé Anthropic n'est **jamais exposée côté client**. Le frontend appelle uniquement `/api/messages` (Pages Function), qui ajoute la clé en header côté serveur avant de forwarder vers `api.anthropic.com`.

---

## 13. Limites connues v1

| Limite | Description |
|--------|-------------|
| **Document tronqué** | Le document est limité à 12 000 caractères dans le prompt de génération. Les documents plus longs sont silencieusement tronqués. |
| **Pas de persistance de session** | L'interview est en mémoire uniquement. Un rechargement de page repart de zéro. |
| **Presets liés au navigateur** | Les presets sont dans `localStorage`. Ils ne se synchronisent pas entre appareils et sont perdus en navigation privée. |
| **JSON fragile** | Si l'API retourne du JSON malformé ou incomplet (rare), une erreur s'affiche et il faut relancer la génération. |
| **Pas de streaming** | Les rendus finaux attendent la réponse complète avant affichage (pas de streaming token par token). |
| **Mobile partiel** | L'app est utilisable sur tablette. Sur mobile < 640px, certains éléments s'empilent correctement, mais l'expérience n'est pas optimisée pour les petits écrans. |
| **Un seul journaliste** | Un seul persona par session. Pas de comparaison multi-journalistes. |

---

*Vasseur Interview v1 — Mai 2026*
