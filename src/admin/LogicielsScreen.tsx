import { useEffect, useRef, useState, type FormEvent } from 'react'
import { LIMITES, type Logiciel } from '../../shared/interviews'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { api } from './api'
import { ChampTexte, ChampZone } from './champs'
import { Alerte, Chargement, ErreurChargement, TitreEcran, useAction, useChargement } from './commun'
import { useSaisieNonEnregistree } from './saisies'

interface FormulaireProps {
  /** Logiciel à modifier ; absent pour un ajout. */
  logiciel?: Logiciel
  onEnregistre: (logiciel: Logiciel) => void
  onAnnuler: () => void
  onModifie: (modifie: boolean) => void
}

function FormulaireLogiciel({ logiciel, onEnregistre, onAnnuler, onModifie }: FormulaireProps) {
  const [nom, setNom] = useState(logiciel?.nom ?? '')
  const [contexte, setContexte] = useState(logiciel?.contexte ?? '')
  const action = useAction()
  const modifie = nom !== (logiciel?.nom ?? '') || contexte !== (logiciel?.contexte ?? '')
  const liberer = useSaisieNonEnregistree(modifie)
  const prefixe = logiciel ? `logiciel-${logiciel.id}` : 'logiciel-nouveau'

  useEffect(() => {
    onModifie(modifie)
    return () => onModifie(false)
  }, [modifie, onModifie])

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault()
    if (!nom.trim()) {
      action.signaler('Le nom du logiciel est obligatoire.')
      return
    }
    await action.lancer(async () => {
      const saisie = { nom, contexte }
      const enregistre = logiciel ? await api.logiciels.modifier(logiciel.id, saisie) : await api.logiciels.creer(saisie)
      liberer()
      onEnregistre(enregistre)
    })
  }

  return (
    <Card padding="lg" className="border-ink">
      <form onSubmit={enregistrer} noValidate>
        <h2 className="font-display text-[1.05rem] mb-4">{logiciel ? `Modifier « ${logiciel.nom} »` : 'Nouveau logiciel'}</h2>
        <ChampTexte
          id={`${prefixe}-nom`} libelle="Nom" valeur={nom} onChange={setNom}
          maxLength={LIMITES.nom_logiciel} autoFocus
        />
        <ChampZone
          id={`${prefixe}-contexte`} libelle="Contexte" valeur={contexte} onChange={setContexte} lignes={8}
          maxLength={LIMITES.contexte_logiciel}
          aide="Le logiciel, son vocabulaire métier, ses publics."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" loading={action.enCours}>Enregistrer</Button>
          <Button type="button" variant="ghost" onClick={onAnnuler} disabled={action.enCours}>Annuler</Button>
        </div>
        <Alerte className="mt-3">{action.erreur}</Alerte>
      </form>
    </Card>
  )
}

function parNom(a: Logiciel, b: Logiciel): number {
  return a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' })
}

export function LogicielsScreen() {
  const { etat, recharger, remplacer } = useChargement(() => api.logiciels.lister(), '')
  /** Formulaire ouvert : `'nouveau'`, l'identifiant du logiciel en cours de modification, ou aucun. */
  const [edition, setEdition] = useState<string | null>(null)
  const saisieModifiee = useRef(false)
  const noterModification = useRef((modifie: boolean) => { saisieModifiee.current = modifie }).current

  // Un seul formulaire à la fois : en ouvrir un autre ferme le premier, après accord s'il porte une saisie.
  const ouvrir = (cible: string) => {
    if (edition !== null && saisieModifiee.current && !window.confirm('Abandonner la saisie en cours ?')) return
    setEdition(cible)
  }

  const integrer = (logiciel: Logiciel) => {
    remplacer(liste => [...liste.filter(l => l.id !== logiciel.id), logiciel].sort(parNom))
    setEdition(null)
  }

  return (
    <>
      <TitreEcran titre="Logiciels">
        <Button variant="primary" onClick={() => ouvrir('nouveau')} disabled={etat.phase !== 'pret' || edition === 'nouveau'}>
          Ajouter un logiciel
        </Button>
      </TitreEcran>
      <p className="text-[0.86rem] text-muted mb-6 leading-relaxed">
        La fiche de contexte d'un logiciel est réutilisée par tous les projets qui le concernent : décrivez-y le
        logiciel, son vocabulaire métier et ses publics.
      </p>

      {etat.phase === 'chargement' && <Chargement />}
      {etat.phase === 'erreur' && <ErreurChargement message={etat.message} onReessayer={recharger} />}
      {etat.phase === 'pret' && (
        <>
          {edition === 'nouveau' && (
            <FormulaireLogiciel onEnregistre={integrer} onAnnuler={() => setEdition(null)} onModifie={noterModification} />
          )}
          {etat.donnees.length === 0 && edition !== 'nouveau' && (
            <p className="text-[0.88rem] text-muted py-8 text-center">
              Aucun logiciel. Ajoutez ceux sur lesquels portent vos projets.
            </p>
          )}
          {etat.donnees.map(logiciel => edition === logiciel.id ? (
            <FormulaireLogiciel
              key={logiciel.id} logiciel={logiciel}
              onEnregistre={integrer} onAnnuler={() => setEdition(null)} onModifie={noterModification}
            />
          ) : (
            <Card key={logiciel.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="font-display text-[1.05rem] break-words min-w-0">{logiciel.nom}</h2>
                <Button size="sm" onClick={() => ouvrir(logiciel.id)} aria-label={`Modifier ${logiciel.nom}`}>Modifier</Button>
              </div>
              {logiciel.contexte.trim()
                ? <p className="text-[0.84rem] text-muted mt-2 leading-relaxed whitespace-pre-line break-words line-clamp-3">{logiciel.contexte}</p>
                : <p className="text-[0.8rem] text-muted mt-2 italic">Pas encore de contexte.</p>}
            </Card>
          ))}
        </>
      )}
    </>
  )
}
