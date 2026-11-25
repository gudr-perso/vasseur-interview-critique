import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  LIMITES, MODES, type Contenu, type Mode, type Questionnaire, type QuestionnaireResume,
} from '../../shared/interviews'
import { Button } from '../components/ui/Button'
import { Chip } from '../components/ui/Chip'
import { Adresse } from './Adresse'
import { api } from './api'
import { ChampListe, ChampTexte, ChampZone } from './champs'
import { Alerte, useAction } from './commun'
import { contenuVide, estHybride } from './contenu'
import { libelle, LIBELLES_MODE, LIBELLES_STATUT_QUESTIONNAIRE, optionsDe } from './libelles'
import { useSaisieNonEnregistree } from './saisies'
import { SectionFiche } from './SectionFiche'

const OPTIONS_MODE = optionsDe(MODES, LIBELLES_MODE)
const AIDE_OBJECTIF = "Ce qu'on cherche à apprendre — jamais montré au répondant"

interface Premier {
  libelle: string
  objectif: string
  ouverture: string
  titre: string
}

const PREMIER_VIDE: Premier = { libelle: '', objectif: '', ouverture: '', titre: '' }

/** Contenu de départ : celui de `contenuVide`, son unique élément rempli avec la saisie. */
function premierContenu(mode: Mode, premier: Premier): Contenu {
  const vide = contenuVide(mode)
  return estHybride(vide)
    ? { questions: vide.questions.map(q => ({ ...q, libelle: premier.libelle, objectif: premier.objectif })) }
    : {
        question_ouverture: premier.ouverture,
        themes: vide.themes.map(t => ({ ...t, titre: premier.titre, objectif: premier.objectif })),
      }
}

function FormulaireQuestionnaire(
  { projetId, onCree, onAnnuler }: { projetId: string; onCree: (q: Questionnaire) => void; onAnnuler: () => void },
) {
  const [publicVise, setPublicVise] = useState('')
  const [mode, setMode] = useState<Mode>('hybride')
  const [premier, setPremier] = useState<Premier>(PREMIER_VIDE)
  const action = useAction()
  const liberer = useSaisieNonEnregistree(publicVise !== '' || Object.values(premier).some(v => v !== ''))
  const changer = (modif: Partial<Premier>) => setPremier(actuel => ({ ...actuel, ...modif }))

  const creer = async (e: FormEvent) => {
    e.preventDefault()
    if (!publicVise.trim()) return action.signaler('Le public visé est obligatoire.')
    await action.lancer(async () => {
      const questionnaire = await api.projets.creerQuestionnaire(projetId, {
        public_vise: publicVise, mode, contenu: premierContenu(mode, premier),
      })
      liberer()
      onCree(questionnaire)
    })
  }

  return (
    <form onSubmit={creer} noValidate aria-label="Nouveau questionnaire" className="border border-ink p-4 mt-4">
      <h3 className="font-display text-[0.95rem] mb-3">Nouveau questionnaire</h3>
      <ChampTexte
        id="nouveau-q-public" libelle="Public visé" valeur={publicVise} onChange={setPublicVise}
        maxLength={LIMITES.public_vise} placeholder="Ex : comptables, responsables de site…" autoFocus
      />
      <ChampListe id="nouveau-q-mode" libelle="Mode" valeur={mode} options={OPTIONS_MODE} onChange={setMode} />
      {mode === 'hybride' ? (
        <>
          <ChampZone
            id="nouveau-q-libelle" libelle="Première question" valeur={premier.libelle} lignes={2}
            onChange={v => changer({ libelle: v })} maxLength={LIMITES.libelle}
            aide="Texte libre par défaut : le type et les autres questions se règlent ensuite dans l'éditeur."
          />
          <ChampZone
            id="nouveau-q-objectif" libelle="Objectif de la question" valeur={premier.objectif} lignes={2}
            onChange={v => changer({ objectif: v })} maxLength={LIMITES.objectif} aide={AIDE_OBJECTIF}
          />
        </>
      ) : (
        <>
          <ChampZone
            id="nouveau-q-ouverture" libelle="Question d'ouverture" valeur={premier.ouverture} lignes={2}
            onChange={v => changer({ ouverture: v })} maxLength={LIMITES.question_ouverture}
          />
          <ChampTexte
            id="nouveau-q-theme" libelle="Titre du premier thème" valeur={premier.titre}
            onChange={v => changer({ titre: v })} maxLength={LIMITES.titre_theme}
          />
          <ChampZone
            id="nouveau-q-objectif" libelle="Objectif du thème" valeur={premier.objectif} lignes={2}
            onChange={v => changer({ objectif: v })} maxLength={LIMITES.objectif} aide={AIDE_OBJECTIF}
          />
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" loading={action.enCours}>Créer le questionnaire</Button>
        <Button type="button" variant="ghost" onClick={onAnnuler} disabled={action.enCours}>Annuler</Button>
      </div>
      <Alerte className="mt-3">{action.erreur}</Alerte>
    </form>
  )
}

interface Props {
  projetId: string
  questionnaires: QuestionnaireResume[]
  onCree: (questionnaire: Questionnaire) => void
}

export function ProjetQuestionnaires({ projetId, questionnaires, onCree }: Props) {
  const naviguer = useNavigate()
  const [creation, setCreation] = useState(false)

  const ouvrirEditeur = (questionnaire: Questionnaire) => {
    // La fiche est mise à jour d'abord : si une autre section retient la navigation, le questionnaire y figure déjà.
    onCree(questionnaire)
    setCreation(false)
    naviguer(`/admin/questionnaires/${questionnaire.id}`)
  }

  return (
    <SectionFiche titre="Questionnaires">
      {questionnaires.length === 0
        ? <p className="text-[0.84rem] text-muted">Aucun questionnaire.</p>
        : (
          <ul className="grid gap-2">
            {questionnaires.map(q => (
              <li key={q.id} className="border border-border min-w-0">
                <Link to={`/admin/questionnaires/${q.id}`} className="block px-3 py-2.5 hover:bg-paper transition-colors">
                  <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <span className="text-[0.9rem] break-words min-w-0">{q.public_vise}</span>
                    <Chip label={libelle(LIBELLES_STATUT_QUESTIONNAIRE, q.statut)} />
                  </span>
                  <span className="block font-mono text-[0.62rem] text-muted mt-1">{libelle(LIBELLES_MODE, q.mode)}</span>
                </Link>
                {q.statut !== 'brouillon' && (
                  <div className="border-t border-border px-3 py-2"><Adresse code={q.code} /></div>
                )}
              </li>
            ))}
          </ul>
        )}
      {creation
        ? <FormulaireQuestionnaire projetId={projetId} onCree={ouvrirEditeur} onAnnuler={() => setCreation(false)} />
        : <Button className="mt-4" onClick={() => setCreation(true)}>Nouveau questionnaire</Button>}
    </SectionFiche>
  )
}
