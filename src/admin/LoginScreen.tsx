import { useState, type FormEvent } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { connexion } from '../lib/adminApi'

export function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [motDePasse, setMotDePasse] = useState('')
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const valider = async (e: FormEvent) => {
    e.preventDefault()
    setErreur('')
    setEnvoi(true)
    try {
      await connexion(motDePasse)
      onSuccess()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Connexion impossible.')
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className="min-h-screen bg-paper font-sans flex items-center justify-center px-4">
      <Card padding="lg" className="w-full max-w-sm">
        <h1 className="font-display text-[1.1rem] mb-4">Accès réservé</h1>
        <form onSubmit={valider}>
          <label htmlFor="mdp" className="block font-mono text-[0.66rem] uppercase tracking-wider text-muted mb-1.5">
            Mot de passe
          </label>
          <input
            id="mdp"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={motDePasse}
            onChange={e => setMotDePasse(e.target.value)}
            className="w-full border border-border bg-paper px-3 py-2.5 text-[0.86rem] mb-3 focus:outline-none focus:border-ink"
          />
          {erreur && <p role="alert" className="text-red text-[0.8rem] mb-3">{erreur}</p>}
          <Button type="submit" variant="primary" loading={envoi} disabled={!motDePasse}>
            Se connecter
          </Button>
        </form>
      </Card>
    </div>
  )
}
