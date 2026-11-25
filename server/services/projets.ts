import { DEFAUTS, type Etape } from '../../shared/modeles'
import { ErreurMetier } from '../erreurs'
import { maintenantIso, nouvelId } from '../ids'
import type { Logiciel } from './logiciels'
import { LIMITES, verifierLongueur } from './limites'

export const TYPES_DEMANDE = ['evolution_simple', 'amelioration', 'nouvelle_fonctionnalite'] as const
export type TypeDemande = (typeof TYPES_DEMANDE)[number]

export const STATUTS_PROJET = ['brouillon', 'cadre', 'en_cours', 'clos'] as const
export type StatutProjet = (typeof STATUTS_PROJET)[number]

export interface Projet {
  id: string
  titre: string
  type_demande: TypeDemande
  description: string
  note_cadrage: string
  resume_contexte: string
  modele_cadrage: string
  modele_interview: string
  modele_analyse: string
  statut: StatutProjet
  cree_le: string
  maj_le: string
}

export interface DocumentProjet {
  id: string
  nom: string
  contenu: string
  cree_le: string
}

export interface QuestionnaireResume {
  id: string
  public_vise: string
  mode: string
  statut: string
  code: string
}

export interface ProjetComplet extends Projet {
  logiciels: Logiciel[]
  documents: DocumentProjet[]
  questionnaires: QuestionnaireResume[]
}

export interface ProjetResume {
  id: string
  titre: string
  type_demande: TypeDemande
  statut: StatutProjet
  /** Noms des logiciels, séparés par des virgules ; vide si aucun. */
  logiciels: string
  maj_le: string
}

export interface CreationProjet {
  titre: string
  type_demande: TypeDemande
  description?: string
  logiciel_ids?: string[]
  modeles?: Partial<Record<Etape, string>>
}

export interface ModificationProjet {
  titre?: string
  type_demande?: TypeDemande
  description?: string
  note_cadrage?: string
  resume_contexte?: string
  statut?: StatutProjet
  logiciel_ids?: string[]
}

async function lireLigne(db: D1Database, id: string): Promise<Projet> {
  const projet = await db.prepare('SELECT * FROM projets WHERE id = ?').bind(id).first<Projet>()
  if (!projet) throw new ErreurMetier(`Projet introuvable : ${id}`, 404)
  return projet
}

/** Vérifie que chaque logiciel existe et renvoie la liste sans doublon. */
async function verifierLogiciels(db: D1Database, ids: string[]): Promise<string[]> {
  const uniques = [...new Set(ids)]
  for (const id of uniques) {
    const existe = await db.prepare('SELECT id FROM logiciels WHERE id = ?').bind(id).first()
    if (!existe) throw new ErreurMetier(`Logiciel introuvable : ${id}`, 404)
  }
  return uniques
}

function insererLiens(db: D1Database, projetId: string, logicielIds: string[]): D1PreparedStatement[] {
  return logicielIds.map(id =>
    db.prepare('INSERT INTO projet_logiciels (projet_id, logiciel_id) VALUES (?, ?)').bind(projetId, id))
}

export async function lireProjet(db: D1Database, id: string): Promise<ProjetComplet> {
  const projet = await lireLigne(db, id)
  const [logiciels, documents, questionnaires] = await Promise.all([
    db.prepare(
      `SELECT l.* FROM logiciels l JOIN projet_logiciels pl ON pl.logiciel_id = l.id
       WHERE pl.projet_id = ? ORDER BY l.nom COLLATE NOCASE`,
    ).bind(id).all<Logiciel>(),
    db.prepare('SELECT id, nom, contenu, cree_le FROM documents WHERE projet_id = ? ORDER BY cree_le')
      .bind(id).all<DocumentProjet>(),
    db.prepare('SELECT id, public_vise, mode, statut, code FROM questionnaires WHERE projet_id = ? ORDER BY cree_le')
      .bind(id).all<QuestionnaireResume>(),
  ])
  return {
    ...projet,
    logiciels: logiciels.results,
    documents: documents.results,
    questionnaires: questionnaires.results,
  }
}

export async function listerProjets(
  db: D1Database, filtre: { logiciel_id?: string; statut?: StatutProjet } = {},
): Promise<ProjetResume[]> {
  const { results } = await db.prepare(
    `SELECT p.id, p.titre, p.type_demande, p.statut, p.maj_le,
            COALESCE((SELECT GROUP_CONCAT(l.nom, ', ') FROM projet_logiciels pl
                      JOIN logiciels l ON l.id = pl.logiciel_id WHERE pl.projet_id = p.id), '') AS logiciels
     FROM projets p
     WHERE (?1 IS NULL OR p.statut = ?1)
       AND (?2 IS NULL OR EXISTS (SELECT 1 FROM projet_logiciels pl
                                  WHERE pl.projet_id = p.id AND pl.logiciel_id = ?2))
     ORDER BY p.maj_le DESC`,
  ).bind(filtre.statut ?? null, filtre.logiciel_id ?? null).all<ProjetResume>()
  return results
}

