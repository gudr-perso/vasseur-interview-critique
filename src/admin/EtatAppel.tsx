import { useEffect, useState } from 'react'
import { Spinner } from '../components/ui/Spinner'

export const CLASSE_ETAT = 'font-mono text-[0.66rem] uppercase tracking-wider'

/** Temps écoulé depuis `debut`, rafraîchi chaque seconde. */
export function Duree({ debut }: { debut: number }) {
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    const minuterie = window.setInterval(() => setMaintenant(Date.now()), 1000)
    return () => window.clearInterval(minuterie)
  }, [])
  const secondes = Math.max(0, Math.floor((maintenant - debut) / 1000))
  return <>{Math.floor(secondes / 60)} min {String(secondes % 60).padStart(2, '0')} s</>
}

interface AppelEnCoursProps {
  /** Ce que fait l'IA, par exemple « L'IA réfléchit… ». */
  libelle: string
  debut: number
  /** Ce qu'une sortie de la page ferait perdre. */
  avertissement: string
  /** Après la durée, par exemple le nombre de caractères reçus. */
  detail?: string
}

/** État d'un appel à l'IA en cours : ce qu'elle fait, depuis combien de temps, et pourquoi garder la page ouverte. */
export function AppelEnCours({ libelle, debut, avertissement, detail }: AppelEnCoursProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span role="status" className={`${CLASSE_ETAT} inline-flex items-center gap-2 text-ink`}>
          <Spinner size="sm" />
          {libelle}
        </span>
        <span className={`${CLASSE_ETAT} text-muted`}>
          <Duree debut={debut} />{detail && ` · ${detail}`}
        </span>
      </div>
      <p className="text-[0.8rem] text-warn-fg font-medium mt-2 leading-snug">{avertissement}</p>
    </>
  )
}

/** Mention quand un document a été raccourci pour tenir dans le contexte de l'IA. */
export function ContexteTronque({ tronque }: { tronque: boolean }) {
  if (!tronque) return null
  return (
    <p className="text-[0.76rem] text-warn-fg mt-2 leading-snug">
      Un document au moins était trop long : l'IA n'en a lu que le début.
    </p>
  )
}
