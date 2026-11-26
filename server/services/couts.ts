import type { CoutProjetLigne, CoutsGlobaux, CoutsProjet } from '../../shared/couts'
import { calculerCout, type Jetons, type Poste } from '../../shared/tarifs'
import { ErreurMetier } from '../erreurs'
import { maintenantIso, nouvelId } from '../ids'

export interface SaisieConsommation {
  poste: Poste
  projet_id: string | null
  modele: string
  jetons: Jetons
}

/** Enregistre une requête à l'IA. Le coût est figé à l'enregistrement, NULL si le modèle n'a pas de tarif. */
export async function enregistrerConsommation(db: D1Database, saisie: SaisieConsommation): Promise<void> {
  const { jetons } = saisie
  await db.prepare(
    `INSERT INTO consommation_ia
       (id, cree_le, poste, projet_id, modele, jetons_entree, jetons_sortie, cache_lecture, cache_ecriture, cout_micro_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    nouvelId(), maintenantIso(), saisie.poste, saisie.projet_id, saisie.modele,
    jetons.entree, jetons.sortie, jetons.cache_lecture, jetons.cache_ecriture,
    calculerCout(saisie.modele, jetons),
  ).run()
}

interface LigneCumul { projet_id: string | null; poste: Poste; titre: string | null; cout: number }

async function modelesSansTarif(db: D1Database, projetId: string | null, depuis?: string): Promise<string[]> {
  const { results } = await db.prepare(
    `SELECT DISTINCT modele FROM consommation_ia
     WHERE cout_micro_usd IS NULL AND (?1 IS NULL OR cree_le >= ?1) AND (?2 IS NULL OR projet_id = ?2)
     ORDER BY modele`,
  ).bind(depuis ?? null, projetId).all<{ modele: string }>()
  return results.map(r => r.modele)
}

export async function coutsGlobaux(db: D1Database, options: { depuis?: string } = {}): Promise<CoutsGlobaux> {
  const depuis = options.depuis ?? null
  const { results } = await db.prepare(
    `SELECT c.projet_id AS projet_id, c.poste AS poste, p.titre AS titre, COALESCE(SUM(c.cout_micro_usd), 0) AS cout
     FROM consommation_ia c LEFT JOIN projets p ON p.id = c.projet_id
     WHERE ?1 IS NULL OR c.cree_le >= ?1
     GROUP BY c.projet_id, c.poste`,
  ).bind(depuis).all<LigneCumul>()

  let total = 0
  let horsProjet = 0
  const parProjet = new Map<string, CoutProjetLigne>()
  for (const ligne of results) {
    total += ligne.cout
    if (ligne.poste === 'interview_critique' || ligne.projet_id === null) {
      horsProjet += ligne.cout
      continue
    }
    let projet = parProjet.get(ligne.projet_id)
    if (!projet) {
      projet = { projet_id: ligne.projet_id, titre: ligne.titre ?? 'Projet supprimé', supprime: ligne.titre === null, cadrage: 0, interview: 0, analyse: 0, total: 0 }
      parProjet.set(ligne.projet_id, projet)
    }
    if (ligne.poste === 'cadrage' || ligne.poste === 'interview' || ligne.poste === 'analyse') projet[ligne.poste] += ligne.cout
    projet.total += ligne.cout
  }
  const projets = [...parProjet.values()].sort((x, y) => y.total - x.total)
  return { total, hors_projet: horsProjet, projets, tarifs_manquants: await modelesSansTarif(db, null, options.depuis) }
}

export async function coutsProjet(db: D1Database, projetId: string): Promise<CoutsProjet> {
  if (!await db.prepare('SELECT id FROM projets WHERE id = ?').bind(projetId).first()) {
    throw new ErreurMetier(`Projet introuvable : ${projetId}`, 404)
  }
  const { results } = await db.prepare(
    `SELECT poste, COALESCE(SUM(cout_micro_usd), 0) AS cout FROM consommation_ia WHERE projet_id = ? GROUP BY poste`,
  ).bind(projetId).all<{ poste: Poste; cout: number }>()
  const couts: CoutsProjet = { cadrage: 0, interview: 0, analyse: 0, total: 0, tarifs_manquants: await modelesSansTarif(db, projetId) }
  for (const ligne of results) {
    if (ligne.poste === 'cadrage' || ligne.poste === 'interview' || ligne.poste === 'analyse') couts[ligne.poste] += ligne.cout
    couts.total += ligne.cout
  }
  return couts
}
