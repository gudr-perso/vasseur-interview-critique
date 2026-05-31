import { useEffect, useState } from 'react'
import { Spinner } from '../components/ui/Spinner'

const MESSAGES = [
  'Vasseur analyse le dossier…',
  'Identification des angles morts…',
  'Préparation des questions létales…',
  'Vérification des incohérences…',
  "Calibration du niveau d'exigence…",
]

export function LoadingScreen() {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setIdx(i => (i + 1) % MESSAGES.length)
    }, 3500)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="max-w-[820px] w-full mx-auto px-6">
      <div className="bg-white border border-border min-h-[280px] flex flex-col items-center justify-center gap-4 p-10">
        <Spinner size="lg" />
        <div className="font-mono text-[0.78rem] text-muted">{MESSAGES[idx]}</div>
        <div className="text-[0.81rem] text-muted text-center max-w-[380px] leading-relaxed">
          Les questions sont générées spécifiquement pour votre sujet. Comptez 20 à 90 secondes selon le modèle choisi.
        </div>
      </div>
    </div>
  )
}
