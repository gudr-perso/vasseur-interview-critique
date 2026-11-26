// ─── Réponse de l'IA en flux ─────────────────────────────────────────────────
//
// Contrat commun à toutes les réponses de l'IA qui peuvent durer (analyses, cadrage, génération de questionnaires) :
//
// 1. Une ligne d'en-tête JSON, envoyée tout de suite : les champs propres à l'appelant, puis le séparateur des
//    lignes de contrôle, par exemple {"nb_entretiens":n,"controle":"<séparateur>"}. Le séparateur est tiré au
//    hasard à chaque réponse et n'est jamais montré au modèle.
// 2. Le texte, au fil de l'eau, tel que le modèle l'écrit.
// 3. Des lignes de contrôle, intercalées : "\n<séparateur> <JSON>\n". Le client les retire du texte, saut de ligne
//    initial et final compris. Un signal de vie ({"type":"vie"}) part après 15 s sans aucun envoi ; le flux se
//    termine toujours par une seule ligne de succès, qui porte la charge utile de l'appelant à plat
//    ({"type":"succes","analyse_id":"…"}, {"type":"succes","questionnaire_id":"…"}…), ou d'erreur
//    ({"type":"erreur","message":"…"}). Un flux qui s'arrête sans l'une d'elles a été coupé.

/** Ligne d'en-tête : les champs de l'appelant (objet JSON sans champ `controle`), puis le séparateur. */
export type EnteteFlux<C extends object = Record<never, never>> = C & {
  /** Séparateur des lignes de contrôle. */
  controle: string
}

/** `S` : charge utile de succès de l'appelant, objet JSON sans champ `type`, mise à plat dans la ligne. */
export type ControleFlux<S extends object = Record<never, never>> =
  | { type: 'vie' }
  | ({ type: 'succes' } & S)
  | { type: 'erreur'; message: string }

/** Forme d'un séparateur : 32 chiffres hexadécimaux. */
export const FORME_SEPARATEUR = /^[0-9a-f]{32}$/

/** Ligne de contrôle complète, sauts de ligne compris. */
export function ligneDeControle<S extends object>(separateur: string, controle: ControleFlux<S>): string {
  return `\n${separateur} ${JSON.stringify(controle)}\n`
}
