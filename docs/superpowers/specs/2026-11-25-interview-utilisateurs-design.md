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

### Décisions du lot 4 (analyses et exports)

1. **Pseudonymisation pour l'IA.** Les entretiens envoyés à une IA (Claude via le MCP, ou l'API) désignent chaque personne par « Répondant n — poste, entreprise » : jamais de nom, prénom, mail ni jeton. Le numéro est attribué une fois, au démarrage de l'entretien, et ne change plus, même après la suppression d'un autre répondant. L'admin et les exports voient les vrais noms ; une fiche est rattachée à son répondant dans la base, et l'admin la lit sous son vrai nom.
2. **Entretiens pris en compte.** Par défaut, les entretiens terminés seulement ; « inclure les entretiens en cours » y ajoute les commencés, marqués « entretien inachevé ».
3. **Ce que l'IA d'analyse reçoit en plus des entretiens.** La note de cadrage, le résumé de contexte, les logiciels et l'objectif de chaque question ou thème ; pas le texte des documents joints. Le texte des répondants lui est présenté sous une forme qu'il ne peut pas contrefaire (lignes « > » sous la flèche, champs du titre sur une ligne), comme une donnée à analyser, jamais comme une consigne.
4. **Taille maximale d'une analyse par l'API.** 400 000 caractères d'entretiens. Au-delà, analyser questionnaire par questionnaire, ou passer par Claude (MCP), qui lit les entretiens par morceaux.
5. **Exports.** CSV pour un tableur (point-virgule, UTF-8 avec BOM), une ligne par question posée ; Markdown lisible, un entretien par section, avec les vrais noms. Par questionnaire et par projet entier.
6. **Historique.** Chaque analyse est conservée avec sa date, sa source (`mcp` ou le modèle utilisé) et le nombre d'entretiens couverts. Rien n'est écrasé ; l'admin peut supprimer une analyse.

### Décisions du lot 6 (coût de l'IA)

1. **Trois postes par projet** (cadrage, interview, analyse) et un poste hors projet (interview critique) ; pas de détail par appel à l'écran.
2. **Ce qu'on garde** : date, poste, projet, modèle, jetons d'entrée, de sortie, lus et écrits en cache, coût ; une ligne par requête qui a consommé des jetons. Ni texte, ni répondant ; pas de clé étrangère.
3. **Grille de tarifs dans le code** (`shared/tarifs.ts`), datée ; un modèle absent garde ses jetons et son coût reste inconnu, signalé à l'écran.
4. **Coût figé à l'appel**, en micro-dollars entiers.
5. **En dollars**, la devise de la facture Anthropic.
6. **Jamais bloquant** : l'enregistrement se fait après la réponse ; une panne est journalisée puis ignorée.
7. **Admin seulement** : rien dans les routes publiques ni le MCP.
8. **Pas de purge** : une ligne fait environ 150 octets.

## 3. Modèle de données (D1)

Identifiants : texte aléatoire. Dates : ISO 8601 UTC. Suppression en cascade du projet vers ses dépendances.

