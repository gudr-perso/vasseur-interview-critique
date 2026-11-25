import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Spinner } from '../components/ui/Spinner'
import { ApercuMarkdown } from './ApercuMarkdown'
import { CLASSE_AIDE } from './champs'
import { Alerte, CLASSE_LIEN_BOUTON, Confirmation } from './commun'
import type { EtatGeneration } from './generation'
import { nombre } from './libelles'

/** Temps écoulé depuis `debut`, rafraîchi chaque seconde. */
function Duree({ debut }: { debut: number }) {
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    const minuterie = window.setInterval(() => setMaintenant(Date.now()), 1000)
    return () => window.clearInterval(minuterie)
  }, [])
  const secondes = Math.max(0, Math.floor((maintenant - debut) / 1000))
  return <>{Math.floor(secondes / 60)} min {String(secondes % 60).padStart(2, '0')} s</>
}

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

const CLASSE_ETAT = 'font-mono text-[0.66rem] uppercase tracking-wider'

function EnCours({ etat, onDetacher }: { etat: Extract<EtatGeneration, { phase: 'en_cours' }>; onDetacher: () => void }) {
  const demarre = etat.nb_entretiens !== null
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span role="status" className={`${CLASSE_ETAT} inline-flex items-center gap-2 text-ink`}>
          <Spinner size="sm" />
          {demarre ? `Génération en cours — ${nombre(etat.nb_entretiens ?? 0)} entretien(s)` : "Préparation des entretiens…"}
        </span>
        <span className={`${CLASSE_ETAT} text-muted`}>
          <Duree debut={etat.debut} />{etat.texte && ` · ${nombre(etat.texte.length)} caractères`}
        </span>
        {demarre && <Button size="sm" variant="ghost" onClick={onDetacher}>Arrêter de suivre</Button>}
      </div>
      <p className={CLASSE_AIDE}>
        {etat.texte
          ? "Arrêter de suivre ne stoppe pas la génération : l'analyse sera enregistrée et apparaîtra dans la liste."
          : "L'IA lit les entretiens ; le texte s'affichera ici dès les premiers mots."}
      </p>
      <ApercuDirect texte={etat.texte} />
    </>
  )
}

function Terminee({ etat }: { etat: Extract<EtatGeneration, { phase: 'terminee' }> }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Confirmation>Analyse terminée — {nombre(etat.nb_entretiens)} entretien(s)</Confirmation>
        {etat.analyseId && (
          <Link to={`/admin/analyses/${etat.analyseId}`} className={CLASSE_LIEN_BOUTON}>Ouvrir l'analyse enregistrée</Link>
        )}
        {etat.recherche && <span className={`${CLASSE_ETAT} text-muted`}>Enregistrement…</span>}
      </div>
      {!etat.recherche && !etat.analyseId && (
        <p className={CLASSE_AIDE}>L'enregistrement tarde : l'analyse apparaîtra dans la liste dans quelques instants.</p>
      )}
      <ApercuDirect texte={etat.texte} />
    </>
  )
}

/** Avancement d'une génération : état, durée, aperçu au fil de l'eau, puis lien vers l'analyse enregistrée. */
export function SuiviGeneration({ etat, onDetacher }: { etat: EtatGeneration; onDetacher: () => void }) {
  switch (etat.phase) {
    case 'repos':
      return null
    case 'en_cours':
      return <EnCours etat={etat} onDetacher={onDetacher} />
    case 'terminee':
      return <Terminee etat={etat} />
    case 'detachee':
      return (
        <p role="status" className="text-[0.84rem] leading-snug">
          Vous ne suivez plus l'affichage. La génération continue sur le serveur et l'analyse sera enregistrée :
          actualisez la liste dans quelques minutes.
        </p>
      )
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
