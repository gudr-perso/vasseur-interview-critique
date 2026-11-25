import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { EtatRepondant, Identite } from '../../shared/repondants'
import { Chargement, ErreurChargement, useChargement } from '../admin/commun'
import { Accueil } from './Accueil'
import { repondantApi } from './api'
import { Attente, AutreParticipation, Clos, Interrompu, LienInvalide, Termine } from './Etats'
import { FormulaireIdentite } from './FormulaireIdentite'
import { QuestionEnCours } from './QuestionEnCours'
import { codePourJeton, effacerBrouillons, oublierJeton } from './stockage'
import { TEXTES } from './textes'

/** `/r/:jeton` : l'entretien d'un répondant, de l'identité au remerciement. */
export function EntretienScreen() {
  const { jeton = '' } = useParams()
  const { etat, recharger, remplacer } = useChargement(() => repondantApi.etat(jeton), jeton)
  const inconnu = etat.phase === 'erreur' && etat.statut === 404
  const termine = etat.phase === 'pret' && etat.donnees.etape.type === 'termine'
  // Lu une fois : le lien générique d'où vient ce jeton, s'il y en a un (jamais pour une invitation nominative).
  const [codeGenerique] = useState(() => codePourJeton(jeton))

  // Un jeton supprimé, inconnu ou terminé ne doit plus servir de reprise au lien générique :
  // sur un poste partagé, la personne suivante repart de l'accueil.
  useEffect(() => {
    if (!inconnu && !termine) return
    oublierJeton(jeton)
    effacerBrouillons(jeton)
  }, [inconnu, termine, jeton])

  if (etat.phase === 'chargement') return <Chargement />
  if (etat.phase === 'erreur') {
    if (inconnu) return <LienInvalide />
    if (etat.statut === 410) return <Clos />
    return <ErreurChargement message={etat.message} onReessayer={recharger} />
  }

  const adopter = (nouvel: EtatRepondant) => remplacer(() => nouvel)
  const { questionnaire, identite, etape } = etat.donnees
  const autre = codeGenerique && <AutreParticipation prenom={identite.prenom} code={codeGenerique} jeton={jeton} />

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
        <>
          <QuestionEnCours
            jeton={jeton} question={etape.question} progression={etape.progression}
            onEtat={adopter} onRelire={recharger}
          />
          {autre}
        </>
      )
    case 'attente':
      return (
        <>
          <Attente jeton={jeton} onEtat={adopter} onRelire={recharger} />
          {autre}
        </>
      )
    case 'interrompu':
      return (
        <>
          <Interrompu jeton={jeton} reessaiPossible={etape.reessai_possible} onEtat={adopter} />
          {autre}
        </>
      )
    case 'termine':
      return <Termine />
    case 'clos':
      return <Clos />
  }
}
