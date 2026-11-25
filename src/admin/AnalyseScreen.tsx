import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Analyse } from '../../shared/analyses'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { useCatalogue } from '../lib/modeles'
import { api } from './api'
import { ApercuMarkdown } from './ApercuMarkdown'
import { Alerte, Chargement, CLASSE_LIEN, ErreurChargement, useAction, useChargement } from './commun'
import { formaterDateHeure, libelle, libelleSource, LIBELLES_TYPE_ANALYSE, nombre } from './libelles'

interface AnalyseLue {
  analyse: Analyse
  portee: string
  titreProjet: string
}

async function chargerAnalyse(id: string): Promise<AnalyseLue> {
  const analyse = await api.analyses.lire(id)
  // La portée lisible (« Questionnaire : … », « Répondant : … ») n'est donnée que par la liste.
  const [liste, projet] = await Promise.all([
    api.analyses.lister(analyse.projet_id, { type: analyse.type }),
    api.projets.lire(analyse.projet_id),
  ])
  const portee = liste.find(a => a.id === id)?.portee ?? (analyse.questionnaire_id || analyse.repondant_id ? '' : 'Projet entier')
  return { analyse, portee, titreProjet: projet.titre }
}

/** « Synthèse — Questionnaire : Comptables » → « synthese-questionnaire-comptables-2026-11-25.md ». */
function nomFichierAnalyse(typeLibelle: string, portee: string, date: string): string {
  const base = `${typeLibelle} ${portee}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80).replace(/-+$/, '')
  return `${base || 'analyse'}-${date.slice(0, 10)}.md`
}

function telecharger(contenu: string, nom: string) {
  const url = URL.createObjectURL(new Blob([contenu], { type: 'text/markdown;charset=utf-8' }))
  const lien = document.createElement('a')
  lien.href = url
  lien.download = nom
  document.body.append(lien)
  lien.click()
  lien.remove()
  // Libérée un peu plus tard : certains navigateurs lisent l'adresse après le clic.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function BoutonCopier({ texte }: { texte: string }) {
  const [etat, setEtat] = useState<'repos' | 'copie' | 'echec'>('repos')
  useEffect(() => {
    if (etat !== 'copie') return
    const minuterie = window.setTimeout(() => setEtat('repos'), 2000)
    return () => window.clearTimeout(minuterie)
  }, [etat])
  const copier = () => navigator.clipboard.writeText(texte).then(() => setEtat('copie'), () => setEtat('echec'))
  return (
    <>
      <Button size="sm" onClick={() => void copier()}>
        <span aria-live="polite">{etat === 'copie' ? 'Copié' : 'Copier le Markdown'}</span>
      </Button>
      {etat === 'echec' && <span role="alert" className="text-red text-[0.76rem]">Copie impossible : utilisez le téléchargement.</span>}
    </>
  )
}

/** `/admin/analyses/:id` : lecture d'une analyse enregistrée. */
export function AnalyseScreen() {
  const { id = '' } = useParams()
  const { etat, recharger } = useChargement(() => chargerAnalyse(id), id)

  if (etat.phase === 'chargement') return <Chargement />
  if (etat.phase === 'erreur') {
    if (etat.statut !== 404) return <ErreurChargement message={etat.message} onReessayer={recharger} />
    return (
      <div className="py-10 text-center">
        <h1 className="font-display font-bold text-[1.35rem] mb-3">Analyse introuvable</h1>
        <Link to="/admin" className={CLASSE_LIEN}>← Projets</Link>
      </div>
    )
  }
  return <LectureAnalyse {...etat.donnees} />
}

function LectureAnalyse({ analyse, portee, titreProjet }: AnalyseLue) {
  const naviguer = useNavigate()
  const suppression = useAction()
  const { modeles } = useCatalogue()
  const retour = `/admin/projets/${analyse.projet_id}`
  const type = libelle(LIBELLES_TYPE_ANALYSE, analyse.type)

  const supprimer = () => {
    if (!window.confirm(`Supprimer définitivement cette analyse (${type}${portee ? `, ${portee}` : ''}) ?`)) return
    void suppression.lancer(async () => {
      await api.analyses.supprimer(analyse.id)
      naviguer(retour)
    })
  }

  const details: [string, string][] = [
    ['Portée', portee],
    ['Source', libelleSource(analyse.source, modeles)],
    ['Date', formaterDateHeure(analyse.cree_le)],
    ['Entretiens', nombre(analyse.nb_entretiens)],
  ]

  return (
    <>
      <Link to={retour} className={CLASSE_LIEN}>← Projet « {titreProjet} »</Link>
      <h1 className="font-display font-bold text-[1.35rem] break-words min-w-0 mt-3 mb-3">{type}</h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.84rem] mb-4">
        {details.filter(([, valeur]) => valeur).map(([terme, valeur]) => (
          <div key={terme} className="contents">
            <dt className="font-mono text-[0.62rem] uppercase tracking-wider text-muted pt-0.5">{terme}</dt>
            <dd className="break-words min-w-0">{valeur}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <BoutonCopier texte={analyse.contenu} />
        <Button size="sm" onClick={() => telecharger(analyse.contenu, nomFichierAnalyse(type, portee, analyse.cree_le))}>
          Télécharger (.md)
        </Button>
        <Button size="sm" variant="danger" loading={suppression.enCours} onClick={supprimer}>Supprimer</Button>
      </div>
      <Alerte className="mb-3">{suppression.erreur}</Alerte>
      <Card padding="lg">
        <ApercuMarkdown texte={analyse.contenu} />
      </Card>
    </>
  )
}
