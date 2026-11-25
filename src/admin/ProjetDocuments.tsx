import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { LIMITES, type DocumentProjet } from '../../shared/interviews'
import { Button } from '../components/ui/Button'
import { api } from './api'
import { ChampTexte, ChampZone } from './champs'
import { Alerte, Confirmation, messageErreur, useAction } from './commun'
import { EXTENSIONS_ACCEPTEES, extraireTexte } from './extraction'
import { nombre } from './libelles'
import { useSaisieNonEnregistree } from './saisies'
import { SectionFiche } from './SectionFiche'

interface Props {
  projetId: string
  documents: DocumentProjet[]
  onAjoute: (document: DocumentProjet) => void
  onSupprime: (id: string) => void
}

function LigneDocument({ document, onSupprime }: { document: DocumentProjet; onSupprime: (id: string) => void }) {
  const action = useAction()

  const supprimer = () => {
    if (!window.confirm(`Supprimer le document « ${document.nom} » ?`)) return
    void action.lancer(async () => {
      await api.documents.supprimer(document.id)
      onSupprime(document.id)
    })
  }

  return (
    <li className="border-b border-border py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <div className="text-[0.88rem] break-words">{document.nom}</div>
          <div className="font-mono text-[0.62rem] text-muted">{nombre(document.contenu.length)} caractères</div>
        </div>
        <Button variant="danger" size="sm" loading={action.enCours} onClick={supprimer} aria-label={`Supprimer le document ${document.nom}`}>
          Supprimer
        </Button>
      </div>
      <Alerte className="mt-1.5">{action.erreur}</Alerte>
    </li>
  )
}

export function ProjetDocuments({ projetId, documents, onAjoute, onSupprime }: Props) {
  const [nom, setNom] = useState('')
  const [texte, setTexte] = useState('')
  const [extraction, setExtraction] = useState<{ enCours: boolean; erreur: string }>({ enCours: false, erreur: '' })
  const fichier = useRef<HTMLInputElement>(null)
  const action = useAction()
  const occupe = action.enCours || extraction.enCours
  useSaisieNonEnregistree(nom !== '' || texte !== '')

  const lireFichier = async (e: ChangeEvent<HTMLInputElement>) => {
    const choisi = e.target.files?.[0]
    // Vidé pour que le même fichier puisse être choisi à nouveau.
    e.target.value = ''
    if (!choisi || occupe) return
    if (texte.trim() && !window.confirm('Remplacer le texte déjà saisi par celui du fichier ?')) return
    setExtraction({ enCours: true, erreur: '' })
    try {
      const extrait = await extraireTexte(choisi)
      setTexte(extrait)
      setNom(choisi.name.slice(0, LIMITES.nom_document))
      setExtraction({ enCours: false, erreur: '' })
    } catch (erreur) {
      setExtraction({ enCours: false, erreur: messageErreur(erreur) })
    }
  }

  const ajouter = async (e: FormEvent) => {
    e.preventDefault()
    if (occupe) return
    if (!nom.trim() || !texte.trim()) return action.signaler('Le nom et le texte du document sont obligatoires.')
    await action.lancer(async () => {
      onAjoute(await api.projets.ajouterDocument(projetId, { nom, contenu: texte }))
      setNom('')
      setTexte('')
    })
  }

  return (
    <SectionFiche titre="Documents" aide="Textes de référence du projet : collez-les, ou tirez-les d'un fichier .txt, .md ou .pdf.">
      {documents.length === 0
        ? <p className="text-[0.84rem] text-muted mb-5">Aucun document.</p>
        : <ul className="mb-5 border-t border-b border-border">{documents.map(d => <LigneDocument key={d.id} document={d} onSupprime={onSupprime} />)}</ul>}

      <form onSubmit={ajouter} noValidate aria-label="Ajouter un document">
        <h3 className="font-display text-[0.95rem] mb-3">Ajouter un document</h3>
        {/* Champs désactivés pendant l'ajout et l'extraction : une saisie tapée entre-temps serait écrasée au retour. */}
        <fieldset disabled={occupe} className="min-w-0">
          <legend className="sr-only">Fichier, nom et texte du document</legend>
          <div className="mb-4">
            <input
              ref={fichier} type="file" accept={EXTENSIONS_ACCEPTEES} onChange={lireFichier}
              className="hidden" tabIndex={-1} aria-hidden="true"
            />
            <Button type="button" loading={extraction.enCours} onClick={() => fichier.current?.click()}>
              Choisir un fichier
            </Button>
            <span className="block text-[0.76rem] text-muted mt-1">
              Le texte du fichier remplit la zone ci-dessous : relisez-le avant de l'ajouter.
            </span>
            <Alerte className="mt-1.5">{extraction.erreur}</Alerte>
          </div>
          <ChampTexte id="document-nom" libelle="Nom" valeur={nom} onChange={setNom} maxLength={LIMITES.nom_document} />
          <ChampZone
            id="document-texte" libelle="Texte" valeur={texte} onChange={setTexte} lignes={8}
            maxLength={LIMITES.contenu_document}
            aide={texte ? `${nombre(texte.length)} caractères sur ${nombre(LIMITES.contenu_document)} au plus` : undefined}
          />
        </fieldset>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button type="submit" variant="primary" loading={action.enCours} disabled={extraction.enCours}>
            Ajouter le document
          </Button>
          {action.reussie && nom === '' && texte === '' && <Confirmation>Document ajouté</Confirmation>}
        </div>
        <Alerte className="mt-3">{action.erreur}</Alerte>
      </form>
    </SectionFiche>
  )
}
