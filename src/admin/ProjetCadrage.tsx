import { useState } from 'react'
import { LIMITES, type ProjetComplet } from '../../shared/interviews'
import { api } from './api'
import { ApercuMarkdown } from './ApercuMarkdown'
import { ChampZone, CLASSE_AIDE, CLASSE_LIBELLE } from './champs'
import { useAction } from './commun'
import { useSaisieNonEnregistree } from './saisies'
import { SectionFiche } from './SectionFiche'

interface Cadrage {
  note_cadrage: string
  resume_contexte: string
}

const AIDE_NOTE = 'Rédigée avec Claude via le connecteur MCP, ou à la main.'

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

export function ProjetCadrage({ projet, onMaj }: { projet: ProjetComplet; onMaj: (projet: ProjetComplet) => void }) {
  const [saisie, setSaisie] = useState<Partial<Cadrage>>({})
  const [apercu, setApercu] = useState(false)
  const action = useAction()

  const valeurs: Cadrage = { note_cadrage: projet.note_cadrage, resume_contexte: projet.resume_contexte, ...saisie }
  const modifie = valeurs.note_cadrage !== projet.note_cadrage || valeurs.resume_contexte !== projet.resume_contexte
  useSaisieNonEnregistree(modifie)

  const changer = (modif: Partial<Cadrage>) => setSaisie(actuelle => ({ ...actuelle, ...modif }))

  const enregistrer = () => {
    void action.lancer(async () => {
      // Le projet renvoyé porte le statut recalculé par le serveur (un brouillon devient « Cadré »).
      onMaj(await api.projets.modifier(projet.id, valeurs))
      setSaisie({})
    })
  }

  return (
    <SectionFiche titre="Note de cadrage" enregistrement={{ action, modifie, onEnregistrer: enregistrer }}>
      <div className="flex gap-0 mb-3" role="group" aria-label="Affichage de la note">
        <Bascule active={!apercu} onClick={() => setApercu(false)}>Éditer</Bascule>
        <Bascule active={apercu} onClick={() => setApercu(true)}>Aperçu</Bascule>
      </div>
      {apercu ? (
        <div className="mb-4">
          <div className={CLASSE_LIBELLE}>Note de cadrage (aperçu)</div>
          <div className="border border-border bg-paper px-4 py-3 min-h-[8rem] min-w-0">
            <ApercuMarkdown texte={valeurs.note_cadrage} />
          </div>
          <p className={CLASSE_AIDE}>{AIDE_NOTE}</p>
        </div>
      ) : (
        <ChampZone
          id="cadrage-note" libelle="Note de cadrage (Markdown)" valeur={valeurs.note_cadrage} lignes={16}
          onChange={note_cadrage => changer({ note_cadrage })} maxLength={LIMITES.note_cadrage} aide={AIDE_NOTE}
        />
      )}
      <ChampZone
        id="cadrage-resume" libelle="Résumé de contexte" valeur={valeurs.resume_contexte} lignes={6}
        onChange={resume_contexte => changer({ resume_contexte })} maxLength={LIMITES.resume_contexte}
        aide="Utilisé à chaque entretien à la place des documents complets"
      />
    </SectionFiche>
  )
}
