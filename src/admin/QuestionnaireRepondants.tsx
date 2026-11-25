import { useState } from 'react'
import type { StatutQuestionnaire } from '../../shared/interviews'
import { STATUTS_REPONDANT, type RepondantResume, type StatutRepondant } from '../../shared/repondants'
import { Button } from '../components/ui/Button'
import { api } from './api'
import { BoutonsExport } from './BoutonsExport'
import { Chargement, ErreurChargement, useChargement } from './commun'
import { InvitationFormulaire } from './InvitationFormulaire'
import { nombre } from './libelles'
import { ListeRepondants } from './ListeRepondants'
import { SectionFiche } from './SectionFiche'

const LIBELLES_COMPTEUR: Record<StatutRepondant, [string, string]> = {
  invite: ['invité', 'invités'],
  commence: ['commencé', 'commencés'],
  termine: ['terminé', 'terminés'],
}

/** Nombre de répondants à chaque statut : invités sans réponse encore, commencés, terminés. */
function Compteurs({ repondants }: { repondants: RepondantResume[] }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 mb-4">
      {STATUTS_REPONDANT.map(statut => {
        const n = repondants.filter(r => r.statut === statut).length
        const [un, plusieurs] = LIBELLES_COMPTEUR[statut]
        return (
          <div key={statut} className="flex items-baseline gap-1.5">
            {/* Le terme avant sa valeur dans le balisage, le nombre en premier à l'écran. */}
            <dt className="order-2 font-mono text-[0.62rem] uppercase tracking-wider text-muted">{n > 1 ? plusieurs : un}</dt>
            <dd className="order-1 font-display font-bold text-[1.35rem] leading-none">{nombre(n)}</dd>
          </div>
        )
      })}
    </dl>
  )
}

interface Props {
  questionnaireId: string
  statut: StatutQuestionnaire
}

/** Suivi des répondants d'un questionnaire publié : invitations, avancement, accès à chaque entretien. */
export function QuestionnaireRepondants({ questionnaireId, statut }: Props) {
  const { etat, recharger, remplacer } = useChargement(() => api.repondants.lister(questionnaireId), questionnaireId)
  const [invitation, setInvitation] = useState(false)

  const invite = (repondant: RepondantResume) => {
    remplacer(liste => [repondant, ...liste.filter(r => r.id !== repondant.id)])
    setInvitation(false)
  }

  return (
    <div className="mt-6">
      <SectionFiche
        titre="Répondants"
        aide="Rafraîchissez pour voir les dernières réponses. Le lien d'une invitation est personnel : transmettez-le à la seule personne invitée."
      >
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {statut === 'ouvert' && !invitation && (
            <Button variant="primary" size="sm" onClick={() => setInvitation(true)}>Inviter une personne</Button>
          )}
          <Button size="sm" variant="ghost" onClick={recharger} disabled={etat.phase === 'chargement'}>Actualiser</Button>
        </div>

        {invitation && (
          <div className="mb-5">
            <InvitationFormulaire questionnaireId={questionnaireId} onInvite={invite} onAnnuler={() => setInvitation(false)} />
          </div>
        )}

        {etat.phase === 'chargement' && <Chargement />}
        {etat.phase === 'erreur' && <ErreurChargement message={etat.message} onReessayer={recharger} />}
        {etat.phase === 'pret' && (
          <>
            <Compteurs repondants={etat.donnees} />
            {etat.donnees.length === 0
              ? <p className="text-[0.84rem] text-muted">Aucun répondant pour l'instant.</p>
              : <ListeRepondants repondants={etat.donnees} />}
          </>
        )}
        <BoutonsExport cible={{ questionnaire_id: questionnaireId }} />
      </SectionFiche>
    </div>
  )
}
