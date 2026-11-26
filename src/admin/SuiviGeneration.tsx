import { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ApercuMarkdown } from './ApercuMarkdown'
import { CLASSE_AIDE } from './champs'
import { Alerte, CLASSE_LIEN_BOUTON, Confirmation } from './commun'
import { AppelEnCours } from './EtatAppel'
import { AVERTISSEMENT_SORTIE, type EtatGeneration } from './generation'
import { nombre } from './libelles'

/** Aperçu qui suit la fin du texte tant que l'on n'a pas remonté soi-même. */
function ApercuDirect({ texte }: { texte: string }) {
  const boite = useRef<HTMLDivElement>(null)
  const colle = useRef(true)
  useLayoutEffect(() => {
    if (boite.current && colle.current) boite.current.scrollTop = boite.current.scrollHeight
  }, [texte])
  return (
    <div
      ref={boite} tabIndex={0} aria-label="Aperçu de l'analyse"
      onScroll={e => {
        const b = e.currentTarget
        colle.current = b.scrollHeight - b.scrollTop - b.clientHeight < 48
      }}
      className="max-h-[60vh] overflow-y-auto border border-border bg-white px-4 py-3 mt-3 focus:outline-none focus:border-ink"
    >
      <ApercuMarkdown texte={texte} />
    </div>
  )
}

function EnCours({ etat }: { etat: Extract<EtatGeneration, { phase: 'en_cours' }> }) {
  const demarre = etat.nb_entretiens !== null
  return (
    <>
      <AppelEnCours
        libelle={demarre ? `Génération en cours — ${nombre(etat.nb_entretiens ?? 0)} entretien(s)` : 'Préparation des entretiens…'}
        debut={etat.debut} avertissement={AVERTISSEMENT_SORTIE}
        detail={etat.texte ? `${nombre(etat.texte.length)} caractères` : undefined}
      />
      {!etat.texte && <p className={CLASSE_AIDE}>L'IA lit les entretiens ; le texte s'affichera ici dès les premiers mots.</p>}
      <ApercuDirect texte={etat.texte} />
    </>
  )
}

function Terminee({ etat }: { etat: Extract<EtatGeneration, { phase: 'terminee' }> }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Confirmation>Analyse terminée — {nombre(etat.nb_entretiens)} entretien(s)</Confirmation>
        <Link to={`/admin/analyses/${etat.analyseId}`} className={CLASSE_LIEN_BOUTON}>Ouvrir l'analyse enregistrée</Link>
      </div>
      <ApercuDirect texte={etat.texte} />
    </>
  )
}

/** Avancement d'une génération : état, durée, aperçu au fil de l'eau, puis lien vers l'analyse enregistrée. */
export function SuiviGeneration({ etat }: { etat: EtatGeneration }) {
  switch (etat.phase) {
    case 'repos':
      return null
    case 'en_cours':
      return <EnCours etat={etat} />
    case 'terminee':
      return <Terminee etat={etat} />
    case 'erreur':
      return (
        <>
          <Alerte>{etat.message}</Alerte>
          {etat.texte && (
            <>
              <p className={CLASSE_AIDE}>Texte reçu avant l'interruption :</p>
              <ApercuDirect texte={etat.texte} />
            </>
          )}
        </>
      )
  }
}
