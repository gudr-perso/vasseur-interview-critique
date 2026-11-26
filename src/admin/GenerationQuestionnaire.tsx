import { useState, type FormEvent } from 'react'
import {
  CONSIGNES_GENERATION_MAX, type EnteteGeneration, type PublicPropose, type SuccesGeneration, type SuccesPublics,
} from '../../shared/generation'
import { LIMITES, MODES, type Mode } from '../../shared/interviews'
import { Button } from '../components/ui/Button'
import { Chip } from '../components/ui/Chip'
import { api, type DemandeGenerationQuestionnaire } from './api'
import { useAppelFlux } from './appelFlux'
import { RappelModele } from './CadrageIa'
import { CLASSE_AIDE, ChampListe, ChampTexte, ChampZone } from './champs'
import { Alerte } from './commun'
import { AppelEnCours, ContexteTronque } from './EtatAppel'
import { libelle, LIBELLES_MODE, optionsDe } from './libelles'
import { useSaisieNonEnregistree } from './saisies'

const OPTIONS_MODE = optionsDe(MODES, LIBELLES_MODE)
const AVERTISSEMENT_PUBLICS = "Gardez cette page ouverte jusqu'à la fin de la proposition : sinon, elle est perdue."
const AVERTISSEMENT_GENERATION =
  "Gardez cette page ouverte jusqu'à la fin : une génération interrompue risque de ne créer aucun brouillon."

function ListePublics({ publics, occupe, onGenerer }: {
  publics: PublicPropose[]; occupe: boolean; onGenerer: (p: PublicPropose) => void
}) {
  return (
    <ul className="grid gap-2 mt-3" aria-label="Publics proposés">
      {publics.map(p => (
        <li key={`${p.public_vise}-${p.mode}`} className="border border-border px-3 py-2.5 min-w-0">
          <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <span className="text-[0.9rem] font-medium break-words min-w-0">{p.public_vise}</span>
            <Chip label={libelle(LIBELLES_MODE, p.mode)} />
          </span>
          <p className="text-[0.8rem] text-muted leading-snug mt-1 break-words">{p.justification}</p>
          <Button type="button" size="sm" className="mt-2" disabled={occupe} onClick={() => onGenerer(p)}>
            Générer ce questionnaire
          </Button>
        </li>
      ))}
    </ul>
  )
}

interface Libre {
  publicVise: string
  mode: Mode
  consignes: string
}

const LIBRE_VIDE: Libre = { publicVise: '', mode: 'hybride', consignes: '' }

function FormulaireLibre({ occupe, onGenerer }: { occupe: boolean; onGenerer: (demande: DemandeGenerationQuestionnaire, liberer: () => void) => void }) {
  const [libre, setLibre] = useState<Libre>(LIBRE_VIDE)
  const [erreur, setErreur] = useState('')
  const liberer = useSaisieNonEnregistree(libre.publicVise.trim() !== '' || libre.consignes.trim() !== '')
  const changer = (modif: Partial<Libre>) => {
    setLibre(actuel => ({ ...actuel, ...modif }))
    setErreur('')
  }

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    if (occupe) return
    if (!libre.publicVise.trim()) return setErreur('Le public visé est obligatoire.')
    const consignes = libre.consignes.trim()
    onGenerer({ public_vise: libre.publicVise.trim(), mode: libre.mode, ...(consignes ? { consignes } : {}) }, liberer)
  }

  return (
    <form onSubmit={soumettre} noValidate aria-label="Générer un questionnaire pour un public précis" className="mt-4">
      <fieldset disabled={occupe} className="min-w-0">
        <legend className="font-mono text-[0.66rem] uppercase tracking-wider text-ink mb-2">Ou un public précis</legend>
        <ChampTexte
          id="generer-q-public" libelle="Public visé" valeur={libre.publicVise} onChange={publicVise => changer({ publicVise })}
          maxLength={LIMITES.public_vise} placeholder="Ex : comptables, responsables de site…" erreur={erreur || undefined}
        />
        <ChampListe id="generer-q-mode" libelle="Mode" valeur={libre.mode} options={OPTIONS_MODE} onChange={mode => changer({ mode })} />
        <ChampZone
          id="generer-q-consignes" libelle="Consignes (facultatives)" valeur={libre.consignes} lignes={3}
          onChange={consignes => changer({ consignes })} maxLength={CONSIGNES_GENERATION_MAX}
          aide="Ce que l'IA doit privilégier ou éviter : thèmes, durée, vocabulaire…"
        />
      </fieldset>
      <Button type="submit" variant="primary" disabled={occupe}>Générer le questionnaire</Button>
    </form>
  )
}

