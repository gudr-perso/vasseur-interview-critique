import { useRouteError } from 'react-router-dom'

/** Affiché par le routeur quand un écran lève une exception au rendu, à la place de son écran d'erreur brut. */
export function ErreurRoute() {
  const erreur = useRouteError()
  // Le détail reste pour le diagnostic, dans la console.
  console.error(erreur)
  return (
    <div className="min-h-screen bg-paper font-sans flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="font-display text-[1.1rem] mb-2">Une erreur est survenue</h1>
        <p className="text-[0.86rem] text-muted mb-5">
          Cette page n'a pas pu s'afficher. Les modifications non enregistrées de cette page sont perdues.
        </p>
        {/* Lien ordinaire : un rechargement complet repart d'un état propre. */}
        <a href="/admin" className="font-mono text-[0.68rem] uppercase tracking-wider text-red underline">
          ← Retour à l'administration
        </a>
      </div>
    </div>
  )
}
