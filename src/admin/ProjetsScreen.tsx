import { Link, useSearchParams } from 'react-router-dom'
import { STATUTS_PROJET, type ProjetResume, type StatutProjet } from '../../shared/interviews'
import { Card } from '../components/ui/Card'
import { Chip } from '../components/ui/Chip'
import { api } from './api'
import { ChampListe } from './champs'
import { Chargement, CLASSE_LIEN_BOUTON, ErreurChargement, TitreEcran, useChargement } from './commun'
import { formaterDate, LIBELLES_STATUT_PROJET, LIBELLES_TYPE_DEMANDE, optionsDe } from './libelles'

const OPTIONS_STATUT: { valeur: StatutProjet | ''; libelle: string }[] = [
  { valeur: '', libelle: 'Tous les statuts' },
  ...optionsDe(STATUTS_PROJET, LIBELLES_STATUT_PROJET),
]

function statutValide(valeur: string | null): StatutProjet | undefined {
  return STATUTS_PROJET.find(s => s === valeur)
}

function CarteProjet({ projet }: { projet: ProjetResume }) {
  return (
    <Link to={`/admin/projets/${projet.id}`} className="block group">
      <Card className="transition-colors group-hover:border-ink group-focus-visible:border-ink">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h2 className="font-display text-[1.05rem] break-words min-w-0">{projet.titre}</h2>
          <Chip label={LIBELLES_STATUT_PROJET[projet.statut]} />
        </div>
        <p className="text-[0.82rem] text-muted mt-1.5 break-words">
          {LIBELLES_TYPE_DEMANDE[projet.type_demande]}
          {projet.logiciels && <> · {projet.logiciels}</>}
        </p>
        <p className="font-mono text-[0.62rem] text-muted mt-2">Modifié le {formaterDate(projet.maj_le)}</p>
      </Card>
    </Link>
  )
}

export function ProjetsScreen() {
  const [recherche, setRecherche] = useSearchParams()
  const logicielId = recherche.get('logiciel') ?? ''
  const statut = statutValide(recherche.get('statut'))
  const filtre = logicielId !== '' || statut !== undefined

  const logiciels = useChargement(() => api.logiciels.lister(), '')
  const projets = useChargement(
    () => api.projets.lister({ logiciel_id: logicielId || undefined, statut }),
    `${logicielId}|${statut ?? ''}`,
  )

  const filtrer = (cle: 'logiciel' | 'statut', valeur: string) => {
    const suivante = new URLSearchParams(recherche)
    if (valeur) suivante.set(cle, valeur)
    else suivante.delete(cle)
    // Remplacement : le retour arrière quitte la liste au lieu de défaire les filtres un à un.
    setRecherche(suivante, { replace: true })
  }

  const listeLogiciels = logiciels.etat.phase === 'pret' ? logiciels.etat.donnees : []
  const optionsLogiciel = [
    { valeur: '', libelle: 'Tous les logiciels' },
    ...listeLogiciels.map(l => ({ valeur: l.id, libelle: l.nom })),
    // Un filtre venu de l'adresse reste sélectionné même si la liste n'est pas (encore) là.
    ...(logicielId && !listeLogiciels.some(l => l.id === logicielId) ? [{ valeur: logicielId, libelle: '…' }] : []),
  ]
  const erreur = projets.etat.phase === 'erreur' ? projets.etat : logiciels.etat.phase === 'erreur' ? logiciels.etat : undefined

  return (
    <>
      <TitreEcran titre="Projets">
        <Link to="/admin/projets/nouveau" className={CLASSE_LIEN_BOUTON}>Nouveau projet</Link>
      </TitreEcran>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <ChampListe
          id="filtre-logiciel" libelle="Logiciel" valeur={logicielId} options={optionsLogiciel}
          onChange={valeur => filtrer('logiciel', valeur)}
        />
        <ChampListe
          id="filtre-statut" libelle="Statut" valeur={statut ?? ''} options={OPTIONS_STATUT}
          onChange={valeur => filtrer('statut', valeur)}
        />
      </div>

      {erreur ? (
        <ErreurChargement message={erreur.message} onReessayer={() => { logiciels.recharger(); projets.recharger() }} />
      ) : projets.etat.phase !== 'pret' ? (
        <Chargement />
      ) : projets.etat.donnees.length === 0 ? (
        <p className="text-[0.88rem] text-muted py-8 text-center">
          {filtre
            ? 'Aucun projet ne correspond à ces filtres.'
            : "Aucun projet pour l'instant. Créez-en un ici, ou depuis Claude avec le connecteur MCP."}
        </p>
      ) : (
        <div>
          {projets.etat.donnees.map(projet => <CarteProjet key={projet.id} projet={projet} />)}
        </div>
      )}
    </>
  )
}
