import { useState, type FormEvent } from 'react'
import { TYPES_ANALYSE, type TypeAnalyse } from '../../shared/analyses'
import type { QuestionnaireResume } from '../../shared/interviews'
import { Button } from '../components/ui/Button'
import { useCatalogue } from '../lib/modeles'
import { api, type DemandeAnalyse } from './api'
import { CLASSE_AIDE, ChampCase, ChampListe } from './champs'
import { Alerte, ErreurChargement, useChargement } from './commun'
import { useGenerationAnalyse } from './generation'
import { libelle, libelleSource, LIBELLES_STATUT_REPONDANT, LIBELLES_TYPE_ANALYSE, optionsDe } from './libelles'
import { useSaisieNonEnregistree } from './saisies'
import { SuiviGeneration } from './SuiviGeneration'

export interface ProjetPourAnalyse {
  id: string
  modele_analyse: string
  questionnaires: QuestionnaireResume[]
}

/** Fiche d'un répondant donné, lancée depuis la lecture de son entretien. */
export interface PreReglage {
  questionnaire_id: string
  repondant_id: string
}

interface Choix {
  type: TypeAnalyse
  /** Vide : projet entier (synthèse, expression de besoin). */
  questionnaireId: string
  repondantId: string
  inclureEnCours: boolean
}

const OPTIONS_TYPE = optionsDe(TYPES_ANALYSE, LIBELLES_TYPE_ANALYSE)
const AVERTISSEMENT_SORTIE = "L'analyse continue d'être produite et sera enregistrée même si vous quittez la page."

function demandeDe(choix: Choix): DemandeAnalyse | { erreur: string } {
  if (choix.type === 'fiche_repondant') {
    return choix.repondantId ? { type: choix.type, repondant_id: choix.repondantId } : { erreur: 'Choisissez le répondant.' }
  }
  return { type: choix.type, questionnaire_id: choix.questionnaireId || undefined, inclure_en_cours: choix.inclureEnCours }
}

/** Répondants dont l'entretien est commencé ou terminé. */
function ChoixRepondant({ questionnaireId, valeur, onChange }: { questionnaireId: string; valeur: string; onChange: (id: string) => void }) {
  const { etat, recharger } = useChargement(() => api.repondants.lister(questionnaireId), questionnaireId)
  if (etat.phase === 'chargement') return <p className={`${CLASSE_AIDE} mb-4`}>Chargement des répondants…</p>
  if (etat.phase === 'erreur') return <ErreurChargement message={etat.message} onReessayer={recharger} />
  const repondants = etat.donnees.filter(r => r.statut !== 'invite')
  if (repondants.length === 0) {
    return <p className="text-[0.84rem] text-muted mb-4">Aucun entretien commencé ou terminé dans ce questionnaire.</p>
  }
  const options = [
    { valeur: '', libelle: 'Choisir un répondant' },
    ...repondants.map(r => ({
      valeur: r.id,
      libelle: `${`${r.prenom} ${r.nom}`.trim() || r.entreprise} — ${libelle(LIBELLES_STATUT_REPONDANT, r.statut)}`,
    })),
  ]
  return <ChampListe id="analyse-repondant" libelle="Répondant" valeur={valeur} options={options} onChange={onChange} />
}