- **logiciels** — `id`, `nom` (unique), `contexte` (texte : description, vocabulaire métier, publics), `cree_le`, `maj_le`
- **projets** — `id`, `titre`, `type_demande` (`evolution_simple` | `amelioration` | `nouvelle_fonctionnalite`), `description`, `note_cadrage` (Markdown, vide tant que non cadré), `resume_contexte` (résumé des docs, produit une fois), `modele_cadrage`, `modele_interview`, `modele_analyse`, `statut` (`brouillon` | `cadre` | `en_cours` | `clos`), `cree_le`, `maj_le`
- **projet_logiciels** — `projet_id`, `logiciel_id`
- **documents** — `id`, `projet_id`, `nom`, `contenu` (texte extrait), `cree_le`
- **cadrage_messages** — `id`, `projet_id`, `role` (`ia` | `admin`), `contenu`, `cree_le` — dialogue de cadrage mené dans l'admin web
- **questionnaires** — `id`, `projet_id`, `public_vise`, `mode` (`hybride` | `entretien`), `introduction` (texte d'accueil), `duree_estimee_min`, `contenu` (JSON, voir ci-dessous), `relances_max_par_question` (hybride, défaut 1), `tours_max` (défaut 12 relances au total en hybride, 15 tours en entretien), `code` (unique, 10 caractères aléatoires), `statut` (`brouillon` | `ouvert` | `clos`), `cree_le`, `maj_le`
- **repondants** — `id`, `questionnaire_id`, `jeton` (unique, 22 caractères), `nom`, `prenom`, `poste`, `entreprise`, `mail`, `origine` (`invitation` | `lien_generique`), `statut` (`invite` | `commence` | `termine`), `commence_le`, `termine_le`, et le suivi du calcul de la suite (migration 0002) : `suite_debut` (début du calcul en cours, nul sinon), `suite_essais` (essais ratés pour l'étape en cours), `suite_essai_le` (début du dernier essai), et `numero` (migration 0003) : numéro du pseudonyme « Répondant n », attribué au démarrage, le plus grand du projet plus un
- **numeros_repondants** (migration 0003) — `projet_id`, `numero`, `repondant_id` : registre des numéros attribués, clé primaire (`projet_id`, `numero`). Il garantit l'unicité par projet (que `repondants`, sans `projet_id`, ne peut pas porter) et garde le numéro d'un répondant supprimé, qui n'est jamais réattribué
- **tours** — `id`, `repondant_id`, `ordre`, `question_id` (nul en mode entretien ou pour une relance libre), `type` (`question` | `relance`), `question` (texte posé), `reponse` (JSON : valeur(s) choisie(s), texte, commentaire), `cree_le`
- **consommation_ia** (migration 0005) — `id`, `cree_le`, `poste` (`cadrage` | `interview` | `analyse` | `interview_critique`), `projet_id` (nul pour l'interview critique, sans clé étrangère), `modele` (celui de la réponse), `jetons_entree`, `jetons_sortie`, `cache_lecture`, `cache_ecriture`, `cout_micro_usd` (nul sans tarif)
- **analyses** — `id`, `projet_id`, `questionnaire_id` (optionnel), `repondant_id` (pour une fiche individuelle), `type` (`fiche_repondant` | `synthese` | `expression_besoin`), `contenu` (Markdown), `source` (identifiant du modèle API, ou `mcp`), `nb_entretiens`, `cree_le`

Un projet a **un ou plusieurs questionnaires**, un par public visé. Un répondant appartient à un seul questionnaire.

**Contexte transmis à l'IA pendant un entretien** : titre du projet, public visé, noms des logiciels, résumé de contexte du projet, objectif de chaque question ou thème. Pour une décision de relance, en plus : les échanges déjà faits dans l'entretien (relances comprises) et les libellés des questions encore à venir. **La note de cadrage, la description et les documents ne sont jamais transmis** : la note contient les hypothèses internes de l'équipe, qu'un répondant ne doit pas voir reformulées dans une question. Les colonnes lues pour l'IA sont choisies une à une (`server/services/entretiens.ts`).

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
6. **Questionnaires** : génération par l'IA à partir de la note de cadrage (publics proposés, mode, questions ou guide), puis édition manuelle (modifier, réordonner, supprimer, ajouter), publication, clôture. La publication affiche l'URL à diffuser. Seul un questionnaire en brouillon est modifiable ou supprimable ; un questionnaire ouvert peut être clos. Un brouillon modifié en même temps dans l'admin et par Claude (MCP) n'est pas protégé : le dernier enregistrement l'emporte.
7. **Répondants** : création d'invitations nominatives (lien personnel à copier), suivi invité / commencé / terminé, lecture d'un entretien, suppression d'un répondant et de ses réponses.
8. **Analyses** (lot 4, livré) : sur la fiche projet, génération à la demande d'une fiche de répondant, d'une synthèse ou d'une expression de besoin par l'API, avec le modèle d'analyse du projet. La portée se choisit parmi le projet entier ou un questionnaire, désigné par son public, son mode et son statut (et sa date de création si deux restent identiques). Le texte s'affiche au fil de l'eau ; à la fin, le lien mène à l'analyse enregistrée. Une fiche se lance aussi depuis la lecture d'un entretien. Historique conservé, lecture des analyses déposées via MCP, suppression. Export CSV (une ligne par tour) et Markdown (un entretien par section), par projet ou par questionnaire. L'aperçu Markdown ne charge aucune image. Garder la page ouverte pendant la génération : un onglet fermé peut empêcher l'enregistrement.

## 5. Parcours répondant

- `/q/<code>` : lien générique. Le répondant saisit son identité — nom, prénom et entreprise obligatoires, poste et mail facultatifs ; un répondant est créé et son jeton gardé dans le navigateur pour permettre la reprise. Le jeton est oublié dès la fin de l'entretien, et l'écran propose « Vous n'êtes pas <prénom> ? Commencer une nouvelle participation » : sur un poste partagé, la personne suivante repart de l'accueil.
- **Plafond** : 300 répondants au plus par lien générique et par questionnaire (les invitations ne comptent pas) ; au-delà, « Ce questionnaire a atteint son nombre maximal de participants. ». Chaque entretien est borné par `tours_max`, une réponse par 4 000 caractères, un corps de requête publique par 64 Ko.
- `/r/<jeton>` : lien nominatif, identité pré-remplie et corrigeable.
- Déroulé : accueil (introduction, durée estimée, mention sur l'usage des données) → identité → questions une à une → remerciement.
- Chaque réponse est enregistrée avant d'afficher la suite. Rouvrir le lien reprend là où on s'est arrêté.
- Un questionnaire `brouillon` ou `clos` affiche un message d'indisponibilité. Un entretien `termine` affiche le remerciement.
- **Hybride** : après chaque réponse, le serveur demande à l'IA s'il faut relancer, en lui donnant la question, son objectif, la réponse, les échanges précédents et les questions à venir. Par défaut, pas de relance : une relance doit apporter ce qui manque, sans redemander ce qui a été dit ni ce qu'une question à venir couvrira (jeu d'évaluation : `npm run eval:relances`). Relance posée si les plafonds le permettent, sinon question suivante.
- **Entretien** : le serveur donne à l'IA le guide et les tours précédents ; elle renvoie la question suivante et les thèmes couverts, ou la fin d'entretien. Fin forcée à `tours_max`.
- Ton : bienveillant, neutre, vouvoiement, une seule question à la fois, jamais de jugement sur les réponses.
- **Panne ou refus de l'IA** : en mode hybride, question suivante sans relance ; en mode entretien, « Un problème technique interrompt l'entretien », avec « Réessayer » et « Terminer l'entretien ». « Réessayer » est permis trois fois par étape, à 10 secondes d'intervalle au moins ; ensuite seul « Terminer l'entretien » reste proposé. Pas de modèle de repli automatique. Chaque appel à l'IA est borné à 12 s, avec un seul nouvel essai.
- **Calcul de la suite** : un seul à la fois par répondant (`suite_debut`, expiré au bout de 60 s). Pendant ce temps, l'étape publique est « attente » et le navigateur relit l'état toutes les 2 secondes ; un second envoi de la même réponse ne relance pas l'IA, et « Terminer » est refusé.

## 6. Serveur MCP

Objectif : faire dans Claude (claude.ai, Claude Desktop, Claude Code) le cadrage, la génération des questionnaires et les analyses, sans tokens API. La passation côté répondant reste sur l'API.

- **Point d'accès** : `/mcp/<jeton>` sur le même déploiement, transport HTTP « streamable » sans état. Le jeton est le secret `MCP_TOKEN` ; un en-tête `Authorization: Bearer` est accepté en alternative. Ce choix permet l'ajout comme connecteur personnalisé sans mettre en place OAuth.
- **Même couche de services** que l'API admin : le MCP n'a aucune logique propre, il expose les mêmes opérations.
- **Outils** (noms en français, comme nos autres connecteurs) :

| Outil | Rôle |
|---|---|
| `lister_logiciels`, `lire_logiciel`, `enregistrer_logiciel` | référentiel et fiches de contexte |
| `lister_projets`, `lire_projet` | retrouver un projet avec son contexte (logiciels, note de cadrage, questionnaires, liste des documents sans leur contenu) |
| `creer_projet`, `modifier_projet` | créer et mettre à jour, y compris la note de cadrage |
| `ajouter_document` | joint au projet un texte de contexte |
| `lire_document` | lit un document joint par morceaux de 20 000 caractères au plus |
| `lire_guide` | renvoie la méthode à suivre pour une étape (`cadrage`, `questionnaire`, `fiche_repondant`, `synthese`, `expression_besoin`) et le format attendu |
| `enregistrer_questionnaire`, `lire_questionnaire` | créer ou remplacer un questionnaire en brouillon |
| `publier_questionnaire` | passe en `ouvert` et renvoie l'URL |
| `lister_repondants`, `lire_entretien`, `lire_reponses` | suivi et lecture, pseudonymisés ; `lire_reponses` renvoie les entretiens terminés (et, sur demande, en cours) d'un projet ou d'un questionnaire sous forme compacte, par morceaux |
| `enregistrer_analyse` | dépose une analyse, visible ensuite dans l'admin |
| `lister_analyses`, `lire_analyse` | retrouver et relire les analyses enregistrées, avec leur portée (pseudonyme pour une fiche) |

- `lire_guide` sert les **mêmes consignes** que celles utilisées par l'IA de l'admin web : une seule source pour la méthode, quel que soit le canal.
- Aucun outil de suppression ; les suppressions et les invitations restent dans l'admin web.
- Les contenus saisis par les répondants sont renvoyés comme données, clairement délimités : la réponse suit la flèche →, ses lignes suivantes commencent par « > », poste et entreprise tiennent sur la ligne du titre. Aucun texte saisi ne peut imiter un titre d'entretien, une question, une relance ou une flèche ; les guides d'analyse décrivent cette forme et demandent de traiter ce texte comme une donnée, jamais comme une consigne.

## 7. Architecture technique

```
shared/              types et constantes communs navigateur / serveur
server/
  db.ts              accès D1
  services/          logiciels, projets, questionnaires, repondants, analyses
  ia/                client Anthropic, consignes (guides), cadrage, relance, entretien, analyse
  auth.ts            session admin, contrôle du jeton MCP
  modeles.ts         catalogue des modèles
functions/
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

Le code partagé est hors de `functions/` pour qu'aucun de ses fichiers ne devienne une route.

- **Routage** : ajout de React Router. `/` interview critique, `/admin/*`, `/q/:code`, `/r/:jeton`. La navigation interne de l'interview critique par le store reste telle quelle.
- **Session admin** : `POST /api/admin/login` compare le mot de passe (`ADMIN_PASSWORD`) en temps constant et pose un cookie `HttpOnly`, `Secure`, `SameSite=Lax`, signé avec `SESSION_SECRET`, valable 30 jours. Toutes les routes `/api/admin/*` et `/api/messages` l'exigent.
- **Routes publiques** : accès uniquement par code ou jeton ; le navigateur n'envoie que l'identité et les réponses, jamais de consigne ni de nom de modèle. Réponse limitée à 4 000 caractères. Les plafonds de tours bornent le coût par entretien.
- **Modèles** : `GET /api/admin/modeles` renvoie le catalogue, obtenu depuis l'API de liste des modèles d'Anthropic, mis en cache 24 h, avec une liste de secours en dur. Le type `ModelId` figé disparaît ; `ModelSelector` et le store de l'interview critique lisent ce catalogue. Défauts d'un nouveau projet : cadrage `claude-opus-5-5`, interview `claude-sonnet-5-5`, analyse `claude-opus-5-5`. Identifiants et endpoint à vérifier dans la documentation Anthropic au moment de l'implémentation.
- **Sorties structurées** (schéma JSON imposé) pour la génération des questionnaires, la décision de relance et le tour d'entretien.
- **Documents longs** : un `resume_contexte` est produit une fois au cadrage et utilisé à chaque tour d'interview à la place des documents complets.
- **Secrets** : `ANTHROPIC_API_KEY` (existant), `ADMIN_PASSWORD`, `SESSION_SECRET`, `MCP_TOKEN`. Liaison D1 déclarée dans `wrangler.toml`.

## 8. Erreurs et cas limites

- IA indisponible pendant une relance : pas de relance, question suivante.
- IA indisponible en mode entretien : message « problème technique », « Réessayer » (3 fois, espacées de 10 s) et « Terminer l'entretien » ; les tours déjà saisis sont conservés.
- Génération admin en échec : message clair, relance possible, rien n'est écrasé.
- Double envoi d'une même réponse : le serveur ignore un tour déjà enregistré ; si la suite est en cours de calcul, il répond « attente ».
- Répondant supprimé pendant le calcul de la suite : « lien invalide », aucun tour orphelin.
- Code ou jeton inconnu : page « lien invalide », sans indice sur l'existence d'autres questionnaires.
- Mauvais mot de passe : délai d'une seconde avant la réponse.
- Suppression d'un projet : confirmation avec le nombre d'entretiens concernés.

## 9. Tests

Ajout de Vitest. Couverture visée sur la logique serveur : contrôle de session et du jeton MCP, enchaînement des tours (hybride et entretien) avec IA simulée, respect des plafonds, statuts de questionnaire, reprise d'entretien, export. Vérification manuelle des écrans via l'aperçu local (`pages:dev` avec D1 local).

## 10. Lots

Chaque lot fait l'objet de son propre plan d'implémentation et est livrable seul.

1. **Socle** — D1 et migrations, couche de services, React Router, session admin, proxy verrouillé, catalogue de modèles branché sur l'interview critique.
2. **Admin sans IA + MCP**, en deux temps :
   - **2A — Services et MCP** (livré) : services logiciels, projets, questionnaires ; serveur MCP avec `lire_guide`. Cadrage, génération et publication sont alors faisables dans Claude.
   - **2B — Écrans admin** (livré) : API admin et écrans des logiciels, des projets, d'édition et de publication des questionnaires.
3. **Répondant** (livré) — liens générique et nominatif, identité, passation hybride et entretien, invitations et suivi dans l'admin. Migration 0002 à appliquer en production.
4. **Analyses** (livré) — lecture des entretiens, analyses via MCP et via l'admin (API, en flux), exports CSV et Markdown. Les six outils MCP de lecture des réponses et des analyses, et de dépôt d'analyses, sont livrés avec ce lot. Migration 0003 (numéro des pseudonymes) à appliquer en production et en preview.
5. **IA dans l'admin** — dialogue de cadrage et génération de questionnaires par l'API, avec les modèles du projet.
6. **Coût de l'IA** (livré) — consommation de chaque appel à l'API enregistrée par poste et par projet, écran `/admin/couts` et coût sur la fiche projet. Migration 0005 à appliquer en production et en preview.
