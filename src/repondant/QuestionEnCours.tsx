import { useEffect, useState, type FormEvent } from 'react'
import type { EtatRepondant, Progression, QuestionPublique } from '../../shared/repondants'
import { messageErreur } from '../admin/commun'
import { estErreurReseau, exigeRelecture, repondantApi } from './api'
import { SaisieChoix } from './SaisieChoix'
import { SaisieEchelle } from './SaisieEchelle'
import { aCommentaire, libelleProgression, versReponse, type Brouillon } from './saisie'
import { Commentaire, ZoneTexte } from './SaisieTexte'
import { effacerBrouillon, garderBrouillon, lireBrouillon } from './stockage'
import { TEXTES } from './textes'
import { AlerteR, Bouton, Carte, TitreEtape } from './ui'

/** Délai après lequel l'attente de la question suivante est expliquée. */
const ATTENTE_LONGUE_MS = 4000

/** Vrai quand `actif` dure depuis plus de quatre secondes. */
function useAttenteLongue(actif: boolean): boolean {
  const [longue, setLongue] = useState(false)
  useEffect(() => {
    setLongue(false)
    if (!actif) return
    const minuterie = window.setTimeout(() => setLongue(true), ATTENTE_LONGUE_MS)
    return () => window.clearTimeout(minuterie)
  }, [actif])
  return longue
}

interface QuestionEnCoursProps {
  jeton: string
  question: QuestionPublique
  progression: Progression
  onEtat: (etat: EtatRepondant) => void
  /** L'état affiché n'est plus le bon (question déjà passée, questionnaire clos…) : le relire. */
  onRelire: () => void
}

/** Progression (mode hybride), puis la question ; ce bloc reste en place d'une question à l'autre. */
export function QuestionEnCours({ jeton, question, progression, onEtat, onRelire }: QuestionEnCoursProps) {
  const avancement = libelleProgression(question, progression)
  return (
    <>
      {avancement && (
        <div className="mb-4">
          <p aria-live="polite" className="font-mono text-[0.72rem] uppercase tracking-wider text-muted mb-2">
            {avancement.libelle}
          </p>
          <div aria-hidden="true" className="h-1 bg-paper2 overflow-hidden">
            <div className="h-full bg-red transition-[width] duration-500" style={{ width: `${Math.round(avancement.part * 100)}%` }} />
          </div>
        </div>
      )}
      {/* La clé vide la saisie et replace le focus à chaque nouvelle question. */}
      <FormulaireReponse key={question.ordre} jeton={jeton} question={question} onEtat={onEtat} onRelire={onRelire} />
    </>
  )
}

type FormulaireReponseProps = Omit<QuestionEnCoursProps, 'progression'>

function FormulaireReponse({ jeton, question, onEtat, onRelire }: FormulaireReponseProps) {
  const [brouillon, setBrouillon] = useState<Brouillon>(() => lireBrouillon(jeton, question.ordre))
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<{ message: string; reseau: boolean } | null>(null)
  const attenteLongue = useAttenteLongue(enCours)
  const reponse = versReponse(question, brouillon)
  const id = `question-${question.ordre}`

  useEffect(() => { garderBrouillon(jeton, question.ordre, brouillon) }, [jeton, question.ordre, brouillon])

  const changer = (modif: Partial<Brouillon>) => setBrouillon(actuel => ({ ...actuel, ...modif }))

  const envoyer = async (e: FormEvent) => {
    e.preventDefault()
    if (!reponse || enCours) return
    setEnCours(true)
    setErreur(null)
    try {
      const etat = await repondantApi.repondre(jeton, question.ordre, reponse)
      effacerBrouillon(jeton, question.ordre)
      onEtat(etat)
    } catch (err) {
      if (exigeRelecture(err)) onRelire()
      else setErreur({ message: messageErreur(err), reseau: estErreurReseau(err) })
    } finally {
      setEnCours(false)
    }
  }

  const libelleBouton = enCours ? TEXTES.question.patienter : erreur?.reseau ? TEXTES.question.reessayer : TEXTES.question.suivant

  return (
    <Carte>
      <form onSubmit={e => void envoyer(e)} noValidate>
        {question.rappel && (
          <div className="mb-5 border-l-2 border-border pl-3.5 text-[0.9rem] text-muted leading-relaxed">
            <p className="break-words">{question.rappel.question}</p>
            <p className="mt-1 break-words">
              <span className="text-ink/70">{TEXTES.question.rappel}</span>{' '}
              <span className="italic whitespace-pre-line">{question.rappel.reponse}</span>
            </p>
          </div>
        )}

        <TitreEtape niveau={2} className="text-[1.3rem] sm:text-[1.45rem] mb-5 whitespace-pre-line">
          <span id={`${id}-titre`}>{question.libelle}</span>
        </TitreEtape>

        <Saisie id={id} question={question} brouillon={brouillon} onChange={changer} />

        {aCommentaire(question.type) && (
          <Commentaire id={`${id}-commentaire`} valeur={brouillon.commentaire} onChange={commentaire => changer({ commentaire })} />
        )}

        <div className="mt-7 space-y-3">
          {erreur && <AlerteR>{erreur.message}</AlerteR>}
          <Bouton type="submit" enCours={enCours} disabled={!reponse} className="w-full sm:w-auto sm:min-w-[11rem]">
            {libelleBouton}
          </Bouton>
          {attenteLongue && <p role="status" className="text-[0.92rem] text-muted">{TEXTES.question.patienterLong}</p>}
        </div>
      </form>
    </Carte>
  )
}

interface SaisieProps {
  id: string
  question: QuestionPublique
  brouillon: Brouillon
  onChange: (modif: Partial<Brouillon>) => void
}

function Saisie({ id, question, brouillon, onChange }: SaisieProps) {
  switch (question.type) {
    case 'choix_unique':
    case 'choix_multiple':
      return (
        <SaisieChoix
          nom={id} libelle={question.libelle} options={question.options ?? []} multiple={question.type === 'choix_multiple'}
          choix={brouillon.choix} onChange={choix => onChange({ choix })}
        />
      )
    case 'echelle':
      return <SaisieEchelle nom={id} libelle={question.libelle} note={brouillon.note} onChange={note => onChange({ note })} />
    case 'texte':
    case 'relance':
    case 'ouverte':
      return (
        <ZoneTexte
          id={`${id}-texte`} valeur={brouillon.texte} onChange={texte => onChange({ texte })} lignes={5}
          libellePar={`${id}-titre`}
        />
      )
  }
}
