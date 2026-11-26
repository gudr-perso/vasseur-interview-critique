import { useId, type FormEvent, type ReactNode } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Alerte, Confirmation, type Action } from './commun'

interface Enregistrement {
  action: Action
  /** La section porte des modifications : sans elles, le bouton reste désactivé. */
  modifie: boolean
  /** Un travail en cours remplit la section (l'IA rédige) : l'enregistrement attend qu'il finisse. */
  bloque?: boolean
  onEnregistrer: () => void
}

interface SectionFicheProps {
  titre: string
  aide?: string
  /** Présent : la section est un formulaire avec son bouton « Enregistrer » et son message d'erreur. */
  enregistrement?: Enregistrement
  children: ReactNode
}

/** Section d'une fiche : une carte titrée, avec au besoin son propre enregistrement. */
export function SectionFiche({ titre, aide, enregistrement, children }: SectionFicheProps) {
  const idTitre = useId()
  const entete = (
    <>
      <h2 id={idTitre} className="font-display text-[1.1rem] mb-1">{titre}</h2>
      {aide && <p className="text-[0.8rem] text-muted leading-snug">{aide}</p>}
      <div className="mb-4" />
    </>
  )

  if (!enregistrement) {
    return (
      <Card padding="lg">
        <section aria-labelledby={idTitre}>{entete}{children}</section>
      </Card>
    )
  }

  const { action, modifie, bloque = false, onEnregistrer } = enregistrement
  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    if (modifie && !bloque && !action.enCours) onEnregistrer()
  }

  return (
    <Card padding="lg">
      <form onSubmit={soumettre} noValidate aria-labelledby={idTitre}>
        {entete}
        {/* Champs désactivés pendant l'enregistrement : une saisie tapée entre-temps serait effacée au retour. */}
        <fieldset disabled={action.enCours} className="min-w-0">
          <legend className="sr-only">{titre}</legend>
          {children}
        </fieldset>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-2">
          <Button type="submit" variant="primary" loading={action.enCours} disabled={!modifie || bloque}>Enregistrer</Button>
          {modifie && !action.enCours && (
            <span className="font-mono text-[0.66rem] uppercase tracking-wider text-warn-fg">Modifications non enregistrées</span>
          )}
          {!modifie && action.reussie && <Confirmation>Enregistré</Confirmation>}
        </div>
        <Alerte className="mt-3">{action.erreur}</Alerte>
      </form>
    </Card>
  )
}
