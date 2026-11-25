import type { ModelId } from '../../types'
import { useCatalogue } from '../../lib/modeles'

interface ModelSelectorProps {
  /** Identifiant de la liste, pour y relier un libellé. */
  id?: string
  value: ModelId
  onChange: (m: ModelId) => void
}

export function ModelSelector({ id, value, onChange }: ModelSelectorProps) {
  const { modeles } = useCatalogue()
  // Le modèle choisi reste affiché même s'il ne figure plus dans le catalogue.
  const options = modeles.some(m => m.id === value) ? modeles : [{ id: value, nom: value }, ...modeles]

  return (
    <select
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full mt-1 border border-border bg-paper px-3 py-2.5 text-[0.86rem] text-ink focus:outline-none focus:border-ink disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {options.map(m => (
        <option key={m.id} value={m.id}>{m.nom}</option>
      ))}
    </select>
  )
}
