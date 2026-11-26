import { useState } from 'react'
import type { EnteteCadrage, SuccesTexteCadrage } from '../../shared/cadrage'
import { LIMITES, type ProjetFiche } from '../../shared/interviews'
import { Button } from '../components/ui/Button'
import { api } from './api'
import { ApercuMarkdown } from './ApercuMarkdown'
import { useAppelFlux, type EtatAppel } from './appelFlux'
import { CadrageIa, RappelModele } from './CadrageIa'
import { bornerTexte, ChampZone, CLASSE_AIDE, CLASSE_LIBELLE } from './champs'
import { Alerte, useAction } from './commun'
import { AppelEnCours, ContexteTronque } from './EtatAppel'
import { nombre } from './libelles'
import { champsModifies } from './modifications'
import { useSaisieNonEnregistree } from './saisies'
import { SectionFiche } from './SectionFiche'

interface Cadrage {
  note_cadrage: string
  resume_contexte: string
}

type ChampCadrage = keyof Cadrage

const AIDE_NOTE = "Rédigée par l'IA à la fin du dialogue, avec Claude via le connecteur MCP, ou à la main."

/** Ce que chaque rédaction par l'IA dit d'elle-même. */
const REDACTIONS: Record<ChampCadrage, { enCours: string; finie: string; remplacer: string }> = {
  note_cadrage: {
    enCours: "L'IA rédige la note…",
    finie: "Note rédigée par l'IA : relisez-la et corrigez-la, puis enregistrez.",
    remplacer: "La zone contient déjà une note de cadrage. La remplacer par celle que va rédiger l'IA ? Rien n'est enregistré tant que vous ne cliquez pas « Enregistrer ».",
  },
  resume_contexte: {
    enCours: "L'IA rédige le résumé…",
    finie: "Résumé rédigé par l'IA : relisez-le et corrigez-le, puis enregistrez.",
    remplacer: "La zone contient déjà un résumé de contexte. Le remplacer par celui que va rédiger l'IA ? Rien n'est enregistré tant que vous ne cliquez pas « Enregistrer ».",
  },
}

const AVERTISSEMENT_REDACTION = "Gardez cette page ouverte jusqu'à la fin de la rédaction : sinon, le texte de l'IA est perdu."

type EtatRedaction = EtatAppel<EnteteCadrage, SuccesTexteCadrage>

interface SuiviProps {
  etat: EtatRedaction
  champ: ChampCadrage
  /** Le texte de l'IA dépassait la longueur de la zone : il a été coupé. */
  coupe: boolean
}

function SuiviRedaction({ etat, champ, coupe }: SuiviProps) {
  const textes = REDACTIONS[champ]
  switch (etat.phase) {
    case 'repos':
      return null
    case 'en_cours':
      return (
        <div className="mb-3">
          <AppelEnCours
            libelle={textes.enCours} debut={etat.debut} avertissement={AVERTISSEMENT_REDACTION}
            detail={etat.texte ? `${nombre(etat.texte.length)} caractères` : undefined}
          />
          <ContexteTronque tronque={etat.entete?.contexte_tronque ?? false} />
        </div>
      )
    case 'terminee':
      return (
        <div className="mb-3">
          <p role="status" className="text-[0.8rem] text-ok-fg font-medium leading-snug">{textes.finie}</p>
          {etat.succes.tronquee && (
            <p className="text-[0.76rem] text-warn-fg mt-1 leading-snug">Longueur maximale atteinte : le texte s'arrête en cours de route.</p>
          )}
          {coupe && (
            <p className="text-[0.76rem] text-warn-fg mt-1 leading-snug">
              Le texte de l'IA dépassait {nombre(LIMITES[champ])} caractères, la longueur maximale de la zone : il a été coupé à
              cette longueur. Relisez la fin et raccourcissez-le si besoin.
            </p>
          )}
          <ContexteTronque tronque={etat.entete.contexte_tronque} />
        </div>
      )
    case 'erreur':
      return (
        <div className="mb-3">
          <Alerte>{etat.message}</Alerte>
          <p className={CLASSE_AIDE}>La zone a gardé son contenu précédent.</p>
        </div>
      )
  }
}

