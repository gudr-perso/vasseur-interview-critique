# Serveur MCP — cadrer et publier depuis Claude

Le serveur MCP permet de créer un projet d'interview, de le cadrer, d'écrire ses questionnaires et de les publier depuis Claude, sans consommer de tokens API. Les entretiens avec les répondants, eux, passent toujours par l'API.

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

## Outils

Treize outils.

| Outil | Rôle | Modifie |
|---|---|---|
| `lire_guide` | méthode de cadrage ou de rédaction | non |
| `lister_logiciels`, `lire_logiciel` | référentiel | non |
| `enregistrer_logiciel` | crée ou met à jour une fiche | oui |
| `lister_projets`, `lire_projet` | retrouver un projet et son contexte ; les documents sont listés (identifiant, nom, taille) sans leur contenu | non |
| `creer_projet`, `modifier_projet` | créer, cadrer, changer de statut | oui |
| `ajouter_document` | joindre un texte de contexte | oui |
| `lire_document` | lire un document joint, par morceaux de 20 000 caractères au plus (`debut`, `longueur` ; `suite` donne le début du morceau suivant, ou `null` à la fin) | non |
| `enregistrer_questionnaire`, `lire_questionnaire` | brouillon de questionnaire | oui / non |
| `publier_questionnaire` | ouvre aux répondants, renvoie l'adresse | oui |

Aucun outil ne supprime quoi que ce soit. Un questionnaire publié ne peut plus être remplacé.

Quand une erreur inattendue survient (base de données, par exemple), l'outil répond « Erreur interne du serveur » ; le détail est dans les journaux Cloudflare (`console.error`, préfixe `MCP :`).

## Protocole et compatibilité

- **Deux générations du protocole MCP** sont servies par les mêmes adresses et les mêmes outils : les clients de 2025 (poignée de main `initialize`, puis requêtes indépendantes) et ceux de la révision 2026-07-28 (sans état, chaque requête se suffit). Le serveur ne crée aucune session et ne garde rien d'une requête à l'autre. Vérifié avec le client officiel dans les deux modes (`tests/functions/mcp.test.ts` et `scripts/verifier-mcp.mjs`).
- **Runtime Cloudflare** : le serveur fonctionne dans le runtime Pages Functions sans option de compatibilité Node (`nodejs_compat` n'est pas activé dans `wrangler.toml`).

## Contrôle local

Avec le serveur local lancé (`npm run pages:dev`, port 8790 par défaut) :

```bash
MCP_TOKEN=<jeton de .dev.vars> node scripts/verifier-mcp.mjs [url]
```

`url` est l'origine du serveur, `http://localhost:8790` par défaut. Le script se connecte avec le client officiel dans les deux générations du protocole, vérifie qu'il voit les treize outils et qu'une erreur métier revient bien comme résultat d'erreur ; il se termine par un code non nul au moindre écart.
