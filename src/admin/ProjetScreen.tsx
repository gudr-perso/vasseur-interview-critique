import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Logiciel, ProjetFiche } from '../../shared/interviews'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Chip } from '../components/ui/Chip'
import { api, type ProjetAdmin } from './api'
import { Alerte, Chargement, CLASSE_LIEN, ErreurChargement, useAction, useChargement } from './commun'
import { LIBELLES_STATUT_PROJET } from './libelles'
import { ProjetCadrage } from './ProjetCadrage'
import { ProjetDocuments } from './ProjetDocuments'
import { ProjetInformations } from './ProjetInformations'
import { ProjetModeles } from './ProjetModeles'
import { ProjetQuestionnaires } from './ProjetQuestionnaires'
import { useToutLiberer } from './saisies'

function ZoneDanger({ projet }: { projet: ProjetAdmin }) {
  const naviguer = useNavigate()
  const toutLiberer = useToutLiberer()
  const action = useAction()

  const supprimer = () => {
    const n = projet.nb_entretiens
    const question = `Supprimer « ${projet.titre} » ? Ses documents et questionnaires seront supprimés.`
      + (n > 0 ? ` ${n} entretien(s) commencé(s) ou terminé(s) seront perdus. Cette action est définitive.` : '')
    if (!window.confirm(question)) return
    void action.lancer(async () => {
      await api.projets.supprimer(projet.id)
      // Le projet n'existe plus : les saisies en cours sur sa fiche n'ont plus d'objet.
      toutLiberer()
      naviguer('/admin')
    })
  }

  return (
    <Card padding="lg" className="border-red">
      <section aria-labelledby="zone-danger">
        <h2 id="zone-danger" className="font-display text-[1.1rem] mb-1 text-red">Zone de danger</h2>
        <p className="text-[0.8rem] text-muted mb-4 leading-snug">
          Supprimer le projet supprime aussi ses documents, ses questionnaires et les entretiens déjà menés.
        </p>
        <Button variant="danger" loading={action.enCours} onClick={supprimer}>Supprimer le projet</Button>
        <Alerte className="mt-3">{action.erreur}</Alerte>
      </section>
    </Card>
  )
}

export function ProjetScreen() {
  const { id = '' } = useParams()
  const { etat, recharger, remplacer } = useChargement(
    async (): Promise<{ projet: ProjetAdmin; logiciels: Logiciel[] }> => {
      const [projet, logiciels] = await Promise.all([api.projets.lire(id), api.logiciels.lister()])
      return { projet, logiciels }
    },
    id,
  )

  if (etat.phase === 'chargement') return <Chargement />
  if (etat.phase === 'erreur') {
    if (etat.statut !== 404) return <ErreurChargement message={etat.message} onReessayer={recharger} />
    return (
      <div className="py-10 text-center">
        <h1 className="font-display font-bold text-[1.35rem] mb-3">Projet introuvable</h1>
        <Link to="/admin" className={CLASSE_LIEN}>← Projets</Link>
      </div>
    )
  }

  const { projet, logiciels } = etat.donnees
  const majProjet = (maj: (actuel: ProjetAdmin) => ProjetAdmin) =>
    remplacer(donnees => ({ ...donnees, projet: maj(donnees.projet) }))
  // La réponse d'une modification ne porte pas le nombre d'entretiens : celui déjà connu est gardé.
  const remplacerProjet = (recu: ProjetFiche) => majProjet(actuel => ({ ...recu, nb_entretiens: actuel.nb_entretiens }))

  return (
    <>
      <Link to="/admin" className={CLASSE_LIEN}>← Projets</Link>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 mt-3 mb-5">
        <h1 className="font-display font-bold text-[1.35rem] break-words min-w-0">{projet.titre}</h1>
        <Chip label={LIBELLES_STATUT_PROJET[projet.statut]} />
      </div>

      <ProjetInformations projet={projet} logiciels={logiciels} onMaj={remplacerProjet} />
      <ProjetDocuments
        projetId={projet.id} documents={projet.documents}
        onAjoute={document => majProjet(actuel => ({ ...actuel, documents: [...actuel.documents, document] }))}
        onSupprime={idDocument => majProjet(actuel => ({ ...actuel, documents: actuel.documents.filter(d => d.id !== idDocument) }))}
      />
      <ProjetCadrage projet={projet} onMaj={remplacerProjet} />
      <ProjetModeles projet={projet} onMaj={remplacerProjet} />
      <ProjetQuestionnaires
        projetId={projet.id} questionnaires={projet.questionnaires}
        onCree={q => majProjet(actuel => ({
          ...actuel,
          questionnaires: [...actuel.questionnaires, { id: q.id, public_vise: q.public_vise, mode: q.mode, statut: q.statut, code: q.code }],
        }))}
      />
      <ZoneDanger projet={projet} />
    </>
  )
}
