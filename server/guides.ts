export const ETAPES_GUIDE = ['cadrage', 'questionnaire'] as const
export type EtapeGuide = (typeof ETAPES_GUIDE)[number]

const CADRAGE = `# Guide de cadrage d'un projet d'interview

But : comprendre assez bien la demande pour écrire ensuite les questions à poser aux utilisateurs. Tu interroges le porteur du projet ; lui connaît le métier et le logiciel, toi tu clarifies.

## Avant de poser une question

Lis le projet avec lire_projet : description, logiciels concernés et leur fiche de contexte, liste des documents joints (nom et taille, sans le contenu). Lis ensuite les documents utiles avec lire_document, par morceaux de 20 000 caractères au plus : passe la valeur de « suite » dans « debut » tant qu'elle n'est pas nulle. Ne redemande jamais ce qui s'y trouve déjà.

## Profondeur selon le type de demande

- evolution_simple : le porteur sait ce qu'il veut vérifier. De 0 à 3 questions. Si la description suffit, n'en pose aucune et passe à la note.
- amelioration : jusqu'à 6 questions. Concentre-toi sur ce qui gêne aujourd'hui et sur ce qui doit changer.
- nouvelle_fonctionnalite : jusqu'à 12 questions. Le besoin est encore flou, c'est ici que le cadrage compte le plus.

Ces nombres sont des plafonds, pas des objectifs. Arrête-toi dès que tu peux écrire la note, et tout de suite si le porteur dit que cela suffit.

## Comment interroger

- Pose une seule question à la fois, puis attends la réponse.
- Préfère une question concrète (« qui fait cette saisie aujourd'hui, et à quel moment ? ») à une question générale (« quels sont les enjeux ? »).
- Quand une réponse est vague, demande un exemple réel avant de passer à la suite.
- Reformule en une phrase ce que tu as compris quand la réponse change ta compréhension du projet.
- Ne propose pas de solution : le but est de savoir quoi demander aux utilisateurs, pas de concevoir la fonctionnalité.

## Ce qu'il faut savoir à la fin

1. Objectif : quelle décision les réponses des utilisateurs doivent-elles éclairer ?
2. Publics : quels profils interroger (comptable, animateur terrain, responsable…), et en quoi leur regard diffère.
3. Existant : comment les choses se passent aujourd'hui, dans le logiciel et à côté.
4. Contraintes : ce qui ne changera pas (réglementaire, technique, calendrier).
5. Hors périmètre : ce qu'on ne veut pas ouvrir dans les entretiens.
6. Hypothèses à vérifier : ce que l'équipe croit savoir et veut confronter au terrain.

Pour une evolution_simple, les points 1, 2 et 6 suffisent.

## Note de cadrage

Rédige la note en Markdown, avec ces titres dans cet ordre : Objectif, Publics à interroger, Existant, Contraintes, Hors périmètre, Hypothèses à vérifier, Points encore ouverts. Écris des faits et des phrases complètes ; laisse une rubrique vide plutôt que de la remplir avec des suppositions, et range sous « Points encore ouverts » ce que le porteur n'a pas su dire.

Montre la note au porteur, corrige-la selon ses remarques, puis enregistre-la avec modifier_projet (champ note_cadrage). Si les documents joints sont longs, enregistre aussi un resume_contexte d'une vingtaine de lignes : il servira de contexte à chaque entretien à la place des documents complets.

Étape suivante : lire_guide avec l'étape « questionnaire ».`