export function ProjetCadrage({ projet, onMaj }: { projet: ProjetFiche; onMaj: (projet: ProjetFiche) => void }) {
  const [saisie, setSaisie] = useState<Partial<Cadrage>>({})
  const [apercu, setApercu] = useState(false)
  /** Champs dont le texte rédigé par l'IA a dû être coupé à la longueur de la zone. */
  const [coupes, setCoupes] = useState<Partial<Record<ChampCadrage, boolean>>>({})
  const action = useAction()
  const note = useAppelFlux<EnteteCadrage, SuccesTexteCadrage>()
  const resume = useAppelFlux<EnteteCadrage, SuccesTexteCadrage>()
  const redige = note.enCours || resume.enCours

  const enregistre: Cadrage = { note_cadrage: projet.note_cadrage, resume_contexte: projet.resume_contexte }
  const valeurs: Cadrage = { ...enregistre, ...saisie }
  // Seuls les champs changés partent : Claude a pu écrire la note par le MCP depuis le chargement de la fiche.
  const modifs = champsModifies(enregistre, saisie)
  const modifie = Object.keys(modifs).length > 0
  useSaisieNonEnregistree(modifie)
  useSaisieNonEnregistree(redige, AVERTISSEMENT_REDACTION)

  const changer = (modif: Partial<Cadrage>) => setSaisie(actuelle => ({ ...actuelle, ...modif }))
  // Pendant une rédaction, la zone montre le texte reçu ; il n'entre dans la saisie qu'une fois la rédaction réussie.
  const affiche = (champ: ChampCadrage): string => {
    const etat = (champ === 'note_cadrage' ? note : resume).etat
    return etat.phase === 'en_cours' ? etat.texte : valeurs[champ]
  }

  const enregistrer = () => {
    void action.lancer(async () => {
      // Le projet renvoyé porte le statut recalculé par le serveur (un brouillon devient « Cadré »).
      onMaj(await api.projets.modifier(projet.id, modifs))
      // Les champs sont désactivés pendant l'appel : rien n'a pu être tapé entre-temps.
      setSaisie({})
      setCoupes({})
      note.effacer()
      resume.effacer()
    })
  }

  const rediger = async (champ: ChampCadrage) => {
    if (redige || action.enCours) return
    if (valeurs[champ].trim() && !window.confirm(REDACTIONS[champ].remplacer)) return
    const appel = champ === 'note_cadrage' ? note : resume
    const demander = champ === 'note_cadrage' ? api.cadrage.note : api.cadrage.resume
    setCoupes(actuels => ({ ...actuels, [champ]: false }))
    const fin = await appel.lancer((surTexte, signal) => demander(projet.id, surTexte, signal))
    if (fin?.phase !== 'terminee') return
    const { texte, coupe } = bornerTexte(fin.texte, LIMITES[champ])
    setCoupes(actuels => ({ ...actuels, [champ]: coupe }))
    changer(champ === 'note_cadrage' ? { note_cadrage: texte } : { resume_contexte: texte })
  }

  return (
    <SectionFiche titre="Note de cadrage" enregistrement={{ action, modifie, bloque: redige, onEnregistrer: enregistrer }}>
      <CadrageIa
        projetId={projet.id} modele={projet.modele_cadrage} noteEnCours={note.enCours}
        onRedigerNote={() => void rediger('note_cadrage')}
      />
      <SuiviRedaction etat={note.etat} champ="note_cadrage" coupe={coupes.note_cadrage ?? false} />
      <div className="flex gap-0 mb-3" role="group" aria-label="Affichage de la note">
        <Bascule active={!apercu} onClick={() => setApercu(false)}>Éditer</Bascule>
        <Bascule active={apercu} onClick={() => setApercu(true)}>Aperçu</Bascule>
      </div>
      {apercu ? (
        <div className="mb-4">
          <div className={CLASSE_LIBELLE}>Note de cadrage (aperçu)</div>
          <div className="border border-border bg-paper px-4 py-3 min-h-[8rem] min-w-0">
            <ApercuMarkdown texte={affiche('note_cadrage')} />
          </div>
          <p className={CLASSE_AIDE}>{AIDE_NOTE}</p>
        </div>
      ) : (
        <ChampZone
          id="cadrage-note" libelle="Note de cadrage (Markdown)" valeur={affiche('note_cadrage')} lignes={16}
          onChange={note_cadrage => changer({ note_cadrage })} maxLength={LIMITES.note_cadrage} aide={AIDE_NOTE}
          disabled={note.enCours}
        />
      )}
      <ChampZone
        id="cadrage-resume" libelle="Résumé de contexte" valeur={affiche('resume_contexte')} lignes={6}
        onChange={resume_contexte => changer({ resume_contexte })} maxLength={LIMITES.resume_contexte}
        aide="Utilisé à chaque entretien à la place des documents complets" disabled={resume.enCours}
      />
      <SuiviRedaction etat={resume.etat} champ="resume_contexte" coupe={coupes.resume_contexte ?? false} />
      <div className="mb-4">
        <Button type="button" size="sm" onClick={() => void rediger('resume_contexte')} disabled={redige} loading={resume.enCours}>
          Générer le résumé de contexte
        </Button>
        <RappelModele modele={projet.modele_cadrage} />
      </div>
    </SectionFiche>
  )
}

function Bascule({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button" aria-pressed={active} onClick={onClick}
      className={`font-mono text-[0.63rem] uppercase tracking-wider px-3 py-1.5 border transition-colors ${
        active ? 'bg-ink text-paper border-ink' : 'bg-paper text-ink border-border hover:bg-paper2'
      }`}
    >
      {children}
    </button>
  )
}
