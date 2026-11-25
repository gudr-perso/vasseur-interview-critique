export function json(donnees: unknown, statut = 200, enTetes: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { 'Content-Type': 'application/json', ...enTetes },
  })
}

/** Même forme d'erreur que l'API Anthropic, déjà comprise par le front. */
export function erreur(message: string, statut: number): Response {
  return json({ error: { message } }, statut)
}