interface Props {
  projetId: string
  modele: string
  /** La note de cadrage enregistrée est vide : le serveur refusera. */
  noteVide: boolean
  /** Brouillon créé : à ouvrir dans l'éditeur. */
  onGenere: (questionnaireId: string) => void
  onFermer: () => void
}

/** Publics proposés par l'IA, puis génération d'un questionnaire en brouillon, avec le modèle de cadrage du projet. */
export function GenerationQuestionnaire({ projetId, modele, noteVide, onGenere, onFermer }: Props) {
  const publics = useAppelFlux<EnteteGeneration, SuccesPublics>()
  const generation = useAppelFlux<EnteteGeneration, SuccesGeneration>()
  const [cible, setCible] = useState('')
  const occupe = publics.enCours || generation.enCours
  const libererAppel = useSaisieNonEnregistree(generation.enCours, AVERTISSEMENT_GENERATION)
  useSaisieNonEnregistree(publics.enCours, AVERTISSEMENT_PUBLICS)

  const generer = async (demande: DemandeGenerationQuestionnaire, libererSaisie?: () => void) => {
    if (occupe) return
    setCible(demande.public_vise)
    const fin = await generation.lancer((surTexte, signal) => api.projets.genererQuestionnaire(projetId, demande, surTexte, signal))
    if (fin?.phase !== 'terminee') return
    libererAppel()
    libererSaisie?.()
    onGenere(fin.succes.questionnaire_id)
  }

  const proposer = () => {
    if (!occupe) void publics.lancer((surTexte, signal) => api.projets.proposerPublics(projetId, surTexte, signal))
  }

  return (
    <div className="border border-ink p-4 mt-4" role="region" aria-label="Génération de questionnaires par l'IA">
      <h3 className="font-display text-[0.95rem] mb-1">Générer avec l'IA</h3>
      <p className={`${CLASSE_AIDE} mb-3`}>
        L'IA s'appuie sur la note de cadrage enregistrée. Le questionnaire est créé en brouillon et s'ouvre dans l'éditeur pour relecture.
      </p>
      {noteVide && <p className="text-[0.8rem] text-warn-fg mb-3 leading-snug">Rédigez et enregistrez d'abord la note de cadrage.</p>}
      <Button type="button" onClick={proposer} disabled={occupe} loading={publics.enCours}>Proposer des publics</Button>
      <RappelModele modele={modele} />
      {publics.etat.phase === 'en_cours' && (
        <div className="mt-3">
          <AppelEnCours libelle="L'IA cherche les publics à interroger…" debut={publics.etat.debut} avertissement={AVERTISSEMENT_PUBLICS} />
        </div>
      )}
      {publics.etat.phase === 'terminee' && (
        <>
          <ContexteTronque tronque={publics.etat.entete.contexte_tronque} />
          <ListePublics publics={publics.etat.succes.publics} occupe={occupe} onGenerer={p => void generer(p)} />
        </>
      )}
      <Alerte className="mt-3">{publics.etat.phase === 'erreur' ? publics.etat.message : ''}</Alerte>

      <FormulaireLibre occupe={occupe} onGenerer={(demande, liberer) => void generer(demande, liberer)} />

      <div className="mt-4">
        {generation.etat.phase === 'en_cours' && (
          <AppelEnCours
            libelle={`L'IA rédige le questionnaire « ${cible} »…`} debut={generation.etat.debut} avertissement={AVERTISSEMENT_GENERATION}
          />
        )}
        {generation.etat.phase === 'terminee' && <p role="status" className="text-[0.8rem] text-ok-fg">Brouillon créé : ouverture de l'éditeur…</p>}
        <Alerte>{generation.etat.phase === 'erreur' ? generation.etat.message : ''}</Alerte>
      </div>
      <Button type="button" variant="ghost" className="mt-4" onClick={onFermer} disabled={occupe}>Fermer</Button>
    </div>
  )
}
