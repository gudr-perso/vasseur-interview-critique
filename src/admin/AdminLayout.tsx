import { clsx } from 'clsx'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { deconnexion } from '../lib/adminApi'
import { GardeSaisies, useConfirmerAbandon } from './saisies'

const CLASSE_ENTREE = 'font-mono text-[0.66rem] uppercase tracking-wider py-1 border-b-2 transition-colors'

function Entree({ vers, courante, children }: { vers: string; courante: boolean; children: string }) {
  return (
    <Link
      to={vers}
      aria-current={courante ? 'page' : undefined}
      className={clsx(CLASSE_ENTREE, courante ? 'border-red text-paper' : 'border-transparent text-paper/70 hover:text-paper')}
    >
      {children}
    </Link>
  )
}

function BoutonDeconnexion() {
  const confirmerAbandon = useConfirmerAbandon()

  const quitter = async () => {
    // La question vient avant la déconnexion : « rester » doit laisser la session intacte.
    if (!confirmerAbandon()) return
    await deconnexion()
    window.location.assign('/admin')
  }

  return <Button variant="ghost" size="sm" onClick={quitter} className="ml-auto">Se déconnecter</Button>
}

export function AdminLayout() {
  const { pathname } = useLocation()
  // Fiches de projet et éditeur de questionnaire appartiennent à la rubrique « Projets ».
  const surLogiciels = pathname.startsWith('/admin/logiciels')

  return (
    // La garde englobe l'en-tête : le bouton de déconnexion doit savoir s'il reste une saisie.
    <GardeSaisies>
      <div className="min-h-screen bg-paper font-sans">
        <header className="bg-ink text-paper px-4 sm:px-6 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-2 border-b-[3px] border-red">
          <Link to="/admin" className="font-display text-[0.95rem] tracking-[0.04em]">
            Interviews — administration
          </Link>
          <nav aria-label="Rubriques" className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <Entree vers="/admin" courante={!surLogiciels}>Projets</Entree>
            <Entree vers="/admin/logiciels" courante={surLogiciels}>Logiciels</Entree>
            <Entree vers="/" courante={false}>Interview critique</Entree>
          </nav>
          <BoutonDeconnexion />
        </header>
        <main className="max-w-4xl mx-auto px-4 py-8">
          <Outlet />
        </main>
      </div>
    </GardeSaisies>
  )
}
