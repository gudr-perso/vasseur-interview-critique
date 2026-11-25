import { Link, useParams } from 'react-router-dom'
import { api } from './api'
import { Chargement, CLASSE_LIEN, ErreurChargement, useChargement } from './commun'
import { QuestionnaireEditeur } from './QuestionnaireEditeur'

export function QuestionnaireScreen() {
  const { id = '' } = useParams()
  const { etat, recharger } = useChargement(() => api.questionnaires.lire(id), id)

  if (etat.phase === 'chargement') return <Chargement />
  if (etat.phase === 'erreur') {
    if (etat.statut !== 404) return <ErreurChargement message={etat.message} onReessayer={recharger} />
    return (
      <div className="py-10 text-center">
        <h1 className="font-display font-bold text-[1.35rem] mb-3">Questionnaire introuvable</h1>
        <Link to="/admin" className={CLASSE_LIEN}>← Projets</Link>
      </div>
    )
  }
  // La clé repart d'un éditeur neuf quand on passe d'un questionnaire à un autre.
  return <QuestionnaireEditeur key={etat.donnees.id} initial={etat.donnees} />
}
