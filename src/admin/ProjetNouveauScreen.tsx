import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LIMITES, TYPES_DEMANDE, type TypeDemande } from '../../shared/interviews'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { api } from './api'
import { CasesLogiciels } from './CasesLogiciels'
import { ChampTexte, ChampZone, CLASSE_LIBELLE } from './champs'
import { Alerte, Chargement, CLASSE_LIEN, ErreurChargement, TitreEcran, useAction, useChargement } from './commun'
import { LIBELLES_TYPE_DEMANDE } from './libelles'
import { useSaisieNonEnregistree } from './saisies'

const EXPLICATIONS: Record<TypeDemande, string> = {
  evolution_simple: 'On sait quoi demander aux utilisateurs',
  amelioration: 'On veut améliorer une fonction existante',
  nouvelle_fonctionnalite: 'Besoin à préciser : le cadrage sera plus poussé',
}

export function ProjetNouveauScreen() {
  const naviguer = useNavigate()
  const logiciels = useChargement(() => api.logiciels.lister(), '')
  const [titre, setTitre] = useState('')
  const [type, setType] = useState<TypeDemande | null>(null)
  const [description, setDescription] = useState('')
  const [logicielIds, setLogicielIds] = useState<string[]>([])
  const action = useAction()
  const liberer = useSaisieNonEnregistree(titre !== '' || description !== '' || type !== null || logicielIds.length > 0)

  const creer = async (e: FormEvent) => {
    e.preventDefault()
    if (!titre.trim()) return action.signaler('Le titre du projet est obligatoire.')
    if (!type) return action.signaler('Choisissez un type de demande.')
    await action.lancer(async () => {
      const projet = await api.projets.creer({ titre, type_demande: type, description, logiciel_ids: logicielIds })
      liberer()
      naviguer(`/admin/projets/${projet.id}`)
    })
  }

  if (logiciels.etat.phase === 'chargement') return <Chargement />
  if (logiciels.etat.phase === 'erreur') {
    return <ErreurChargement message={logiciels.etat.message} onReessayer={logiciels.recharger} />
  }

  return (
    <>
      <TitreEcran titre="Nouveau projet" />
      <Card padding="lg">
        <form onSubmit={creer} noValidate>
          <ChampTexte
            id="projet-titre" libelle="Titre" valeur={titre} onChange={setTitre}
            maxLength={LIMITES.titre_projet} autoFocus
          />

          <fieldset className="mb-4 min-w-0">
            <legend className={CLASSE_LIBELLE}>Type de demande</legend>
            <div className="grid gap-2">
              {TYPES_DEMANDE.map(valeur => (
                <label
                  key={valeur} htmlFor={`projet-type-${valeur}`}
                  className={`flex items-start gap-3 border px-3 py-2.5 cursor-pointer transition-colors ${
                    type === valeur ? 'border-ink bg-paper' : 'border-border hover:bg-paper'
                  }`}
                >
                  <input
                    id={`projet-type-${valeur}`} type="radio" name="projet-type" className="accent-red mt-1 shrink-0"
                    checked={type === valeur} onChange={() => setType(valeur)}
                  />
                  <span className="min-w-0">
                    <span className="block text-[0.88rem]">{LIBELLES_TYPE_DEMANDE[valeur]}</span>
                    <span className="block text-[0.78rem] text-muted">{EXPLICATIONS[valeur]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <ChampZone
            id="projet-description" libelle="Description" valeur={description} onChange={setDescription} lignes={8}
            maxLength={LIMITES.description} aide="La demande telle que vous la formulez aujourd'hui"
          />

          <CasesLogiciels
            prefixe="projet-logiciel" logiciels={logiciels.etat.donnees} choisis={logicielIds} onChange={setLogicielIds}
          />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-6">
            <Button type="submit" variant="primary" loading={action.enCours}>Créer le projet</Button>
            <Link to="/admin" className={CLASSE_LIEN}>Annuler</Link>
          </div>
          <Alerte className="mt-3">{action.erreur}</Alerte>
        </form>
      </Card>
    </>
  )
}
