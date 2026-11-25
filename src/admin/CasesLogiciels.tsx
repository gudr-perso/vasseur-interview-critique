import { Link } from 'react-router-dom'
import type { Logiciel } from '../../shared/interviews'
import { CLASSE_AIDE, CLASSE_LIBELLE } from './champs'
import { CLASSE_LIEN } from './commun'

interface CasesLogicielsProps {
  /** Préfixe des identifiants de cases, unique dans la page. */
  prefixe: string
  logiciels: Logiciel[]
  choisis: string[]
  onChange: (ids: string[]) => void
}

/** Logiciels concernés par un projet, en cases à cocher. */
export function CasesLogiciels({ prefixe, logiciels, choisis, onChange }: CasesLogicielsProps) {
  const basculer = (id: string) =>
    onChange(choisis.includes(id) ? choisis.filter(c => c !== id) : [...choisis, id])

  return (
    <fieldset className="mb-4 min-w-0">
      <legend className={CLASSE_LIBELLE}>Logiciels concernés</legend>
      {logiciels.length === 0 ? (
        <p className={CLASSE_AIDE}>
          Aucun logiciel enregistré. <Link to="/admin/logiciels" className={CLASSE_LIEN}>Gérer les logiciels</Link>
        </p>
      ) : (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {logiciels.map(logiciel => (
            <label key={logiciel.id} htmlFor={`${prefixe}-${logiciel.id}`} className="inline-flex items-center gap-2 text-[0.86rem] cursor-pointer break-words min-w-0">
              <input
                id={`${prefixe}-${logiciel.id}`}
                type="checkbox"
                className="accent-red shrink-0"
                checked={choisis.includes(logiciel.id)}
                onChange={() => basculer(logiciel.id)}
              />
              {logiciel.nom}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  )
}
