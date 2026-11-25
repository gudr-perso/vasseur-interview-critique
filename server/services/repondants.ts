import type { Mode } from '../../shared/interviews'
import {
  LIMITES_REPONDANT, type EntretienLu, type Identite, type RepondantResume, type Reponse, type TourLu,
} from '../../shared/repondants'
import { ErreurMetier } from '../erreurs'
import { maintenantIso, nouveauJeton, nouvelId } from '../ids'
import { estInvisible } from './limites'
import { lireQuestionnaire, type Questionnaire } from './questionnaires'

const MSG_PLAFOND = 'Ce questionnaire a atteint son nombre maximal de participants'

function champ(valeur: unknown): string {
  if (typeof valeur !== 'string') return ''
  return estInvisible(valeur) ? '' : valeur.trim()
}

function borne(valeur: string, max: number, libelle: string): void {
  if (valeur.length > max) throw new ErreurMetier(`${libelle} trop long (${max} caractères au plus).`)
}

/** Nettoie une identité et vérifie ses champs obligatoires, ses longueurs et la forme du mail. */
export function validerIdentite(brute: Partial<Identite> | null | undefined): Identite {
  const b = brute ?? {}
  const nom = champ(b.nom)
  const prenom = champ(b.prenom)
  const entreprise = champ(b.entreprise)
  const poste = champ(b.poste)
  const mail = champ(b.mail)
  if (!nom) throw new ErreurMetier('Le nom est obligatoire.')
  if (!prenom) throw new ErreurMetier('Le prénom est obligatoire.')
  if (!entreprise) throw new ErreurMetier("L'entreprise est obligatoire.")
  borne(nom, LIMITES_REPONDANT.nom, 'Nom')
  borne(prenom, LIMITES_REPONDANT.prenom, 'Prénom')
  borne(entreprise, LIMITES_REPONDANT.entreprise, 'Entreprise')
  borne(poste, LIMITES_REPONDANT.poste, 'Poste')
  borne(mail, LIMITES_REPONDANT.mail, 'Adresse mail')
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new ErreurMetier('Adresse mail invalide.')
  return { nom, prenom, poste, entreprise, mail }
}

const COLONNES_RESUME = `r.id, r.jeton, r.nom, r.prenom, r.poste, r.entreprise, r.mail, r.origine, r.statut,
  r.commence_le, r.termine_le,
  (SELECT COUNT(*) FROM tours t WHERE t.repondant_id = r.id AND t.reponse IS NOT NULL) AS nb_reponses`

async function lireResume(db: D1Database, condition: string, valeur: string): Promise<RepondantResume | null> {
  return db.prepare(`SELECT ${COLONNES_RESUME} FROM repondants r WHERE ${condition}`).bind(valeur).first<RepondantResume>()
}

/** Crée un répondant sur le lien générique d'un questionnaire ouvert. */
export async function creerRepondantGenerique(
  db: D1Database, code: string, identiteBrute: Partial<Identite>,
): Promise<{ jeton: string }> {
  const questionnaire = await db.prepare('SELECT id, statut FROM questionnaires WHERE code = ?')
    .bind(code).first<{ id: string; statut: string }>()
  if (!questionnaire || questionnaire.statut === 'brouillon') throw new ErreurMetier('Lien invalide.', 404)
  if (questionnaire.statut === 'clos') throw new ErreurMetier('Ce questionnaire est clos.', 410)

  const identite = validerIdentite(identiteBrute)
  // Pas atomique avec l'insertion : un léger dépassement en cas d'arrivées simultanées est acceptable.
  const compte = await db.prepare(
    "SELECT COUNT(*) AS n FROM repondants WHERE questionnaire_id = ? AND origine = 'lien_generique'",
  ).bind(questionnaire.id).first<{ n: number }>()
  if ((compte?.n ?? 0) >= LIMITES_REPONDANT.repondants_generiques) throw new ErreurMetier(MSG_PLAFOND, 409)

  const jeton = nouveauJeton()
  const maintenant = maintenantIso()
  // Le statut du questionnaire est contrôlé dans la requête : un questionnaire clos entre-temps n'accepte plus personne.
  const { meta } = await db.prepare(
    `INSERT INTO repondants (id, questionnaire_id, jeton, nom, prenom, poste, entreprise, mail, origine, statut, commence_le)
     SELECT ?, id, ?, ?, ?, ?, ?, ?, 'lien_generique', 'commence', ? FROM questionnaires WHERE id = ? AND statut = 'ouvert'`,
  ).bind(
    nouvelId(), jeton, identite.nom, identite.prenom, identite.poste, identite.entreprise, identite.mail,
    maintenant, questionnaire.id,
  ).run()
  if (meta.changes === 0) throw new ErreurMetier('Ce questionnaire est clos.', 410)
  return { jeton }
}

/** Crée une invitation nominative sur un questionnaire ouvert. */
export async function creerInvitation(
  db: D1Database, questionnaireId: string, identiteBrute: Partial<Identite>,
): Promise<RepondantResume> {
  const questionnaire = await lireQuestionnaire(db, questionnaireId)
  const erreur = (): ErreurMetier => new ErreurMetier('Les invitations se créent sur un questionnaire ouvert.', 409)
  if (questionnaire.statut !== 'ouvert') throw erreur()

  const identite = validerIdentite(identiteBrute)
  const id = nouvelId()
  const { meta } = await db.prepare(
    `INSERT INTO repondants (id, questionnaire_id, jeton, nom, prenom, poste, entreprise, mail, origine, statut)
     SELECT ?, id, ?, ?, ?, ?, ?, ?, 'invitation', 'invite' FROM questionnaires WHERE id = ? AND statut = 'ouvert'`,
  ).bind(
    id, nouveauJeton(), identite.nom, identite.prenom, identite.poste, identite.entreprise, identite.mail, questionnaireId,
  ).run()
  if (meta.changes === 0) throw erreur()
  return (await lireResume(db, 'r.id = ?', id))!
}

