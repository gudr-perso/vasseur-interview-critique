import { LIMITES_ANALYSE, TYPES_ANALYSE, type Analyse, type AnalyseResume, type TypeAnalyse } from '../../shared/analyses'
import { ErreurMetier } from '../erreurs'
import { maintenantIso, nouvelId } from '../ids'
import { estInvisible, verifierLongueur } from './limites'
import { lireProjet } from './projets'

const SOURCE_MAX = 100

export interface SaisieAnalyse {
  projet_id: string
  type: TypeAnalyse
  contenu: string
  /** `mcp`, ou l'identifiant du modèle API utilisé. */
  source: string
  questionnaire_id?: string
  repondant_id?: string
  nb_entretiens: number
}

export interface FiltreAnalyses {
  projet_id: string
  questionnaire_id?: string
  repondant_id?: string
  type?: TypeAnalyse
}

/** Vérifie que le questionnaire et le répondant (le cas échéant) appartiennent au projet, et se correspondent. */
async function verifierRattachements(
  db: D1Database, projetId: string, questionnaireId?: string, repondantId?: string,
): Promise<void> {
  if (questionnaireId) {
    const questionnaire = await db.prepare('SELECT id FROM questionnaires WHERE id = ? AND projet_id = ?')
      .bind(questionnaireId, projetId).first()
    if (!questionnaire) throw new ErreurMetier(`Questionnaire introuvable : ${questionnaireId}`, 404)
  }
  if (repondantId) {
    const repondant = await db.prepare(
      `SELECT r.id FROM repondants r JOIN questionnaires q ON q.id = r.questionnaire_id
       WHERE r.id = ?1 AND q.projet_id = ?2 AND (?3 IS NULL OR q.id = ?3)`,
    ).bind(repondantId, projetId, questionnaireId ?? null).first()
    if (!repondant) throw new ErreurMetier(`Répondant introuvable : ${repondantId}`, 404)
  }
}

export async function enregistrerAnalyse(db: D1Database, saisie: SaisieAnalyse): Promise<Analyse> {
  if (!TYPES_ANALYSE.includes(saisie.type)) {
    throw new ErreurMetier(`Type d'analyse inconnu : ${saisie.type} (attendu : ${TYPES_ANALYSE.join(', ')}).`)
  }
  if (typeof saisie.contenu !== 'string' || estInvisible(saisie.contenu)) {
    throw new ErreurMetier("Le contenu de l'analyse est vide.")
  }
  verifierLongueur(saisie.contenu, LIMITES_ANALYSE.contenu, "Contenu de l'analyse trop long")
  const source = typeof saisie.source === 'string' ? saisie.source.trim() : ''
  if (!source) throw new ErreurMetier("La source de l'analyse est obligatoire.")
  verifierLongueur(source, SOURCE_MAX, "Source de l'analyse trop longue")
  if (!Number.isInteger(saisie.nb_entretiens) || saisie.nb_entretiens < 0) {
    throw new ErreurMetier("Le nombre d'entretiens est un entier positif ou nul.")
  }
  if (saisie.type === 'fiche_repondant' && !saisie.repondant_id) {
    throw new ErreurMetier('Une fiche de répondant se rattache à un répondant.')
  }
  if (saisie.type !== 'fiche_repondant' && saisie.repondant_id) {
    throw new ErreurMetier('Seule une fiche de répondant se rattache à un répondant.')
  }

  await lireProjet(db, saisie.projet_id)
  await verifierRattachements(db, saisie.projet_id, saisie.questionnaire_id, saisie.repondant_id)

  const analyse: Analyse = {
    id: nouvelId(),
    projet_id: saisie.projet_id,
    questionnaire_id: saisie.questionnaire_id ?? null,
    repondant_id: saisie.repondant_id ?? null,
    type: saisie.type,
    contenu: saisie.contenu,
    source,
    nb_entretiens: saisie.nb_entretiens,
    cree_le: maintenantIso(),
  }
  await db.prepare(
    `INSERT INTO analyses (id, projet_id, questionnaire_id, repondant_id, type, contenu, source, nb_entretiens, cree_le)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).bind(
    analyse.id, analyse.projet_id, analyse.questionnaire_id, analyse.repondant_id, analyse.type,
    analyse.contenu, analyse.source, analyse.nb_entretiens, analyse.cree_le,
  ).run()
  return analyse
}

type LigneResume = Omit<AnalyseResume, 'portee'> & { public_vise: string | null; prenom: string | null; nom: string | null }

function libellePortee(ligne: LigneResume): string {
  if (ligne.repondant_id) return `Répondant : ${ligne.prenom} ${ligne.nom}`
  if (ligne.questionnaire_id) return `Questionnaire : ${ligne.public_vise}`
  return 'Projet entier'
}

/** Analyses d'un projet, les plus récentes d'abord, sans leur contenu. L'admin y voit les vrais noms. */
export async function listerAnalyses(db: D1Database, filtre: FiltreAnalyses): Promise<AnalyseResume[]> {
  await lireProjet(db, filtre.projet_id)
  const { results } = await db.prepare(
    `SELECT a.id, a.projet_id, a.questionnaire_id, a.repondant_id, a.type, a.source, a.nb_entretiens, a.cree_le,
            LENGTH(a.contenu) AS taille, q.public_vise, r.prenom, r.nom
     FROM analyses a
     LEFT JOIN questionnaires q ON q.id = a.questionnaire_id
     LEFT JOIN repondants r ON r.id = a.repondant_id
     WHERE a.projet_id = ?1
       AND (?2 IS NULL OR a.questionnaire_id = ?2)
       AND (?3 IS NULL OR a.repondant_id = ?3)
       AND (?4 IS NULL OR a.type = ?4)
     ORDER BY a.cree_le DESC, a.id DESC`,
  ).bind(filtre.projet_id, filtre.questionnaire_id ?? null, filtre.repondant_id ?? null, filtre.type ?? null)
    .all<LigneResume>()
  return results.map(({ public_vise, prenom, nom, ...resume }) => ({
    ...resume,
    portee: libellePortee({ ...resume, public_vise, prenom, nom }),
  }))
}

export async function lireAnalyse(db: D1Database, id: string): Promise<Analyse> {
  const analyse = await db.prepare('SELECT * FROM analyses WHERE id = ?').bind(id).first<Analyse>()
  if (!analyse) throw new ErreurMetier(`Analyse introuvable : ${id}`, 404)
  return analyse
}

export async function supprimerAnalyse(db: D1Database, id: string): Promise<void> {
  const { meta } = await db.prepare('DELETE FROM analyses WHERE id = ?').bind(id).run()
  if (meta.changes === 0) throw new ErreurMetier(`Analyse introuvable : ${id}`, 404)
}
