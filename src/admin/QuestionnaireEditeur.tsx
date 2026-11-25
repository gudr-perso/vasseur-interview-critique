import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Questionnaire } from '../../shared/interviews'
import { Button } from '../components/ui/Button'
import { Chip } from '../components/ui/Chip'
import { Adresse } from './Adresse'
import { api } from './api'
import { Alerte, CLASSE_LIEN, Confirmation, messageErreur } from './commun'
import { LIBELLES_MODE, LIBELLES_STATUT_QUESTIONNAIRE } from './libelles'
import { empreinte, versBrouillon, versSaisie, type Brouillon } from './questionnaireBrouillon'
import { QuestionnaireContenu } from './QuestionnaireContenu'
import { QuestionnaireRepondants } from './QuestionnaireRepondants'
import { QuestionnaireReglages } from './QuestionnaireReglages'
import { useSaisieNonEnregistree } from './saisies'

type NomAction = 'enregistrer' | 'publier' | 'supprimer' | 'clore'

export function QuestionnaireEditeur({ initial }: { initial: Questionnaire }) {
  const naviguer = useNavigate()
  /** Dernière version connue du serveur. */
  const [questionnaire, setQuestionnaire] = useState(initial)
  const [brouillon, setBrouillon] = useState<Brouillon>(() => versBrouillon(initial))
  const [enCours, setEnCours] = useState<NomAction | null>(null)
  const [erreur, setErreur] = useState('')
  const [succes, setSucces] = useState('')

  const lectureSeule = questionnaire.statut !== 'brouillon'
  const enregistree = useMemo(() => empreinte(versBrouillon(questionnaire)), [questionnaire])
  const modifie = !lectureSeule && empreinte(brouillon) !== enregistree
  const liberer = useSaisieNonEnregistree(modifie)
  const fiche = `/admin/projets/${questionnaire.projet_id}`

  const changer = (modif: Partial<Brouillon>) => {
    setBrouillon(actuel => ({ ...actuel, ...modif }))
    setSucces('')
  }

  /** Exécute une action de la barre ; en cas d'échec, le message s'affiche et la saisie reste en place. */
  const executer = async (nom: NomAction, action: () => Promise<void>) => {
    setEnCours(nom)
    setErreur('')
    setSucces('')
    try {
      await action()
    } catch (e) {
      setErreur(messageErreur(e))
    } finally {
      setEnCours(null)
    }
  }

  /** Adopte la version renvoyée par le serveur, qui devient la référence de l'éditeur. */
  const adopter = (recu: Questionnaire, message: string) => {
    setQuestionnaire(recu)
    setBrouillon(versBrouillon(recu))
    setSucces(message)
  }

  const enregistrer = () => executer('enregistrer', async () => {
    adopter(await api.questionnaires.remplacer(questionnaire.id, versSaisie(brouillon)), 'Enregistré')
  })

  const publier = () => {
    if (!window.confirm('Publier ce questionnaire ? Il ne sera plus modifiable et son adresse pourra être diffusée.')) return
    void executer('publier', async () => {
      adopter(await api.questionnaires.publier(questionnaire.id), 'Questionnaire publié')
    })
  }

  const clore = () => {
    if (!window.confirm('Clore ce questionnaire ? Plus aucune réponse ne sera acceptée.')) return
    void executer('clore', async () => {
      adopter(await api.questionnaires.clore(questionnaire.id), 'Questionnaire clos')
    })
  }

  const supprimer = () => {
    if (!window.confirm(`Supprimer le questionnaire « ${questionnaire.public_vise} » ? Cette action est définitive.`)) return
    void executer('supprimer', async () => {
      await api.questionnaires.supprimer(questionnaire.id)
      liberer()
      naviguer(fiche)
    })
  }

  const occupe = enCours !== null

  return (
    <>
      <Link to={fiche} className={CLASSE_LIEN}>← Projet</Link>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 mt-3">
        <h1 className="font-display font-bold text-[1.35rem] break-words min-w-0">{questionnaire.public_vise}</h1>
        <Chip label={LIBELLES_STATUT_QUESTIONNAIRE[questionnaire.statut]} />
      </div>
      <p className="font-mono text-[0.62rem] text-muted mt-1 mb-5">{LIBELLES_MODE[questionnaire.mode]}</p>

      {lectureSeule && (
        <div className="mb-5 border-l-[3px] border-gold bg-warn-bg text-warn-fg px-4 py-3 text-[0.86rem]">
          <p className="mb-2">
            Ce questionnaire est publié : il n'est plus modifiable.
            {questionnaire.statut === 'clos' && ' Il est clos : plus aucune réponse n\'est acceptée.'}
          </p>
          <div className="font-mono text-[0.6rem] uppercase tracking-wider mb-1">Adresse à diffuser</div>
          <Adresse code={questionnaire.code} />
        </div>
      )}

      {/* Un `fieldset` désactivé désactive tous ses champs : lecture seule, ou enregistrement en cours. */}
      <fieldset disabled={lectureSeule || occupe} className="min-w-0">
        <legend className="sr-only">Réglages et contenu du questionnaire</legend>
        <QuestionnaireReglages brouillon={brouillon} onChange={changer} />
        <QuestionnaireContenu
          contenu={brouillon.contenu} lectureSeule={lectureSeule} onChange={contenu => changer({ contenu })}
        />
      </fieldset>

      {questionnaire.statut !== 'brouillon' && (
        <QuestionnaireRepondants questionnaireId={questionnaire.id} statut={questionnaire.statut} />
      )}

      {(questionnaire.statut !== 'clos' || succes || erreur) && (
        <div className="sticky bottom-0 -mx-4 mt-6 px-4 py-3 bg-paper border-t border-border">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {questionnaire.statut === 'brouillon' && (
              <>
                <Button variant="primary" loading={enCours === 'enregistrer'} disabled={!modifie || occupe} onClick={() => void enregistrer()}>
                  Enregistrer
                </Button>
                <Button
                  variant="dark" loading={enCours === 'publier'} disabled={modifie || occupe} onClick={publier}
                  title={modifie ? 'Enregistrez vos modifications avant de publier.' : undefined}
                >
                  Publier
                </Button>
                <Button variant="danger" loading={enCours === 'supprimer'} disabled={occupe} onClick={supprimer}>Supprimer</Button>
              </>
            )}
            {questionnaire.statut === 'ouvert' && (
              <Button variant="danger" loading={enCours === 'clore'} disabled={occupe} onClick={clore}>Clore</Button>
            )}
            {modifie && (
              <span role="status" className="font-mono text-[0.66rem] uppercase tracking-wider text-warn-fg">
                Modifications non enregistrées
              </span>
            )}
            {!modifie && succes && <Confirmation>{succes}</Confirmation>}
          </div>
          <Alerte className="mt-2">{erreur}</Alerte>
        </div>
      )}
    </>
  )
}
