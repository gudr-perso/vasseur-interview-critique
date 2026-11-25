export async function sessionActive(): Promise<boolean> {
  try {
    return (await fetch('/api/admin/session')).ok
  } catch {
    return false
  }
}

export async function connexion(motDePasse: string): Promise<void> {
  const reponse = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motDePasse }),
  })
  if (!reponse.ok) {
    const corps = await reponse.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(corps.error?.message ?? `Erreur ${reponse.status}`)
  }
}

export async function deconnexion(): Promise<void> {
  await fetch('/api/admin/logout', { method: 'POST' })
}
