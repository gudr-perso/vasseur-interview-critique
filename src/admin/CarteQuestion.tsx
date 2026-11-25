import { LIMITES, TYPES_QUESTION, type Question, type TypeQuestion } from '../../shared/interviews'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { BoutonsOrdre } from './BoutonsOrdre'
import { ChampListe, ChampZone, CLASSE_CHAMP, CLASSE_LIBELLE } from './champs'
import { changerType } from './contenu'
import { LIBELLES_TYPE_QUESTION, optionsDe } from './libelles'
import { OPTIONS_MAX, OPTIONS_MIN } from './questionnaireBrouillon'

const OPTIONS_TYPE = optionsDe(TYPES_QUESTION, LIBELLES_TYPE_QUESTION)

interface CarteQuestionProps {
  question: Question
  index: number
  total: number
  lectureSeule: boolean
  onChange: (question: Question) => void
  onDeplacer: (sens: -1 | 1) => void
  onSupprimer: () => void
}

export function CarteQuestion({ question, index, total, lectureSeule, onChange, onDeplacer, onSupprimer }: CarteQuestionProps) {
  const numero = index + 1
  const prefixe = `question-${question.id}`
  const options = question.options

  const choisirType = (type: TypeQuestion) => {
    const suivante = changerType(question, type)
    const perdues = suivante.options === undefined && (options ?? []).some(o => o.trim() !== '')
    if (perdues && !window.confirm('Changer de type efface les options saisies.')) return
    onChange(suivante)
  }
  const changerOptions = (suivantes: string[]) => onChange({ ...question, options: suivantes })

  return (
    <Card padding="lg">
      <h3 className="font-display text-[1rem] mb-3">Question {numero}</h3>
      <ChampListe id={`${prefixe}-type`} libelle="Type" valeur={question.type} options={OPTIONS_TYPE} onChange={choisirType} />
      <ChampZone
        id={`${prefixe}-libelle`} libelle="Libellé" valeur={question.libelle} lignes={2}
        onChange={libelle => onChange({ ...question, libelle })} maxLength={LIMITES.libelle}
      />
      <ChampZone
        id={`${prefixe}-objectif`} libelle="Objectif" valeur={question.objectif} lignes={2}
        onChange={objectif => onChange({ ...question, objectif })} maxLength={LIMITES.objectif}
        aide="Ce qu'on cherche à apprendre — jamais montré au répondant, sert à décider d'une relance"
      />

      {options && (
        <fieldset className="mb-4 min-w-0">
          <legend className={CLASSE_LIBELLE}>Options ({OPTIONS_MIN} à {OPTIONS_MAX})</legend>
          <ul className="grid gap-2">
            {options.map((option, i) => (
              // Les options n'ont pas d'identifiant : leur rang sert de clé, les champs étant contrôlés.
              <li key={i} className="flex flex-wrap items-center gap-2">
                <input
                  type="text" value={option} maxLength={LIMITES.option}
                  aria-label={`Option ${i + 1} de la question ${numero}`}
                  onChange={e => changerOptions(options.map((o, j) => (j === i ? e.target.value : o)))}
                  className={`${CLASSE_CHAMP} flex-1 min-w-[10rem] w-auto`}
                />
                {!lectureSeule && (
                  <Button
                    type="button" size="sm" variant="ghost" disabled={options.length <= OPTIONS_MIN}
                    onClick={() => changerOptions(options.filter((_, j) => j !== i))}
                    aria-label={`Supprimer l'option ${i + 1} de la question ${numero}`}
                  >
                    Supprimer l'option
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {!lectureSeule && (
            <Button
              type="button" size="sm" className="mt-2" disabled={options.length >= OPTIONS_MAX}
              onClick={() => changerOptions([...options, ''])}
              aria-label={`Ajouter une option à la question ${numero}`}
            >
              Ajouter une option
            </Button>
          )}
        </fieldset>
      )}

      {!lectureSeule && (
        <BoutonsOrdre
          designation={`la question ${numero}`} libelleSuppression="Supprimer la question"
          index={index} total={total} onDeplacer={onDeplacer} onSupprimer={onSupprimer}
        />
      )}
    </Card>
  )
}
