import type { Logiciel } from '../../shared/interviews'
import { ErreurMetier } from '../erreurs'
import { maintenantIso, nouvelId } from '../ids'
import { LIMITES, verifierLongueur } from './limites'

export type { Logiciel }

export interface SaisieLogiciel {
  id?: string
  nom: string
  /** Omis à la mise à jour : le contexte existant est conservé. */
  contexte?: string
}

export async function listerLogiciels(db: D1Database): Promise<Logiciel[]> {
  const { results } = await db.prepare('SELECT * FROM logiciels ORDER BY nom COLLATE NOCASE').all<Logiciel>()
  return results
}

export async function lireLogiciel(db: D1Database, id: string): Promise<Logiciel> {
  const logiciel = await db.prepare('SELECT * FROM logiciels WHERE id = ?').bind(id).first<Logiciel>()
  if (!logiciel) throw new ErreurMetier(`Logiciel introuvable : ${id}`, 404)
  return logiciel
}

/**
 * Crée ou met à jour une fiche. Sans `id`, un nom déjà connu (casse ignorée) désigne la fiche
 * existante : Claude peut ainsi enrichir un logiciel sans connaître son identifiant.
 */
export async function enregistrerLogiciel(db: D1Database, saisie: SaisieLogiciel): Promise<Logiciel> {
  const nom = saisie.nom.trim()
  if (!nom) throw new ErreurMetier('Le nom du logiciel est obligatoire.')
  verifierLongueur(nom, LIMITES.nom_logiciel, 'Nom du logiciel trop long')
  if (saisie.contexte !== undefined) verifierLongueur(saisie.contexte, LIMITES.contexte_logiciel, 'Contexte du logiciel trop long')
  const maintenant = maintenantIso()

  const existant = saisie.id
    ? await lireLogiciel(db, saisie.id)
    : await db.prepare('SELECT * FROM logiciels WHERE nom = ? COLLATE NOCASE').bind(nom).first<Logiciel>()

  if (!existant) {
    const id = nouvelId()
    await db.prepare('INSERT INTO logiciels (id, nom, contexte, cree_le, maj_le) VALUES (?,?,?,?,?)')
      .bind(id, nom, saisie.contexte ?? '', maintenant, maintenant).run()
    return lireLogiciel(db, id)
  }

  // Sans `id`, on garde le nom tel qu'il a été saisi la première fois.
  const nouveauNom = saisie.id ? nom : existant.nom
  if (nouveauNom.toLowerCase() !== existant.nom.toLowerCase()) {
    const doublon = await db.prepare('SELECT id FROM logiciels WHERE nom = ? COLLATE NOCASE AND id <> ?')
      .bind(nouveauNom, existant.id).first()
    if (doublon) throw new ErreurMetier(`Un logiciel nommé « ${nouveauNom} » existe déjà.`, 409)
  }
  await db.prepare('UPDATE logiciels SET nom = ?, contexte = ?, maj_le = ? WHERE id = ?')
    .bind(nouveauNom, saisie.contexte ?? existant.contexte, maintenant, existant.id).run()
  return lireLogiciel(db, existant.id)
}
