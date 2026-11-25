function egales(a: unknown, b: unknown): boolean {
  // Listes d'identifiants (logiciels cochés) : l'ordre ne compte pas.
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')
  }
  return a === b
}

/**
 * Champs saisis qui diffèrent de la version enregistrée : seuls ceux-là partent au serveur,
 * pour ne pas écraser avec une valeur périmée ce qui a changé ailleurs (par Claude via le MCP, par exemple).
 */
export function champsModifies<T extends object>(enregistre: T, saisie: Partial<T>): Partial<T> {
  const modifs: Partial<T> = {}
  for (const cle of Object.keys(saisie) as (keyof T)[]) {
    const valeur = saisie[cle]
    if (valeur !== undefined && !egales(valeur, enregistre[cle])) modifs[cle] = valeur
  }
  return modifs
}
