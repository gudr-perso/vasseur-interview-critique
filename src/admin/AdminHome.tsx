import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { deconnexion } from '../lib/adminApi'

export function AdminHome() {
  const quitter = async () => {
    await deconnexion()
    window.location.assign('/admin')
  }

  return (
    <div className="min-h-screen bg-paper font-sans">
      <header className="bg-ink text-paper px-6 py-3.5 flex items-center justify-between border-b-[3px] border-red">
        <div className="font-display text-[0.95rem] tracking-[0.04em]">Interviews — administration</div>
        <Button variant="ghost" size="sm" onClick={quitter}>Se déconnecter</Button>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8">
        <Card>
          <h1 className="font-display text-[1rem] mb-2">Interview critique</h1>
          <p className="text-[0.86rem] text-muted mb-3">
            Passer un sujet et un document au crible d'un journaliste critique.
          </p>
          <Link to="/" className="font-mono text-[0.68rem] uppercase tracking-wider text-red underline">
            Ouvrir
          </Link>
        </Card>
      </main>
    </div>
  )
}