const QUESTIONNAIRE = `# Guide de rédaction d'un questionnaire

But : à partir de la note de cadrage, écrire ce qui sera demandé aux utilisateurs. Relis le projet avec lire_projet avant de commencer, et lis les documents utiles avec lire_document (la liste donne leur nom et leur taille, pas leur contenu). Si la note de cadrage est vide, fais d'abord le cadrage.

## Un questionnaire par public

Chaque public à interroger a son propre questionnaire et sa propre adresse. Un comptable et un animateur terrain ne vivent pas le même logiciel : n'écris pas un questionnaire commun avec des questions qui ne concernent que la moitié des gens.

## Choisir le mode

- hybride : une liste de questions identique pour tous, et l'IA peut relancer quand une réponse est vague. À choisir quand on veut comparer les réponses et quand le besoin est assez connu pour écrire les questions. C'est le bon choix pour une evolution_simple ou une amelioration.
- entretien : l'IA mène la conversation à partir d'un guide de thèmes. À choisir quand le besoin est encore à découvrir, typiquement une nouvelle_fonctionnalite, ou quand on interroge peu de personnes en profondeur.

## Écrire pour le répondant

- Il n'a pas lu la note de cadrage et ne connaît pas le vocabulaire du projet. Emploie les mots de son métier et les libellés qu'il voit à l'écran.
- Une question porte sur une seule chose. « Est-ce rapide et fiable ? » fait deux questions.
- Demande des faits avant des opinions : « comment avez-vous fait la dernière fois ? » apprend plus que « que pensez-vous de… ? ».
- Ne souffle pas la réponse : « à quel point ce nouvel écran vous ferait-il gagner du temps ? » suppose déjà qu'il en fait gagner.
- Commence par ce que la personne fait aujourd'hui, termine par ses attentes. Garde pour la fin une question ouverte : « qu'aurions-nous dû vous demander ? ».
- Vise 8 à 15 questions en mode hybride : au-delà de dix minutes, les réponses s'appauvrissent.

L'introduction est le premier écran que voit le répondant : en trois ou quatre phrases, dis qui pose les questions, pourquoi, combien de temps cela prend et ce qui sera fait des réponses.

## Format du contenu en mode hybride

{
  "questions": [
    { "type": "texte", "libelle": "Comment saisissez-vous vos temps aujourd'hui ?", "objectif": "Décrire la pratique réelle, outils annexes compris" },
    { "type": "choix_unique", "libelle": "À quelle fréquence faites-vous cette saisie ?", "options": ["Chaque jour", "Chaque semaine", "Chaque mois"], "objectif": "Mesurer la charge récurrente" },
    { "type": "choix_multiple", "libelle": "Quels écrans utilisez-vous pour cela ?", "options": ["Écran A", "Écran B", "Aucun"], "objectif": "Repérer les écrans concernés" },
    { "type": "echelle", "libelle": "Sur 5, à quel point cette saisie vous est-elle pénible ?", "objectif": "Hiérarchiser l'irritant" }
  ]
}

Types possibles : texte, choix_unique, choix_multiple, echelle (de 1 à 5). Les options, de 2 à 10, sans doublon (casse et espaces ignorés), ne concernent que les deux types de choix. Un questionnaire hybride compte 40 questions au plus. Chaque question accepte en plus un commentaire libre du répondant.

Un libellé et un objectif font 500 caractères au plus ; une option, 200 caractères au plus. Les identifiants (id) sont facultatifs : sans id, les questions s'appellent q1, q2… dans l'ordre. Un id compte de 1 à 40 caractères, uniquement des lettres, chiffres, tiret et souligné (sans accent ni espace), et ne peut pas servir deux fois dans le même questionnaire.

Le champ objectif est obligatoire et n'est jamais montré au répondant : il dit ce qu'on cherche à apprendre, et c'est d'après lui que l'IA jugera si une réponse mérite une relance. Écris-le précisément.

## Format du contenu en mode entretien

{
  "question_ouverture": "Pouvez-vous me raconter votre dernière clôture mensuelle, du début à la fin ?",
  "themes": [
    { "titre": "Fonctionnement actuel", "objectif": "Savoir qui fait quoi, quand, avec quels outils" },
    { "titre": "Difficultés", "objectif": "Obtenir des exemples précis de blocages et leur fréquence" }
  ]
}

De 3 à 6 thèmes en général, 12 au plus. La question d'ouverture (500 caractères au plus) invite à raconter une situation vécue. Un titre de thème fait 200 caractères au plus, son objectif 500. Les identifiants de thème (id, facultatifs) suivent les mêmes règles que ceux des questions : t1, t2… à défaut.

## Réglages

- duree_estimee_min : de 1 à 120 minutes, 10 par défaut. C'est ce qu'annonce l'introduction.
- relances_max_par_question : de 0 à 3, 1 par défaut (mode hybride).
- tours_max : de 1 à 30. En hybride, nombre total de relances, 12 par défaut ; en entretien, nombre de questions posées, 15 par défaut.
- introduction : 2 000 caractères au plus. public_vise : 200 caractères au plus.

Quand tu remplaces un brouillon, ces réglages omis gardent leur valeur actuelle ; seul tours_max reprend le défaut du nouveau mode si le mode change.

## Enregistrer et publier

1. Montre le questionnaire au porteur du projet et corrige-le selon ses remarques.
2. Enregistre-le avec enregistrer_questionnaire : il reste en brouillon, modifiable en repassant son identifiant.
3. Quand le porteur le valide explicitement, publie-le avec publier_questionnaire et donne-lui l'adresse obtenue. Une fois publié, un questionnaire ne peut plus être remplacé : ne publie jamais de ta propre initiative.`

const GUIDES: Record<EtapeGuide, string> = { cadrage: CADRAGE, questionnaire: QUESTIONNAIRE }

export function lireGuide(etape: EtapeGuide): string {
  return GUIDES[etape]
}
