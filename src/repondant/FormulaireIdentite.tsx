import { useRef, useState, type FormEvent } from 'react'
import { LIMITES_REPONDANT, type Identite } from '../../shared/repondants'
import { messageErreur } from '../admin/commun'
import { controlerIdentite, IDENTITE_VIDE, identiteNettoyee } from './saisie'
import { TEXTES } from './textes'
import { AlerteR, Bouton, CLASSE_CHAMP_R, CLASSE_LIBELLE_R } from './ui'

interface DescriptionChamp {
  champ: keyof Identite
  libelle: string
  autoComplete: string
  facultatif?: boolean
  type?: 'text' | 'email'
}

const CHAMPS: DescriptionChamp[] = [
  { champ: 'nom', libelle: TEXTES.identite.nom, autoComplete: 'family-name' },
  { champ: 'prenom', libelle: TEXTES.identite.prenom, autoComplete: 'given-name' },
  { champ: 'entreprise', libelle: TEXTES.identite.entreprise, autoComplete: 'organization' },
  { champ: 'poste', libelle: TEXTES.identite.poste, autoComplete: 'organization-title', facultatif: true },
  { champ: 'mail', libelle: TEXTES.identite.mail, autoComplete: 'email', facultatif: true, type: 'email' },
]

interface FormulaireIdentiteProps {
  initiale?: Identite
  /** Envoie l'identité ; une erreur levée s'affiche telle quelle près du bouton, la saisie restant en place. */
  onValider: (identite: Identite) => Promise<void>
}

export function FormulaireIdentite({ initiale = IDENTITE_VIDE, onValider }: FormulaireIdentiteProps) {
  const [identite, setIdentite] = useState(initiale)
  const [erreur, setErreur] = useState('')
  const [enAttente, setEnAttente] = useState(false)
  const [champFautif, setChampFautif] = useState<keyof Identite | null>(null)
  const refs = useRef<Partial<Record<keyof Identite, HTMLInputElement | null>>>({})

  const changer = (champ: keyof Identite, valeur: string) => {
    setIdentite(actuelle => ({ ...actuelle, [champ]: valeur }))
    if (champ === champFautif) setChampFautif(null)
  }

  const envoyer = async (e: FormEvent) => {
    e.preventDefault()
    if (enAttente) return
    const manque = controlerIdentite(identite)
    if (manque) {
      setErreur(manque.message)
      setChampFautif(manque.champ)
      refs.current[manque.champ]?.focus()
      return
    }
    setErreur('')
    setChampFautif(null)
    setEnAttente(true)
    try {
      await onValider(identiteNettoyee(identite))
    } catch (err) {
      setErreur(messageErreur(err))
    } finally {
      setEnAttente(false)
    }
  }

  return (
    <form onSubmit={e => void envoyer(e)} noValidate>
      <div className="space-y-4 mb-6">
        {CHAMPS.map(({ champ, libelle, autoComplete, facultatif, type = 'text' }) => (
          <div key={champ}>
            <label htmlFor={`identite-${champ}`} className={CLASSE_LIBELLE_R}>
              {libelle}
              {facultatif && <span className="font-normal text-muted"> ({TEXTES.identite.facultatif})</span>}
            </label>
            <input
              id={`identite-${champ}`}
              ref={el => { refs.current[champ] = el }}
              type={type}
              inputMode={type === 'email' ? 'email' : undefined}
              autoComplete={autoComplete}
              autoCapitalize={type === 'email' ? 'none' : 'words'}
              spellCheck={false}
              maxLength={LIMITES_REPONDANT[champ]}
              required={!facultatif}
              aria-required={!facultatif}
              aria-invalid={champFautif === champ ? true : undefined}
              aria-describedby={champFautif === champ ? 'identite-erreur' : undefined}
              value={identite[champ]}
              onChange={e => changer(champ, e.target.value)}
              className={CLASSE_CHAMP_R}
            />
          </div>
        ))}
      </div>
      <div id="identite-erreur" className="mb-4 empty:hidden"><AlerteR>{erreur}</AlerteR></div>
      <Bouton type="submit" enCours={enAttente} className="w-full sm:w-auto">
        {enAttente ? TEXTES.question.patienter : TEXTES.identite.commencer}
      </Bouton>
    </form>
  )
}