export async function creerProjet(db: D1Database, saisie: CreationProjet): Promise<ProjetComplet> {
  const titre = saisie.titre.trim()
  if (!titre) throw new ErreurMetier('Le titre du projet est obligatoire.')
  verifierLongueur(titre, LIMITES.titre_projet, 'Titre du projet trop long')
  const description = saisie.description ?? ''
  verifierLongueur(description, LIMITES.description, 'Description trop longue')
  const logicielIds = await verifierLogiciels(db, saisie.logiciel_ids ?? [])
  const id = nouvelId()
  const maintenant = maintenantIso()
  // Le projet et ses liens partent ensemble : tout ou rien.
  await db.batch([
    db.prepare(
      `INSERT INTO projets (id, titre, type_demande, description, modele_cadrage, modele_interview, modele_analyse, cree_le, maj_le)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).bind(
      id, titre, saisie.type_demande, description,
      saisie.modeles?.cadrage ?? DEFAUTS.cadrage,
      saisie.modeles?.interview ?? DEFAUTS.interview,
      saisie.modeles?.analyse ?? DEFAUTS.analyse,
      maintenant, maintenant,
    ),
    ...insererLiens(db, id, logicielIds),
  ])
  return lireProjet(db, id)
}

const CHAMPS_MODIFIABLES = ['titre', 'type_demande', 'description', 'note_cadrage', 'resume_contexte', 'statut'] as const

export async function modifierProjet(
  db: D1Database, id: string, modifs: ModificationProjet,
): Promise<ProjetComplet> {
  const actuel = await lireLigne(db, id)
  const maj: Record<string, string> = {}
  for (const champ of CHAMPS_MODIFIABLES) {
    const valeur = modifs[champ]
    if (valeur !== undefined) maj[champ] = champ === 'titre' ? valeur.trim() : valeur
  }
  if (maj.titre !== undefined && !maj.titre) throw new ErreurMetier('Le titre du projet est obligatoire.')
  if (maj.titre !== undefined) verifierLongueur(maj.titre, LIMITES.titre_projet, 'Titre du projet trop long')
  if (maj.description !== undefined) verifierLongueur(maj.description, LIMITES.description, 'Description trop longue')
  if (maj.note_cadrage !== undefined) verifierLongueur(maj.note_cadrage, LIMITES.note_cadrage, 'Note de cadrage trop longue')
  if (maj.resume_contexte !== undefined) verifierLongueur(maj.resume_contexte, LIMITES.resume_contexte, 'Résumé de contexte trop long')
  // Un projet dont la note de cadrage vient d'être écrite est « cadré », sauf statut imposé.
  if (maj.statut === undefined && maj.note_cadrage?.trim() && actuel.statut === 'brouillon') maj.statut = 'cadre'

  const logicielIds = modifs.logiciel_ids ? await verifierLogiciels(db, modifs.logiciel_ids) : undefined

  maj.maj_le = maintenantIso()
  // Les noms de colonnes viennent de CHAMPS_MODIFIABLES, jamais de la saisie.
  const colonnes = Object.keys(maj)
  // La mise à jour du projet et le remplacement des liens partent ensemble : tout ou rien.
  await db.batch([
    db.prepare(`UPDATE projets SET ${colonnes.map(c => `${c} = ?`).join(', ')} WHERE id = ?`)
      .bind(...colonnes.map(c => maj[c]), id),
    ...(logicielIds
      ? [db.prepare('DELETE FROM projet_logiciels WHERE projet_id = ?').bind(id), ...insererLiens(db, id, logicielIds)]
      : []),
  ])
  return lireProjet(db, id)
}

export async function ajouterDocument(
  db: D1Database, projetId: string, saisie: { nom: string; contenu: string },
): Promise<DocumentProjet> {
  await lireLigne(db, projetId)
  const nom = saisie.nom.trim()
  if (!nom || !saisie.contenu.trim()) throw new ErreurMetier('Le nom et le contenu du document sont obligatoires.')
  verifierLongueur(nom, LIMITES.nom_document, 'Nom du document trop long')
  verifierLongueur(saisie.contenu, LIMITES.contenu_document, 'Contenu du document trop long')
  const document: DocumentProjet = { id: nouvelId(), nom, contenu: saisie.contenu, cree_le: maintenantIso() }
  await db.prepare('INSERT INTO documents (id, projet_id, nom, contenu, cree_le) VALUES (?,?,?,?,?)')
    .bind(document.id, projetId, document.nom, document.contenu, document.cree_le).run()
  return document
}

/** Renvoie un document avec son contenu complet. */
export async function lireDocument(db: D1Database, id: string): Promise<DocumentProjet> {
  const document = await db.prepare('SELECT id, nom, contenu, cree_le FROM documents WHERE id = ?')
    .bind(id).first<DocumentProjet>()
  if (!document) throw new ErreurMetier(`Document introuvable : ${id}`, 404)
  return document
}
