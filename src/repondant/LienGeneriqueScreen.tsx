import { Navigate, useNavigate, useParams } from 'react-router-dom'
import type { Identite } from '../../shared/repondants'
import { Chargement, ErreurChargement, useChargement } from '../admin/commun'
import { Accueil } from './Accueil'
import { repondantApi } from './api'
import { Clos, LienInvalide } from './Etats'
import { FormulaireIdentite } from './FormulaireIdentite'
import { jetonPourCode, retenirJeton } from './stockage'

/** `/q/:code` : le lien générique d'un questionnaire. */
export function LienGeneriqueScreen() {
  const { code = '' } = useParams()
  // Ce navigateur a déjà commencé : il reprend là où il en était.
  const jeton = jetonPourCode(code)
  if (jeton) return <Navigate to={`/r/${encodeURIComponent(jeton)}`} replace />
  return <AccueilGenerique code={code} />
}

function AccueilGenerique({ code }: { code: string }) {
  const naviguer = useNavigate()
  const { etat, recharger } = useChargement(() => repondantApi.accueil(code), code)

  if (etat.phase === 'chargement') return <Chargement />
  if (etat.phase === 'erreur') {
    if (etat.statut === 404) return <LienInvalide />
    if (etat.statut === 410) return <Clos />
    return <ErreurChargement message={etat.message} onReessayer={recharger} />
  }

  const commencer = async (identite: Identite) => {
    const { jeton } = await repondantApi.commencer(code, identite)
    retenirJeton(code, jeton)
    naviguer(`/r/${encodeURIComponent(jeton)}`, { replace: true })
  }

  return (
    <Accueil introduction={etat.donnees.introduction} dureeMinutes={etat.donnees.duree_estimee_min}>
      <FormulaireIdentite onValider={commencer} />
    </Accueil>
  )
}
