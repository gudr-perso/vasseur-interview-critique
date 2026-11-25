export function NotFound() {
  return (
    <div className="min-h-screen bg-paper font-sans flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="font-display text-[1.1rem] mb-2">Lien invalide</h1>
        <p className="text-[0.86rem] text-muted">Cette adresse ne correspond à aucune page.</p>
      </div>
    </div>
  )
}
