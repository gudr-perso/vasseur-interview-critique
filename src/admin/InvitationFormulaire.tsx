import { useState, type FormEvent } from 'react'
import { LIMITES_REPONDANT, type Identite, type RepondantResume } from '../../shared/repondants'
import { Button } from '../components/ui/Button'
import { controlerIdentite, IDENTITE_VIDE, identiteNettoyee } from '../repondant/saisie'
import { api } from './api'
import { ChampTexte } from './champs'
import { Alerte, useAction } from './commun'
import { useSaisieNonEnregistree } from './saisies'

interface DescriptionChamp {
  champ: keyof Identite
  libelle: string
}

// Mêmes champs et mêmes règles que le formulaire du répondant (`src/repondant/FormulaireIdentite.tsx`).
const CHAMPS: DescriptionChamp[] = [
  { champ: 'nom', libelle: 'Nom' },
  { champ: 'prenom', libelle: 'Prénom' },
  { champ: 'entreprise', libelle: 'Entreprise' },
  { champ: 'poste', libelle: 'Poste (facultatif)' },
  { champ: 'mail', libelle: 'Adresse mail (facultatif)' },
]

interface Props {
  questionnaireId: string
  onInvite: (repondant: RepondantResume) => void
  onAnnuler: () => void
}

/** Invitation nominative : l'identité saisie ici sera proposée, modifiable, à la personne invitée. */
export function InvitationFormulaire({ questionnaireId, onInvite, onAnnuler }: Props) {
  const [identite, setIdentite] = useState<Identite>(IDENTITE_VIDE)
  const action = useAction()
  const liberer = useSaisieNonEnregistree(Object.values(identite).some(v => v.trim() !== ''))

  const inviter = async (e: FormEvent) => {
    e.preventDefault()
    if (action.enCours) return
    const manque = controlerIdentite(identite)
    if (manque) return action.signaler(manque.message)
    await action.lancer(async () => {
      const repondant = await api.repondants.inviter(questionnaireId, identiteNettoyee(identite))
      liberer()
      onInvite(repondant)
    })
  }

  return (
    <form onSubmit={e => void inviter(e)} noValidate aria-label="Inviter une personne" className="border border-ink p-4 mt-4">
      <h3 className="font-display text-[0.95rem] mb-3">Inviter une personne</h3>
      <fieldset disabled={action.enCours} className="min-w-0 grid sm:grid-cols-2 gap-x-4">
        <legend className="sr-only">Identité de la personne invitée</legend>
        {CHAMPS.map(({ champ, libelle }, i) => (
          <ChampTexte
            key={champ} id={`invitation-${champ}`} libelle={libelle} valeur={identite[champ]}
            onChange={v => setIdentite(actuelle => ({ ...actuelle, [champ]: v }))}
            maxLength={LIMITES_REPONDANT[champ]} autoComplete="off" autoFocus={i === 0}
            inputMode={champ === 'mail' ? 'email' : undefined}
          />
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" loading={action.enCours}>Créer l'invitation</Button>
        <Button type="button" variant="ghost" onClick={onAnnuler} disabled={action.enCours}>Annuler</Button>
      </div>
      <Alerte className="mt-3">{action.erreur}</Alerte>
    </form>
  )
}
