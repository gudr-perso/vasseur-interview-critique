import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { urlQuestionnaire } from './api'

/** Adresse publique d'un questionnaire, avec un bouton pour la copier. */
export function Adresse({ code }: { code: string }) {
  const url = urlQuestionnaire(code)
  const [etat, setEtat] = useState<'repos' | 'copie' | 'echec'>('repos')

  useEffect(() => {
    if (etat !== 'copie') return
    const minuterie = window.setTimeout(() => setEtat('repos'), 2000)
    return () => window.clearTimeout(minuterie)
  }, [etat])

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setEtat('copie')
    } catch {
      setEtat('echec')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0">
      <code className="font-mono text-[0.76rem] break-all select-all min-w-0">{url}</code>
      <Button size="sm" onClick={copier}>
        <span aria-live="polite">{etat === 'copie' ? 'Copié' : 'Copier'}</span>
      </Button>
      {etat === 'echec' && (
        <span role="alert" className="text-red text-[0.76rem]">Copie impossible : sélectionnez l'adresse à la main.</span>
      )}
    </div>
  )
}
