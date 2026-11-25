import { useState } from 'react'
import {
  LIMITES, STATUTS_PROJET, TYPES_DEMANDE,
  type Logiciel, type ProjetComplet, type StatutProjet, type TypeDemande,
} from '../../shared/interviews'
import { api } from './api'
import { CasesLogiciels } from './CasesLogiciels'
import { ChampListe, ChampTexte, ChampZone } from './champs'
import { useAction } from './commun'
import { LIBELLES_STATUT_PROJET, LIBELLES_TYPE_DEMANDE, optionsDe } from './libelles'
import { champsModifies } from './modifications'
import { useSaisieNonEnregistree } from './saisies'
import { SectionFiche } from './SectionFiche'

interface Informations {
  titre: string
  type_demande: TypeDemande
  statut: StatutProjet
  description: string
  logiciel_ids: string[]
}

const OPTIONS_TYPE = optionsDe(TYPES_DEMANDE, LIBELLES_TYPE_DEMANDE)
const OPTIONS_STATUT = optionsDe(STATUTS_PROJET, LIBELLES_STATUT_PROJET)

interface Props {
  projet: ProjetComplet
  logiciels: Logiciel[]
  onMaj: (projet: ProjetComplet) => void
}

export function ProjetInformations({ projet, logiciels, onMaj }: Props) {
  // Seuls les champs touchés sont retenus : les autres suivent le projet (son statut peut changer ailleurs sur la fiche).
  const [saisie, setSaisie] = useState<Partial<Informations>>({})
  const action = useAction()

  const enregistre: Informations = {
    titre: projet.titre,
    type_demande: projet.type_demande,
    statut: projet.statut,
    description: projet.description,
    logiciel_ids: projet.logiciels.map(l => l.id),
  }
  const valeurs: Informations = { ...enregistre, ...saisie }
  // Seuls les champs changés partent : les autres ont pu être modifiés ailleurs depuis le chargement.
  const modifs = champsModifies(enregistre, saisie)
  const modifie = Object.keys(modifs).length > 0
  useSaisieNonEnregistree(modifie)

  const changer = (modif: Partial<Informations>) => setSaisie(actuelle => ({ ...actuelle, ...modif }))

  const enregistrer = () => {
    if (modifs.titre !== undefined && !modifs.titre.trim()) return action.signaler('Le titre du projet est obligatoire.')
    void action.lancer(async () => {
      onMaj(await api.projets.modifier(projet.id, modifs))
      // Les champs sont désactivés pendant l'appel : rien n'a pu être tapé entre-temps.
      setSaisie({})
    })
  }

  return (
    <SectionFiche titre="Informations" enregistrement={{ action, modifie, onEnregistrer: enregistrer }}>
      <ChampTexte
        id="infos-titre" libelle="Titre" valeur={valeurs.titre} onChange={titre => changer({ titre })}
        maxLength={LIMITES.titre_projet}
      />
      <div className="grid gap-x-4 sm:grid-cols-2">
        <ChampListe
          id="infos-type" libelle="Type de demande" valeur={valeurs.type_demande} options={OPTIONS_TYPE}
          onChange={type_demande => changer({ type_demande })}
        />
        <ChampListe
          id="infos-statut" libelle="Statut" valeur={valeurs.statut} options={OPTIONS_STATUT}
          onChange={statut => changer({ statut })}
        />
      </div>
      <ChampZone
        id="infos-description" libelle="Description" valeur={valeurs.description} lignes={8}
        onChange={description => changer({ description })} maxLength={LIMITES.description}
        aide="La demande telle que vous la formulez aujourd'hui"
      />
      <CasesLogiciels
        prefixe="infos-logiciel" logiciels={logiciels} choisis={valeurs.logiciel_ids}
        onChange={logiciel_ids => changer({ logiciel_ids })}
      />
    </SectionFiche>
  )
}
