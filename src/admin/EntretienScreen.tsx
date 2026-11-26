import { clsx } from 'clsx'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { reponseEnTexte, type EntretienLu, type TourLu } from '../../shared/repondants'
import { Button } from '../components/ui/Button'
import { Chip } from '../components/ui/Chip'
import { api } from './api'
import { Alerte, Chargement, CLASSE_LIEN, ErreurChargement, useAction, useChargement } from './commun'
import { GenerationAnalyse } from './GenerationAnalyse'
import {
  formaterDateHeure, libelle, LIBELLES_MODE, LIBELLES_ORIGINE, LIBELLES_STATUT_REPONDANT,
} from './libelles'

/** `/admin/repondants/:id` : lecture d'un entretien. */
export function EntretienScreen() {
  const { id = '' } = useParams()
  const { etat, recharger } = useChargement(() => api.repondants.lireEntretien(id), id)

  if (etat.phase === 'chargement') return <Chargement />
  if (etat.phase === 'erreur') {
    if (etat.statut !== 404) return <ErreurChargement message={etat.message} onReessayer={recharger} />
    return (
      <div className="py-10 text-center">
        <h1 className="font-display font-bold text-[1.35rem] mb-3">Entretien introuvable</h1>
        <Link to="/admin" className={CLASSE_LIEN}>← Projets</Link>
      </div>
    )
  }
  return <Entretien entretien={etat.donnees} />
}

function Entretien({ entretien }: { entretien: EntretienLu }) {
  const { repondant: r, questionnaire: q, tours } = entretien
  const naviguer = useNavigate()
  const suppression = useAction()
  const retour = `/admin/questionnaires/${q.id}`
  const nom = `${r.prenom} ${r.nom}`.trim()

  const supprimer = () => {
    // Ses fiches d'analyse partent avec lui (elles portent son entretien) ; les synthèses restent.
    if (!window.confirm(
      `Supprimer définitivement l'entretien de ${nom} ? Ses fiches d'analyse seront supprimées aussi ; les synthèses et expressions de besoin sont conservées.`,
    )) return
    void suppression.lancer(async () => {
      await api.repondants.supprimer(r.id)
      naviguer(retour)
    })
  }

  const details: [string, string][] = [
    ['Entreprise', r.entreprise],
    ['Poste', r.poste],
    ['Mail', r.mail],
    ['Origine', libelle(LIBELLES_ORIGINE, r.origine)],
    ['Commencé le', r.commence_le ? formaterDateHeure(r.commence_le) : ''],
    ['Terminé le', r.termine_le ? formaterDateHeure(r.termine_le) : ''],
  ]

  return (
    <>
      <Link to={retour} className={CLASSE_LIEN}>← Questionnaire « {q.public_vise} »</Link>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 mt-3">
        <h1 className="font-display font-bold text-[1.35rem] break-words min-w-0">{nom}</h1>
        <Chip label={libelle(LIBELLES_STATUT_REPONDANT, r.statut)} />
      </div>
      <p className="font-mono text-[0.62rem] text-muted mt-1 mb-4">{libelle(LIBELLES_MODE, q.mode)}</p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.84rem] mb-6">
        {details.filter(([, valeur]) => valeur).map(([terme, valeur]) => (
          <div key={terme} className="contents">
            <dt className="font-mono text-[0.62rem] uppercase tracking-wider text-muted pt-0.5">{terme}</dt>
            <dd className="break-words min-w-0">{valeur}</dd>
          </div>
        ))}
      </dl>

      {r.statut !== 'invite' && <FicheRepondant entretien={entretien} />}

      <h2 className="font-display text-[1.1rem] mb-3">Fil de l'entretien</h2>
      {tours.length === 0
        ? <p className="text-[0.84rem] text-muted mb-6">Aucune question posée pour l'instant.</p>
        : (
          <ol className="grid gap-3 mb-8">
            {tours.map(tour => <Tour key={tour.ordre} tour={tour} />)}
          </ol>
        )}

      <div className="border-t border-border pt-4">
        <Button variant="danger" loading={suppression.enCours} onClick={supprimer}>
          Supprimer ce répondant et ses réponses
        </Button>
        <Alerte className="mt-2">{suppression.erreur}</Alerte>
      </div>
    </>
  )
}

/** Génération de la fiche de ce répondant, préréglée ; le projet est chargé à l'ouverture. */
function FicheRepondant({ entretien }: { entretien: EntretienLu }) {
  const [ouverte, setOuverte] = useState(false)
  if (!ouverte) {
    return <Button size="sm" className="mb-6" onClick={() => setOuverte(true)}>Générer la fiche de ce répondant</Button>
  }
  return <GenerationFiche entretien={entretien} onFermer={() => setOuverte(false)} />
}

function GenerationFiche({ entretien, onFermer }: { entretien: EntretienLu; onFermer: () => void }) {
  const projetId = entretien.questionnaire.projet_id
  const { etat, recharger } = useChargement(() => api.projets.lire(projetId), projetId)
  if (etat.phase === 'chargement') return <Chargement />
  if (etat.phase === 'erreur') return <ErreurChargement message={etat.message} onReessayer={recharger} />
  return (
    <GenerationAnalyse
      projet={etat.donnees} onFermer={onFermer}
      preReglage={{ questionnaire_id: entretien.questionnaire.id, repondant_id: entretien.repondant.id }}
    />
  )
}

function Tour({ tour }: { tour: TourLu }) {
  const relance = tour.type === 'relance'
  return (
    <li className={clsx('bg-white border border-border px-4 py-3 min-w-0', relance && 'ml-6 sm:ml-10 border-l-[3px] border-l-gold')}>
      {relance && <div className="font-mono text-[0.6rem] uppercase tracking-wider text-warn-fg mb-1">Relance</div>}
      <p className="text-[0.9rem] font-medium break-words whitespace-pre-line">{tour.question}</p>
      {tour.reponse
        ? <p className="text-[0.86rem] mt-2 pl-3 border-l-2 border-border break-words whitespace-pre-line">{reponseEnTexte(tour.reponse)}</p>
        : <p className="font-mono text-[0.62rem] uppercase tracking-wider text-muted mt-2">Sans réponse</p>}
    </li>
  )
}
