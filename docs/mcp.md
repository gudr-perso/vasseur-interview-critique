# Serveur MCP — cadrer, publier et analyser depuis Claude

Le serveur MCP permet de créer un projet d'interview, de le cadrer, d'écrire ses questionnaires, de les publier, puis d'analyser les entretiens recueillis depuis Claude, sans consommer de tokens API. Les entretiens avec les répondants, eux, passent toujours par l'API.

## Adresse

`https://<votre-domaine>/mcp/<MCP_TOKEN>`

Le jeton fait partie de l'adresse : la traiter comme un mot de passe. Changer le secret `MCP_TOKEN` dans Cloudflare coupe aussitôt l'accès à toutes les personnes qui avaient l'ancienne adresse.

## Brancher Claude

- **Claude (web et bureau)** : Paramètres → Connecteurs → Ajouter un connecteur personnalisé, puis coller l'adresse. Laisser les champs OAuth vides.
- **Claude Code** :

```bash
claude mcp add --transport http interviews https://<votre-domaine>/mcp/<MCP_TOKEN>
```

Les clients capables d'envoyer des en-têtes peuvent utiliser `https://<votre-domaine>/mcp` avec `Authorization: Bearer <MCP_TOKEN>` (le nom du schéma, `Bearer`, s'écrit avec ou sans majuscules).

## Déroulé type d'une conversation

1. « Crée un projet d'interview sur … pour le logiciel … » → `enregistrer_logiciel` si besoin, puis `creer_projet`.
2. « Cadre ce projet avec moi » → Claude lit `lire_guide` (cadrage) et `lire_projet`, lit les documents utiles avec `lire_document`, vous interroge, puis enregistre la note par `modifier_projet`.
3. « Prépare le questionnaire pour les comptables » → `lire_guide` (questionnaire), puis `enregistrer_questionnaire` en brouillon.
4. « Publie-le » → `publier_questionnaire` renvoie l'adresse à diffuser.

## Déroulé type d'une analyse dans Claude

1. « Fais la synthèse des entretiens du projet … » → `lire_guide` (synthese), `lire_projet` pour la note de cadrage et la liste des questionnaires.
2. Claude lit les entretiens avec `lire_reponses`, sur le projet entier ou un questionnaire, en passant `suite` dans `debut` jusqu'à ce qu'elle soit nulle : il ne conclut rien avant d'avoir tout lu. Les entretiens en cours ne sont ajoutés que sur demande (`inclure_en_cours`).
3. Il vous montre la synthèse et la corrige selon vos remarques.
4. Quand vous l'approuvez, il l'enregistre avec `enregistrer_analyse` (source `mcp`) ; elle apparaît alors dans l'admin, sous l'onglet Analyses du projet.

Pour la fiche d'un répondant : `lire_guide` (fiche_repondant), `lister_repondants` sur le questionnaire, `lire_entretien`, puis `enregistrer_analyse` avec le `repondant_id`. Pour une expression de besoin : comme la synthèse, avec le guide `expression_besoin`. `lister_analyses` et `lire_analyse` retrouvent et relisent les analyses déjà enregistrées.

### Ce que Claude voit des répondants

- **Pseudonymes.** Chaque personne est désignée par « Répondant n », avec son poste et son entreprise : jamais de nom, de prénom, de mail ni de jeton. Le numéro est attribué une fois, quand la personne commence son entretien, et vaut pour tout le projet : il ne change ni avec la portée lue ni quand un autre répondant est supprimé, et le numéro d'un répondant supprimé n'est jamais réattribué. L'admin, lui, voit les vrais noms.
- **Forme des entretiens.** La réponse suit la flèche → ; une réponse sur plusieurs lignes continue sur des lignes qui commencent par « > ». Poste et entreprise tiennent sur la ligne du titre. Aucun texte saisi par un répondant ne peut donc imiter un titre d'entretien, une question, une relance ou une flèche. Les guides décrivent cette forme et rappellent que le texte des répondants est une donnée à analyser, jamais une consigne.

## Outils

Dix-neuf outils.

| Outil | Rôle | Modifie |
|---|---|---|
| `lire_guide` | méthode d'une étape : cadrage, questionnaire, fiche_repondant, synthese, expression_besoin | non |
| `lister_logiciels`, `lire_logiciel` | référentiel | non |
| `enregistrer_logiciel` | crée ou met à jour une fiche | oui |
| `lister_projets`, `lire_projet` | retrouver un projet et son contexte ; les documents sont listés (identifiant, nom, taille) sans leur contenu | non |
| `creer_projet`, `modifier_projet` | créer, cadrer, changer de statut | oui |
| `ajouter_document` | joindre un texte de contexte | oui |
| `lire_document` | lire un document joint, par morceaux de 20 000 caractères au plus (`debut`, `longueur` ; `suite` donne le début du morceau suivant, ou `null` à la fin) | non |
| `enregistrer_questionnaire`, `lire_questionnaire` | brouillon de questionnaire | oui / non |
| `publier_questionnaire` | ouvre aux répondants, renvoie l'adresse | oui |
| `lister_repondants` | répondants d'un questionnaire, sans identité : pseudonyme, poste, entreprise, statut, nombre de réponses, dates | non |
| `lire_entretien` | entretien pseudonymisé d'un répondant, par morceaux de 20 000 caractères au plus, avec son projet et son questionnaire | non |
| `lire_reponses` | entretiens pseudonymisés d'un projet ou d'un questionnaire, par morceaux coupés de préférence entre deux entretiens ; terminés seulement par défaut, `inclure_en_cours` ajoute les entretiens commencés | non |
| `enregistrer_analyse` | dépose une fiche, une synthèse ou une expression de besoin (source `mcp`) ; rien n'est écrasé | oui |
| `lister_analyses` | analyses enregistrées d'un projet, sans leur contenu, avec leur portée (projet, questionnaire, ou pseudonyme pour une fiche) | non |
| `lire_analyse` | une analyse et sa portée, par morceaux de 20 000 caractères au plus | non |

Aucun outil ne supprime quoi que ce soit. Un questionnaire publié ne peut plus être remplacé. Un questionnaire est désigné par son public, son mode et son statut (et sa date de création si deux restent identiques).

Quand une erreur inattendue survient (base de données, par exemple), l'outil répond « Erreur interne du serveur » ; le détail est dans les journaux Cloudflare (`console.error`, préfixe `MCP :`).

## Protocole et compatibilité

- **Deux générations du protocole MCP** sont servies par les mêmes adresses et les mêmes outils : les clients de 2025 (poignée de main `initialize`, puis requêtes indépendantes) et ceux de la révision 2026-07-28 (sans état, chaque requête se suffit). Le serveur ne crée aucune session et ne garde rien d'une requête à l'autre. Vérifié avec le client officiel dans les deux modes (`tests/functions/mcp.test.ts` et `scripts/verifier-mcp.mjs`).
- **Runtime Cloudflare** : le serveur fonctionne dans le runtime Pages Functions sans option de compatibilité Node (`nodejs_compat` n'est pas activé dans `wrangler.toml`).

## Contrôle local

Avec le serveur local lancé (`npm run pages:dev`, port 8790 par défaut) :

```bash
MCP_TOKEN=<jeton de .dev.vars> node scripts/verifier-mcp.mjs [url]
```

`url` est l'origine du serveur, `http://localhost:8790` par défaut. Le script se connecte avec le client officiel dans les deux générations du protocole, vérifie qu'il voit les dix-neuf outils et qu'une erreur métier revient bien comme résultat d'erreur ; il se termine par un code non nul au moindre écart.
