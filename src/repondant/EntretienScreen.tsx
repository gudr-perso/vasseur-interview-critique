import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import type { EtatRepondant, Identite } from '../../shared/repondants'
import { Chargement, ErreurChargement, useChargement } from '../admin/commun'
import { Accueil } from './Accueil'
import { repondantApi } from './api'
import { Clos, Interrompu, LienInvalide, Termine } from './Etats'
import { FormulaireIdentite } from './FormulaireIdentite'
import { QuestionEnCours } from './QuestionEnCours'
import { oublierJeton } from './stockage'
import { TEXTES } from './textes'

/** `/r/:jeton` : l'entretien d'un répondant, de l'identité au remerciement. */
export function EntretienScreen() {
  const { jeton = '' } = useParams()
  const { etat, recharger, remplacer } = useChargement(() => repondantApi.etat(jeton), jeton)
  const inconnu = etat.phase === 'erreur' && etat.statut === 404

  // Un jeton supprimé ou inconnu ne doit plus servir de reprise au lien générique.
  useEffect(() => { if (inconnu) oublierJeton(jeton) }, [inconnu, jeton])

  if (etat.phase === 'chargement') return <Chargement />
  if (etat.phase === 'erreur') {
    if (inconnu) return <LienInvalide />
    if (etat.statut === 410) return <Clos />
    return <ErreurChargement message={etat.message} onReessayer={recharger} />
  }

  const adopter = (nouvel: EtatRepondant) => remplacer(() => nouvel)
  const { questionnaire, identite, etape } = etat.donnees

  switch (etape.type) {
    case 'identite': {
      const valider = async (saisie: Identite) => { adopter(await repondantApi.identite(jeton, saisie)) }
      return (
        <Accueil
          introduction={questionnaire.introduction} dureeMinutes={questionnaire.duree_estimee_min}
          consigne={TEXTES.accueil.invitation}
        >
          <FormulaireIdentite initiale={identite} onValider={valider} />
        </Accueil>
      )
    }
    case 'question':
      return (
        <QuestionEnCours
          jeton={jeton} question={etape.question} progression={etape.progression}
          onEtat={adopter} onRelire={recharger}
        />
      )
    case 'interrompu':
      return <Interrompu jeton={jeton} onEtat={adopter} />
    case 'termine':
      return <Termine />
    case 'clos':
      return <Clos />
  }
}
