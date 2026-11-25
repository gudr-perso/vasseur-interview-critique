import { useId, useState } from 'react'
import { urlExport, type CibleExport } from './api'
import { CLASSE_AIDE, CLASSE_LIBELLE, ChampCase } from './champs'

// Même apparence qu'un petit bouton « outline », mais un vrai lien : le cookie de session suit le téléchargement.
const CLASSE_LIEN_EXPORT =
  'font-mono uppercase tracking-wider text-[0.63rem] px-3 py-1.5 inline-flex items-center gap-2 transition-all duration-150 border border-ink text-ink hover:bg-ink hover:text-paper'

/** Liens de téléchargement des réponses brutes, en CSV (tableur) ou en Markdown (lecture). */
export function BoutonsExport({ cible }: { cible: CibleExport }) {
  const [inclureEnCours, setInclureEnCours] = useState(false)
  const id = useId()
  const portee = 'projet_id' in cible ? 'de tout le projet' : 'de ce questionnaire'

  return (
    <div className="border-t border-border pt-4 mt-5">
      <p className={CLASSE_LIBELLE}>Exporter les réponses {portee}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <a href={urlExport(cible, 'csv', inclureEnCours)} download className={CLASSE_LIEN_EXPORT}>Exporter en CSV</a>
        <a href={urlExport(cible, 'md', inclureEnCours)} download className={CLASSE_LIEN_EXPORT}>Exporter en Markdown</a>
        <ChampCase id={`${id}-en-cours`} libelle="Inclure les entretiens en cours" coche={inclureEnCours} onChange={setInclureEnCours} />
      </div>
      <p className={CLASSE_AIDE}>
        CSV pour un tableur (une ligne par question posée), Markdown pour la lecture. Les fichiers portent les vrais
        noms et mails des répondants.
      </p>
    </div>
  )
}
