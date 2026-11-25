import { LIMITES, type Contenu, type ContenuEntretien, type Question, type Theme } from '../../shared/interviews'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { BoutonsOrdre } from './BoutonsOrdre'
import { CarteQuestion } from './CarteQuestion'
import { ChampTexte, ChampZone } from './champs'
import { deplacer, estHybride, nouveauTheme, nouvelleQuestion } from './contenu'
import { QUESTIONS_MAX, THEMES_MAX } from './questionnaireBrouillon'

/** Suppression d'un élément saisi : confirmée seulement s'il contient du texte. */
function confirmerSuppression(designation: string, rempli: boolean): boolean {
  return !rempli || window.confirm(`Supprimer ${designation} ?`)
}

function ListeQuestions(
  { questions, lectureSeule, onChange }: { questions: Question[]; lectureSeule: boolean; onChange: (q: Question[]) => void },
) {
  return (
    <>
      {questions.map((question, i) => (
        <CarteQuestion
          key={question.id} question={question} index={i} total={questions.length} lectureSeule={lectureSeule}
          onChange={modifiee => onChange(questions.map((q, j) => (j === i ? modifiee : q)))}
          onDeplacer={sens => onChange(deplacer(questions, i, sens))}
          onSupprimer={() => {
            const rempli = question.libelle.trim() !== '' || question.objectif.trim() !== ''
            if (confirmerSuppression(`la question ${i + 1}`, rempli)) onChange(questions.filter((_, j) => j !== i))
          }}
        />
      ))}
      {!lectureSeule && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button" disabled={questions.length >= QUESTIONS_MAX}
            onClick={() => onChange([...questions, nouvelleQuestion(questions)])}
          >
            Ajouter une question
          </Button>
          <span className="font-mono text-[0.62rem] text-muted">{questions.length} sur {QUESTIONS_MAX} au plus</span>
        </div>
      )}
    </>
  )
}

function Themes(
  { contenu, lectureSeule, onChange }: { contenu: ContenuEntretien; lectureSeule: boolean; onChange: (c: ContenuEntretien) => void },
) {
  const { themes } = contenu
  const changerThemes = (suivants: Theme[]) => onChange({ ...contenu, themes: suivants })
  const changerTheme = (i: number, modif: Partial<Theme>) =>
    changerThemes(themes.map((t, j) => (j === i ? { ...t, ...modif } : t)))

  return (
    <>
      <Card padding="lg">
        <ChampZone
          id="entretien-ouverture" libelle="Question d'ouverture" valeur={contenu.question_ouverture} lignes={2}
          onChange={question_ouverture => onChange({ ...contenu, question_ouverture })}
          maxLength={LIMITES.question_ouverture} className="mb-0"
        />
      </Card>
      {themes.map((theme, i) => (
        <Card key={theme.id} padding="lg">
          <h3 className="font-display text-[1rem] mb-3">Thème {i + 1}</h3>
          <ChampTexte
            id={`theme-${theme.id}-titre`} libelle="Titre" valeur={theme.titre}
            onChange={titre => changerTheme(i, { titre })} maxLength={LIMITES.titre_theme}
          />
          <ChampZone
            id={`theme-${theme.id}-objectif`} libelle="Objectif" valeur={theme.objectif} lignes={2}
            onChange={objectif => changerTheme(i, { objectif })} maxLength={LIMITES.objectif}
            aide="Ce qu'on cherche à apprendre sur ce thème — jamais montré au répondant"
          />
          {!lectureSeule && (
            <BoutonsOrdre
              designation={`le thème ${i + 1}`} libelleSuppression="Supprimer le thème"
              index={i} total={themes.length}
              onDeplacer={sens => changerThemes(deplacer(themes, i, sens))}
              onSupprimer={() => {
                const rempli = theme.titre.trim() !== '' || theme.objectif.trim() !== ''
                if (confirmerSuppression(`le thème ${i + 1}`, rempli)) changerThemes(themes.filter((_, j) => j !== i))
              }}
            />
          )}
        </Card>
      ))}
      {!lectureSeule && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button" disabled={themes.length >= THEMES_MAX}
            onClick={() => changerThemes([...themes, nouveauTheme(themes)])}
          >
            Ajouter un thème
          </Button>
          <span className="font-mono text-[0.62rem] text-muted">{themes.length} sur {THEMES_MAX} au plus</span>
        </div>
      )}
    </>
  )
}

interface QuestionnaireContenuProps {
  contenu: Contenu
  lectureSeule: boolean
  onChange: (contenu: Contenu) => void
}

/** Questions (mode hybride) ou question d'ouverture et thèmes (mode entretien). */
export function QuestionnaireContenu({ contenu, lectureSeule, onChange }: QuestionnaireContenuProps) {
  return (
    <section aria-labelledby="titre-contenu" className="mt-6">
      <h2 id="titre-contenu" className="font-display text-[1.1rem] mb-3">
        {estHybride(contenu) ? 'Questions' : 'Entretien'}
      </h2>
      {estHybride(contenu)
        ? <ListeQuestions questions={contenu.questions} lectureSeule={lectureSeule} onChange={questions => onChange({ questions })} />
        : <Themes contenu={contenu} lectureSeule={lectureSeule} onChange={onChange} />}
    </section>
  )
}
