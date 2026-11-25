import { useState } from 'react'
import type { ProjetComplet } from '../../shared/interviews'
import type { Etape } from '../../shared/modeles'
import { ModelSelector } from '../components/ui/ModelSelector'
import { api } from './api'
import { CLASSE_LIBELLE } from './champs'
import { useAction } from './commun'
import { useSaisieNonEnregistree } from './saisies'
import { SectionFiche } from './SectionFiche'

const ETAPES: { etape: Etape; libelle: string }[] = [
  { etape: 'cadrage', libelle: 'Cadrage' },
  { etape: 'interview', libelle: 'Interview' },
  { etape: 'analyse', libelle: 'Analyse' },
]

export function ProjetModeles({ projet, onMaj }: { projet: ProjetComplet; onMaj: (projet: ProjetComplet) => void }) {
  const [saisie, setSaisie] = useState<Partial<Record<Etape, string>>>({})
  const action = useAction()

  const enregistres: Record<Etape, string> = {
    cadrage: projet.modele_cadrage,
    interview: projet.modele_interview,
    analyse: projet.modele_analyse,
  }
  const valeurs: Record<Etape, string> = { ...enregistres, ...saisie }
  const modifie = ETAPES.some(({ etape }) => valeurs[etape] !== enregistres[etape])
  useSaisieNonEnregistree(modifie)

  const enregistrer = () => {
    void action.lancer(async () => {
      onMaj(await api.projets.modifier(projet.id, { modeles: valeurs }))
      setSaisie({})
    })
  }

  return (
    <SectionFiche
      titre="Modèles"
      aide="Utilisés par l'IA de l'application. Le travail fait dans Claude via le MCP n'en dépend pas."
      enregistrement={{ action, modifie, onEnregistrer: enregistrer }}
    >
      <div className="grid gap-x-4 sm:grid-cols-3">
        {ETAPES.map(({ etape, libelle }) => (
          <div key={etape} className="mb-4 min-w-0">
            <label htmlFor={`modele-${etape}`} className={`${CLASSE_LIBELLE} mb-0.5`}>{libelle}</label>
            <ModelSelector
              id={`modele-${etape}`} value={valeurs[etape]}
              onChange={modele => setSaisie(actuelle => ({ ...actuelle, [etape]: modele }))}
            />
          </div>
        ))}
      </div>
    </SectionFiche>
  )
}
