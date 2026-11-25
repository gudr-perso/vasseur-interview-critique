import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AnalyseResume } from '../../shared/analyses'
import { Button } from '../components/ui/Button'
import { useCatalogue } from '../lib/modeles'
import { api } from './api'
import { BoutonsExport } from './BoutonsExport'
import { Chargement, ErreurChargement, useChargement } from './commun'
import { GenerationAnalyse, type ProjetPourAnalyse } from './GenerationAnalyse'
import { formaterDateHeure, libelle, libelleSource, LIBELLES_TYPE_ANALYSE, nombre } from './libelles'
import { SectionFiche } from './SectionFiche'

function ListeAnalyses({ analyses }: { analyses: AnalyseResume[] }) {
  const { modeles } = useCatalogue()
  if (analyses.length === 0) {
    return (
      <p className="text-[0.84rem] text-muted">
        Aucune analyse. Générez-en une ici, ou demandez à Claude avec le connecteur MCP.
      </p>
    )
  }
  return (
    <ul className="grid gap-2">
      {analyses.map(a => (
        <li key={a.id} className="border border-border min-w-0">
          <Link to={`/admin/analyses/${a.id}`} className="block px-3 py-2.5 hover:bg-paper transition-colors">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[0.9rem] font-medium">{libelle(LIBELLES_TYPE_ANALYSE, a.type)}</span>
              <span className="text-[0.84rem] text-muted break-words min-w-0">{a.portee}</span>
            </span>
            <span className="block font-mono text-[0.62rem] text-muted mt-1">
              {libelleSource(a.source, modeles)} · {formaterDateHeure(a.cree_le)} · {nombre(a.nb_entretiens)} entretien(s)
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Section « Analyses » de la fiche projet : historique, génération d'une nouvelle analyse. */
export function ProjetAnalyses({ projet }: { projet: ProjetPourAnalyse }) {
  const { etat, recharger } = useChargement(() => api.analyses.lister(projet.id), projet.id)
  const [generation, setGeneration] = useState(false)

  return (
    <SectionFiche
      titre="Analyses"
      aide="Fiches par répondant, synthèses et expressions de besoin, produites ici par l'API ou dans Claude avec le connecteur MCP."
    >
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {!generation && <Button variant="primary" size="sm" onClick={() => setGeneration(true)}>Nouvelle analyse</Button>}
        <Button size="sm" variant="ghost" onClick={recharger} disabled={etat.phase === 'chargement'}>Actualiser</Button>
      </div>
      {generation && <GenerationAnalyse projet={projet} onEnregistree={recharger} onFermer={() => setGeneration(false)} />}
      {etat.phase === 'chargement' && <Chargement />}
      {etat.phase === 'erreur' && <ErreurChargement message={etat.message} onReessayer={recharger} />}
      {etat.phase === 'pret' && <ListeAnalyses analyses={etat.donnees} />}
      <BoutonsExport cible={{ projet_id: projet.id }} />
    </SectionFiche>
  )
}
