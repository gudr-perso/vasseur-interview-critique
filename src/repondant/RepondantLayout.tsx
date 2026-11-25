import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { TEXTES } from './textes'

/** Cadre des écrans du répondant : une colonne centrée, sans l'en-tête de l'administration. */
export function RepondantLayout() {
  useEffect(() => { document.title = TEXTES.titrePage }, [])

  return (
    <div className="min-h-screen bg-paper font-sans text-ink border-t-[3px] border-red">
      <main className="max-w-xl mx-auto px-4 py-6 sm:py-12">
        <Outlet />
      </main>
    </div>
  )
}