/** Répondant et questionnaire d'un jeton. */
export async function lireRepondantParJeton(
  db: D1Database, jeton: string,
): Promise<{ repondant: RepondantResume & { questionnaire_id: string }; questionnaire: Questionnaire }> {
  const repondant = await db.prepare(
    `SELECT ${COLONNES_RESUME}, r.questionnaire_id FROM repondants r WHERE r.jeton = ?`,
  ).bind(jeton).first<RepondantResume & { questionnaire_id: string }>()
  if (!repondant) throw new ErreurMetier('Lien invalide.', 404)
  const questionnaire = await lireQuestionnaire(db, repondant.questionnaire_id)
  return { repondant, questionnaire }
}

/** Enregistre l'identité ; un répondant invité passe en « commencé ». Refusée une fois l'entretien terminé. */
export async function modifierIdentite(db: D1Database, jeton: string, identiteBrute: Partial<Identite>): Promise<void> {
  const identite = validerIdentite(identiteBrute)
  // Le statut est contrôlé dans la requête : un entretien terminé entre-temps n'est pas modifié.
  const { meta } = await db.prepare(
    `UPDATE repondants SET nom = ?, prenom = ?, poste = ?, entreprise = ?, mail = ?,
            statut = 'commence', commence_le = COALESCE(commence_le, ?)
     WHERE jeton = ? AND statut != 'termine'`,
  ).bind(identite.nom, identite.prenom, identite.poste, identite.entreprise, identite.mail, maintenantIso(), jeton).run()
  if (meta.changes > 0) return
  await lireRepondantParJeton(db, jeton)
  throw new ErreurMetier('Cet entretien est terminé : les coordonnées ne peuvent plus être modifiées.', 409)
}

/** Répondants d'un questionnaire, du plus ancien au plus récent ; les invités qui n'ont pas commencé en dernier. */
export async function listerRepondants(db: D1Database, questionnaireId: string): Promise<RepondantResume[]> {
  const { results } = await db.prepare(
    `SELECT ${COLONNES_RESUME} FROM repondants r WHERE r.questionnaire_id = ?
     ORDER BY r.commence_le IS NULL, r.commence_le, r.nom, r.prenom`,
  ).bind(questionnaireId).all<RepondantResume>()
  return results
}

interface LigneTour {
  ordre: number
  type: 'question' | 'relance'
  question_id: string | null
  question: string
  reponse: string | null
  cree_le: string
}

/** Entretien d'un répondant, pour la lecture par l'admin. */
export async function lireEntretien(db: D1Database, repondantId: string): Promise<EntretienLu> {
  const repondant = await lireResume(db, 'r.id = ?', repondantId)
  if (!repondant) throw new ErreurMetier(`Répondant introuvable : ${repondantId}`, 404)
  const ligne = await db.prepare(
    `SELECT q.id, q.projet_id, q.public_vise, q.mode FROM questionnaires q
     JOIN repondants r ON r.questionnaire_id = q.id WHERE r.id = ?`,
  ).bind(repondantId).first<{ id: string; projet_id: string; public_vise: string; mode: Mode }>()
  const { results } = await db.prepare(
    'SELECT ordre, type, question_id, question, reponse, cree_le FROM tours WHERE repondant_id = ? ORDER BY ordre',
  ).bind(repondantId).all<LigneTour>()
  const tours: TourLu[] = results.map(t => ({
    ...t, reponse: t.reponse === null ? null : (JSON.parse(t.reponse) as Reponse),
  }))
  return { repondant, questionnaire: ligne!, tours }
}

/** Supprime un répondant et ses tours (cascade). */
export async function supprimerRepondant(db: D1Database, repondantId: string): Promise<void> {
  const { meta } = await db.prepare('DELETE FROM repondants WHERE id = ?').bind(repondantId).run()
  if (meta.changes === 0) throw new ErreurMetier(`Répondant introuvable : ${repondantId}`, 404)
}

/** Accueil du lien générique : ce que voit une personne avant de donner son identité. Rien d'interne. */
export async function lireAccueilParCode(
  db: D1Database, code: string,
): Promise<{ public_vise: string; introduction: string; duree_estimee_min: number; mode: Mode }> {
  const ligne = await db.prepare(
    'SELECT public_vise, introduction, duree_estimee_min, mode, statut FROM questionnaires WHERE code = ?',
  ).bind(code).first<{ public_vise: string; introduction: string; duree_estimee_min: number; mode: Mode; statut: string }>()
  if (!ligne || ligne.statut === 'brouillon') throw new ErreurMetier('Lien invalide.', 404)
  if (ligne.statut === 'clos') throw new ErreurMetier('Ce questionnaire est clos.', 410)
  const { public_vise, introduction, duree_estimee_min, mode } = ligne
  return { public_vise, introduction, duree_estimee_min, mode }
}