function ChoixAnalyse({ choix, onChange, questionnaires }: {
  choix: Choix; onChange: (choix: Choix) => void; questionnaires: QuestionnaireResume[]
}) {
  const changerType = (type: TypeAnalyse) => {
    // Une fiche porte sur un répondant : il faut un questionnaire pour le choisir.
    const questionnaireId = type === 'fiche_repondant' && !choix.questionnaireId ? questionnaires[0]?.id ?? '' : choix.questionnaireId
    onChange({ ...choix, type, questionnaireId })
  }
  const optionsQuestionnaires = questionnaires.map(q => ({ valeur: q.id, libelle: `Questionnaire : ${q.public_vise}` }))
  const fiche = choix.type === 'fiche_repondant'

  return (
    <>
      <ChampListe id="analyse-type" libelle="Type d'analyse" valeur={choix.type} options={OPTIONS_TYPE} onChange={changerType} />
      {fiche && questionnaires.length === 0 && <p className="text-[0.84rem] text-muted mb-4">Aucun questionnaire dans ce projet.</p>}
      {fiche && choix.questionnaireId && (
        <>
          <ChampListe
            id="analyse-questionnaire" libelle="Questionnaire" valeur={choix.questionnaireId} options={optionsQuestionnaires}
            onChange={id => onChange({ ...choix, questionnaireId: id, repondantId: '' })}
          />
          <ChoixRepondant
            questionnaireId={choix.questionnaireId} valeur={choix.repondantId}
            onChange={id => onChange({ ...choix, repondantId: id })}
          />
        </>
      )}
      {!fiche && (
        <>
          <ChampListe
            id="analyse-portee" libelle="Portée" valeur={choix.questionnaireId}
            options={[{ valeur: '', libelle: 'Projet entier' }, ...optionsQuestionnaires]}
            onChange={id => onChange({ ...choix, questionnaireId: id })}
          />
          <ChampCase
            id="analyse-en-cours" libelle="Inclure les entretiens en cours" className="mb-4"
            coche={choix.inclureEnCours} onChange={coche => onChange({ ...choix, inclureEnCours: coche })}
          />
        </>
      )}
    </>
  )
}

interface Props {
  projet: ProjetPourAnalyse
  preReglage?: PreReglage
  /** Appelé une fois l'analyse enregistrée, pour rafraîchir une liste. */
  onEnregistree?: () => void
  onFermer: () => void
}

/** Choix du type et de la portée, puis génération par l'API avec le modèle d'analyse du projet. */
export function GenerationAnalyse({ projet, preReglage, onEnregistree, onFermer }: Props) {
  const [choix, setChoix] = useState<Choix>(() => (preReglage
    ? { type: 'fiche_repondant', questionnaireId: preReglage.questionnaire_id, repondantId: preReglage.repondant_id, inclureEnCours: false }
    : { type: 'synthese', questionnaireId: '', repondantId: '', inclureEnCours: false }))
  const [erreurSaisie, setErreurSaisie] = useState('')
  const { etat, lancer, detacher } = useGenerationAnalyse(projet.id, () => onEnregistree?.())
  const enCours = etat.phase === 'en_cours'
  useSaisieNonEnregistree(enCours, AVERTISSEMENT_SORTIE)
  const { modeles } = useCatalogue()

  const generer = (e: FormEvent) => {
    e.preventDefault()
    if (enCours) return
    const demande = demandeDe(choix)
    if ('erreur' in demande) return setErreurSaisie(demande.erreur)
    setErreurSaisie('')
    void lancer(demande)
  }

  return (
    <div className="border border-ink p-4 mb-5">
      <form onSubmit={generer} noValidate aria-label="Nouvelle analyse">
        <h3 className="font-display text-[0.95rem] mb-3">Nouvelle analyse</h3>
        <fieldset disabled={enCours} className="min-w-0">
          <legend className="sr-only">Type et portée de l'analyse</legend>
          <ChoixAnalyse choix={choix} onChange={setChoix} questionnaires={projet.questionnaires} />
        </fieldset>
        <p className={`${CLASSE_AIDE} mb-3`}>
          Modèle : <span className="font-medium text-ink">{libelleSource(projet.modele_analyse, modeles)}</span>
          {' '}(modèle d'analyse du projet). Une analyse prend en général une à trois minutes.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" loading={enCours}>Générer</Button>
          <Button type="button" variant="ghost" onClick={onFermer} disabled={enCours}>Fermer</Button>
        </div>
        <Alerte className="mt-3">{erreurSaisie}</Alerte>
      </form>
      <div className="mt-4">
        <SuiviGeneration etat={etat} onDetacher={detacher} />
      </div>
    </div>
  )
}
