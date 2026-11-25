import type { ModelId } from '../../types'
import { useCatalogue } from '../../lib/modeles'

interface ModelSelectorProps {
  value: ModelId
  onChange: (m: ModelId) => void
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const { modeles } = useCatalogue()
  // Le modèle choisi reste affiché même s'il ne figure plus dans le catalogue.
  const options = modeles.some(m => m.id === value) ? modeles : [{ id: value, nom: value }, ...modeles]

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full mt-1 border border-border bg-paper px-3 py-2.5 text-[0.86rem] text-ink focus:outline-none focus:border-ink"
    >
      {options.map(m => (
        <option key={m.id} value={m.id}>{m.nom}</option>
      ))}
    </select>
  )
}
