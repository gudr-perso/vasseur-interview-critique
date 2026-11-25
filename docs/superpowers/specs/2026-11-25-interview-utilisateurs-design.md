# Interview utilisateurs — design

Date : 2026-11-25 · Statut : design validé, en attente de relecture de la spec

## 1. But

Ajouter à l'application un second mode, à côté de l'interview critique « Vasseur » : un outil réutilisable pour interviewer des utilisateurs (comptables, animateurs terrain, etc.) dans le cadre de projets d'évolution ou de nouvelle fonctionnalité sur nos logiciels.

L'outil doit permettre de :

- définir un projet et son cadre, le mémoriser et le retrouver ;
- rattacher le projet à un ou plusieurs de nos logiciels ;
- se faire interroger par l'IA pour cadrer la demande, plus ou moins longuement selon sa complexité ;
- produire un ou plusieurs questionnaires, chacun avec une URL dédiée ;
- faire passer l'interview à des répondants sans login, en mémorisant nom, prénom, poste, entreprise et mail ;
- consulter les réponses et déclencher des analyses ;
- faire le cadrage et l'analyse soit dans l'admin web (API Anthropic), soit dans Claude via un serveur MCP (sans consommer de tokens API).

Hors périmètre : gestion de comptes utilisateurs, envoi de mails d'invitation par l'appli, récupération automatique de la documentation en ligne, multilingue.

## 2. Décisions prises

| Sujet | Décision |
|---|---|
| Place dans l'appli | Même dépôt, même déploiement Cloudflare Pages ; l'interview critique reste à la racine |
| Forme de l'interview | Choisie par questionnaire : **hybride** (tronc commun + relances IA) ou **entretien** conversationnel. Un hybride avec zéro relance donne un questionnaire fixe |
| Accès répondant | Lien générique par questionnaire **et** liens nominatifs pré-remplis |
| Protection admin | Mot de passe unique (secret Cloudflare) |
| Logiciels | Référentiel géré dans l'admin, avec fiche de contexte réutilisable ; docs ajoutables par projet |
| Analyses | Fiche par répondant, synthèse transversale, expression de besoin, export brut |
| Stockage | Cloudflare D1 |
| IA de cadrage et d'analyse | Disponible des deux côtés : admin web (API) et MCP (Claude) |
| Proxy `/api/messages` | Placé derrière le mot de passe admin ; l'interview critique le demande donc aussi |

## 3. Modèle de données (D1)

Identifiants : texte aléatoire. Dates : ISO 8601 UTC. Suppression en cascade du projet vers ses dépendances.

