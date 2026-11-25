import { useEffect, useState, type ReactNode } from 'react'
import { LoginScreen } from '../admin/LoginScreen'
import { Spinner } from '../components/ui/Spinner'
import { sessionActive } from '../lib/adminApi'

type Etat = 'verification' | 'connecte' | 'anonyme'

export function RequireAdmin({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<Etat>('verification')

  useEffect(() => {
    let actif = true
    sessionActive().then(ok => { if (actif) setEtat(ok ? 'connecte' : 'anonyme') })
    return () => { actif = false }
  }, [])

  if (etat === 'verification') {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }
  if (etat === 'anonyme') return <LoginScreen onSuccess={() => setEtat('connecte')} />
  return <>{children}</>
}