- **logiciels** — `id`, `nom` (unique), `contexte` (texte : description, vocabulaire métier, publics), `cree_le`, `maj_le`
- **projets** — `id`, `titre`, `type_demande` (`evolution_simple` | `amelioration` | `nouvelle_fonctionnalite`), `description`, `note_cadrage` (Markdown, vide tant que non cadré), `resume_contexte` (résumé des docs, produit une fois), `modele_cadrage`, `modele_interview`, `modele_analyse`, `statut` (`brouillon` | `cadre` | `en_cours` | `clos`), `cree_le`, `maj_le`
- **projet_logiciels** — `projet_id`, `logiciel_id`
- **documents** — `id`, `projet_id`, `nom`, `contenu` (texte extrait), `cree_le`
- **cadrage_messages** — `id`, `projet_id`, `role` (`ia` | `admin`), `contenu`, `cree_le` — dialogue de cadrage mené dans l'admin web
- **questionnaires** — `id`, `projet_id`, `public_vise`, `mode` (`hybride` | `entretien`), `introduction` (texte d'accueil), `duree_estimee_min`, `contenu` (JSON, voir ci-dessous), `relances_max_par_question` (hybride, défaut 1), `tours_max` (défaut 12 relances au total en hybride, 15 tours en entretien), `code` (unique, 10 caractères aléatoires), `statut` (`brouillon` | `ouvert` | `clos`), `cree_le`, `maj_le`
- **repondants** — `id`, `questionnaire_id`, `jeton` (unique, 22 caractères), `nom`, `prenom`, `poste`, `entreprise`, `mail`, `origine` (`invitation` | `lien_generique`), `statut` (`invite` | `commence` | `termine`), `commence_le`, `termine_le`
- **tours** — `id`, `repondant_id`, `ordre`, `question_id` (nul en mode entretien ou pour une relance libre), `type` (`question` | `relance`), `question` (texte posé), `reponse` (JSON : valeur(s) choisie(s), texte, commentaire), `cree_le`
- **analyses** — `id`, `projet_id`, `questionnaire_id` (optionnel), `repondant_id` (pour une fiche individuelle), `type` (`fiche_repondant` | `synthese` | `expression_besoin`), `contenu` (Markdown), `source` (identifiant du modèle API, ou `mcp`), `nb_entretiens`, `cree_le`

Un projet a **un ou plusieurs questionnaires**, un par public visé. Un répondant appartient à un seul questionnaire.

### Contenu d'un questionnaire

Mode hybride — liste ordonnée de questions :

```json
{ "questions": [
  { "id": "q1", "type": "choix_unique | choix_multiple | echelle | texte",
    "libelle": "…", "options": ["…"], "objectif": "ce qu'on cherche à apprendre" }
] }
```

`options` n'existe que pour les choix ; `echelle` va de 1 à 5. `objectif` n'est jamais montré au répondant : il sert à l'IA pour juger si une relance est utile. Toute question accepte un commentaire libre facultatif.

Mode entretien — guide :

```json
{ "question_ouverture": "…",
  "themes": [ { "id": "t1", "titre": "…", "objectif": "…" } ] }
```

## 4. Parcours admin (`/admin`)

1. **Connexion** par mot de passe.
2. **Projets** : liste filtrable par logiciel et statut ; création, modification, suppression.
3. **Logiciels** : liste, fiche de contexte.
4. **Fiche projet** : titre, logiciels, type de demande, description, documents (texte collé, `.md`, `.txt`, `.pdf` dont le texte est extrait dans le navigateur), choix des trois modèles.
5. **Cadrage IA** : dialogue question par question.
   - `evolution_simple` : 0 à 3 questions ; aucune si la description suffit.
   - `amelioration` : jusqu'à 6 questions.
   - `nouvelle_fonctionnalite` : jusqu'à 12 questions couvrant objectif, utilisateurs concernés, fonctionnement actuel, contraintes, hors périmètre, hypothèses à vérifier.
   - L'IA s'arrête dès qu'elle a assez ; un bouton « Terminer le cadrage » coupe à tout moment.
   - Résultat : la **note de cadrage**, modifiable à la main.
6. **Questionnaires** : génération par l'IA à partir de la note de cadrage (publics proposés, mode, questions ou guide), puis édition manuelle (modifier, réordonner, supprimer, ajouter), publication, clôture. La publication affiche l'URL à diffuser. Un questionnaire `ouvert` ayant déjà des réponses n'est plus modifiable sur ses questions.
7. **Répondants** : création d'invitations nominatives (lien personnel à copier), suivi invité / commencé / terminé, lecture d'un entretien, suppression d'un répondant et de ses réponses.
8. **Analyses** : génération à la demande, historique conservé, lecture des analyses déposées via MCP, export CSV (une ligne par tour) et Markdown (un entretien par section).

## 5. Parcours répondant

- `/q/<code>` : lien générique. Le répondant saisit nom, prénom, poste, entreprise, mail ; un répondant est créé et son jeton gardé dans le navigateur pour permettre la reprise.
- `/r/<jeton>` : lien nominatif, identité pré-remplie et corrigeable.
- Déroulé : accueil (introduction, durée estimée, mention sur l'usage des données) → identité → questions une à une → remerciement.
- Chaque réponse est enregistrée avant d'afficher la suite. Rouvrir le lien reprend là où on s'est arrêté.
- Un questionnaire `brouillon` ou `clos` affiche un message d'indisponibilité. Un entretien `termine` affiche le remerciement.
- **Hybride** : après chaque réponse, le serveur demande à l'IA s'il faut relancer, en lui donnant la question, son objectif et la réponse. Relance posée si les plafonds le permettent, sinon question suivante.
- **Entretien** : le serveur donne à l'IA le guide et les tours précédents ; elle renvoie la question suivante et les thèmes couverts, ou la fin d'entretien. Fin forcée à `tours_max`.
- Ton : bienveillant, neutre, vouvoiement, une seule question à la fois, jamais de jugement sur les réponses.

## 6. Serveur MCP

Objectif : faire dans Claude (claude.ai, Claude Desktop, Claude Code) le cadrage, la génération des questionnaires et les analyses, sans tokens API. La passation côté répondant reste sur l'API.

- **Point d'accès** : `/mcp/<jeton>` sur le même déploiement, transport HTTP « streamable » sans état. Le jeton est le secret `MCP_TOKEN` ; un en-tête `Authorization: Bearer` est accepté en alternative. Ce choix permet l'ajout comme connecteur personnalisé sans mettre en place OAuth.
- **Même couche de services** que l'API admin : le MCP n'a aucune logique propre, il expose les mêmes opérations.
- **Outils** (noms en français, comme nos autres connecteurs) :

| Outil | Rôle |
|---|---|
| `lister_logiciels`, `lire_logiciel`, `enregistrer_logiciel` | référentiel et fiches de contexte |
| `lister_projets`, `lire_projet` | retrouver un projet avec son contexte complet (logiciels, docs, note de cadrage, questionnaires) |
| `creer_projet`, `modifier_projet` | créer et mettre à jour, y compris la note de cadrage |
| `lire_guide` | renvoie la méthode à suivre pour une étape (`cadrage`, `questionnaire`, `fiche_repondant`, `synthese`, `expression_besoin`) et le format attendu |
| `enregistrer_questionnaire`, `lire_questionnaire` | créer ou remplacer un questionnaire en brouillon |
| `publier_questionnaire` | passe en `ouvert` et renvoie l'URL |
| `lister_repondants`, `lire_entretien`, `lire_reponses` | suivi et lecture ; `lire_reponses` renvoie tous les entretiens terminés d'un projet ou d'un questionnaire sous forme compacte |
| `enregistrer_analyse` | dépose une analyse, visible ensuite dans l'admin |

- `lire_guide` sert les **mêmes consignes** que celles utilisées par l'IA de l'admin web : une seule source pour la méthode, quel que soit le canal.
- Aucun outil de suppression ; les suppressions et les invitations restent dans l'admin web.
- Les contenus saisis par les répondants sont renvoyés comme données, clairement délimités.

## 7. Architecture technique

```
functions/
  _lib/
    db.ts            accès D1
    services/        logiciels, projets, questionnaires, repondants, analyses
    ia/              client Anthropic, consignes (guides), cadrage, relance, entretien, analyse
    auth.ts          session admin, contrôle du jeton MCP
    modeles.ts       catalogue des modèles
  api/
    messages.ts      proxy existant, désormais réservé à la session admin
    admin/…          login, logiciels, projets, cadrage, questionnaires, repondants, analyses, modeles
    public/…         q/[code], r/[jeton] (lecture, identité, réponse)
  mcp/[jeton].ts     serveur MCP
migrations/          schéma D1
src/
  admin/             écrans admin
  repondant/         écrans répondant
  screens/           interview critique existante (inchangée hors sélecteur de modèle)
```

- **Routage** : ajout de React Router. `/` interview critique, `/admin/*`, `/q/:code`, `/r/:jeton`. La navigation interne de l'interview critique par le store reste telle quelle.
- **Session admin** : `POST /api/admin/login` compare le mot de passe (`ADMIN_PASSWORD`) en temps constant et pose un cookie `HttpOnly`, `Secure`, `SameSite=Lax`, signé avec `SESSION_SECRET`, valable 30 jours. Toutes les routes `/api/admin/*` et `/api/messages` l'exigent.
- **Routes publiques** : accès uniquement par code ou jeton ; le navigateur n'envoie que l'identité et les réponses, jamais de consigne ni de nom de modèle. Réponse limitée à 4 000 caractères. Les plafonds de tours bornent le coût par entretien.
- **Modèles** : `GET /api/admin/modeles` renvoie le catalogue, obtenu depuis l'API de liste des modèles d'Anthropic, mis en cache 24 h, avec une liste de secours en dur. Le type `ModelId` figé disparaît ; `ModelSelector` et le store de l'interview critique lisent ce catalogue. Défauts d'un nouveau projet : cadrage `claude-opus-5-5`, interview `claude-sonnet-5-5`, analyse `claude-opus-5-5`. Identifiants et endpoint à vérifier dans la documentation Anthropic au moment de l'implémentation.
- **Sorties structurées** (schéma JSON imposé) pour la génération des questionnaires, la décision de relance et le tour d'entretien.
- **Documents longs** : un `resume_contexte` est produit une fois au cadrage et utilisé à chaque tour d'interview à la place des documents complets.
- **Secrets** : `ANTHROPIC_API_KEY` (existant), `ADMIN_PASSWORD`, `SESSION_SECRET`, `MCP_TOKEN`. Liaison D1 déclarée dans `wrangler.toml`.

## 8. Erreurs et cas limites

- IA indisponible pendant une relance : pas de relance, question suivante.
- IA indisponible en mode entretien : message d'attente et bouton « Réessayer » ; les tours déjà saisis sont conservés.
- Génération admin en échec : message clair, relance possible, rien n'est écrasé.
- Double envoi d'une même réponse : le serveur ignore un tour déjà enregistré.
- Code ou jeton inconnu : page « lien invalide », sans indice sur l'existence d'autres questionnaires.
- Mauvais mot de passe : délai d'une seconde avant la réponse.
- Suppression d'un projet : confirmation avec le nombre d'entretiens concernés.

## 9. Tests

Ajout de Vitest. Couverture visée sur la logique serveur : contrôle de session et du jeton MCP, enchaînement des tours (hybride et entretien) avec IA simulée, respect des plafonds, statuts de questionnaire, reprise d'entretien, export. Vérification manuelle des écrans via l'aperçu local (`pages:dev` avec D1 local).

## 10. Lots

Chaque lot fait l'objet de son propre plan d'implémentation et est livrable seul.

1. **Socle** — D1 et migrations, couche de services, React Router, session admin, proxy verrouillé, catalogue de modèles branché sur l'interview critique.
2. **Admin sans IA + MCP** — logiciels, projets, documents, édition et publication des questionnaires, serveur MCP avec `lire_guide`. À ce stade, cadrage et génération sont déjà faisables dans Claude.
3. **Répondant** — liens générique et nominatif, identité, passation hybride et entretien, invitations et suivi dans l'admin.
4. **Analyses** — lecture des entretiens, analyses via MCP et via l'admin (API), exports.
5. **IA dans l'admin** — dialogue de cadrage et génération de questionnaires par l'API, avec les modèles du projet.
