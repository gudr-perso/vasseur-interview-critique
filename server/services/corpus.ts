import type { PorteeAnalyse } from '../../shared/analyses'
import type { ContenuEntretien, ContenuHybride, TypeDemande } from '../../shared/interviews'
import { reponseEnTexte, type Reponse, type StatutRepondant } from '../../shared/repondants'
import { ErreurMetier } from '../erreurs'
import { caracteres } from '../texte'
import { lireProjet } from './projets'
import { lireQuestionnaire } from './questionnaires'

export interface Corpus {
  /** Entretiens en Markdown, désignés par des pseudonymes : jamais d'identité ni d'identifiant. */
  texte: string
  nb_entretiens: number
  /** Correspondance pseudonyme → répondant, pour rattacher une fiche à la bonne personne. À ne pas transmettre à l'IA. */
  repondants: { id: string; pseudonyme: string }[]
}

export interface Morceau {
  texte: string
  debut: number
  /** Taille totale du texte, en caractères. */
  taille: number
  /** Début du morceau suivant, ou null quand tout est lu. */
  suite: number | null
}

export interface LigneRepondant {
  id: string
  questionnaire_id: string
  poste: string
  entreprise: string
  statut: 'commence' | 'termine'
  termine_le: string | null
  public_vise: string
  contenu: string
}

export interface LigneTour {
  repondant_id: string
  type: 'question' | 'relance'
  question_id: string | null
  question: string
  reponse: string | null
}

/** Date ISO (AAAA-MM-JJ…) en JJ/MM/AAAA. */
function dateFrancaise(iso: string): string {
  const [annee, mois, jour] = iso.slice(0, 10).split('-')
  return `${jour}/${mois}/${annee}`
}

// ─── Neutralisation du texte saisi ───────────────────────────────────────────
// Le corpus a une structure que l'IA lit ligne à ligne : titres `##`, questions `**Q…**`, relances, flèches.
// Aucun texte saisi (réponse, commentaire, poste, entreprise, nom), ni même une question rédigée par l'IA
// d'entretien, ne doit pouvoir commencer une telle ligne.

/** Fins de ligne reconnues, y compris celles d'Unicode qu'un modèle peut lire comme un saut de ligne. */
const FIN_DE_LIGNE = /\r\n|[\n\r\v\f\u0085\u2028\u2029]/
/** Caractères de contrôle, hors tabulation et fins de ligne : ils n'ont rien à faire dans un texte lu. */
const CONTROLES = /[\u0000-\u0008\u000e-\u001f\u007f-\u0084\u0086-\u009f]/g

/** Texte ramené à une seule ligne : chaque suite d'espaces ou de sauts de ligne devient une espace. */
export function surUneLigne(texte: string): string {
  return texte.replace(CONTROLES, '').split(FIN_DE_LIGNE).join(' ').replace(/\s+/g, ' ').trim()
}

/** Champ d'un titre d'entretien : une ligne, sans `#` ni tiret long (qui sépare le pseudonyme du reste). */
export function champDeTitre(texte: string): string {
  return surUneLigne(texte.replace(/#/g, ' ').replace(/—/g, '-'))
}

/**
 * Lignes d'une réponse : la première suit la flèche, chacune des suivantes commence par `>`.
 * Aucune ne peut donc commencer par `#`, `→`, `**Q` ou `**Relance.**`, et le texte reste lisible en entier.
 */
export function lignesDeReponse(texte: string): string[] {
  const [premiere, ...suivantes] = texte.replace(CONTROLES, '').trim().split(FIN_DE_LIGNE).map(l => l.trimEnd())
  return [`→ ${premiere}`, ...suivantes.map(l => (l ? `> ${l}` : '>'))]
}

export function titreEntretien(pseudonyme: string, poste: string, entreprise: string): string {
  const detail = [champDeTitre(poste), champDeTitre(entreprise)].filter(Boolean).join(', ')
  return detail ? `## ${pseudonyme} — ${detail}` : `## ${pseudonyme}`
}

function objectifs(contenuJson: string): Map<string, string> {
  const contenu = JSON.parse(contenuJson) as Partial<ContenuHybride & ContenuEntretien>
  return new Map((contenu.questions ?? []).map(q => [q.id, q.objectif]))
}

/**
 * Un entretien en Markdown. `titre` est la ligne de titre déjà composée (`## …`) : pseudonyme pour l'IA, vrai nom pour l'admin.
 * `avecObjectifs` : l'analyse reçoit l'objectif de chaque question, pas la lecture ni l'export.
 * Le texte saisi est neutralisé (voir `lignesDeReponse`) : la forme est décrite aux IA par `FORME_ENTRETIENS`.
 */
export function rendreEntretien(
  repondant: Pick<LigneRepondant, 'statut' | 'termine_le' | 'public_vise' | 'contenu'>,
  titre: string, tours: LigneTour[], avecObjectifs = true,
): string {
  const objectifParQuestion = avecObjectifs ? objectifs(repondant.contenu) : new Map<string, string>()
  const etat = repondant.statut === 'termine' && repondant.termine_le
    ? `terminé le ${dateFrancaise(repondant.termine_le)}`
    : 'entretien inachevé'
  const lignes = [
    titre,
    `Questionnaire : ${surUneLigne(repondant.public_vise)} · ${etat}`,
    '',
  ]
  let numero = 0
  for (const tour of tours) {
    if (tour.type === 'question') numero++
    // Une question posée sans réponse est omise ; sa place dans la numérotation est gardée.
    if (tour.reponse === null) continue
    const reponse = reponseEnTexte(JSON.parse(tour.reponse) as Reponse)
    if (tour.type === 'relance') {
      lignes.push(`**Relance.** ${surUneLigne(tour.question)}`)
    } else {
      lignes.push(`**Q${numero}. ${surUneLigne(tour.question)}**`)
      const objectif = tour.question_id ? objectifParQuestion.get(tour.question_id) : undefined
      if (objectif) lignes.push(`Objectif : ${surUneLigne(objectif)}`)
    }
    lignes.push(...lignesDeReponse(reponse), '')
  }
  return lignes.join('\n')
}

/** Les invités n'ont ni entretien ni pseudonyme. */
const ONT_COMMENCE = "r.statut <> 'invite'"
/** Ordre qui fixe les numéros des pseudonymes, sur l'ensemble du projet. */
const ORDRE_DES_PSEUDONYMES = 'ORDER BY r.commence_le, r.id'

function numeroter(ids: string[]): Map<string, string> {
  return new Map(ids.map((id, i) => [id, `Répondant ${i + 1}`]))
}

/** Pseudonyme de chaque répondant du projet qui a commencé son entretien, par identifiant. */
export async function pseudonymesDuProjet(db: D1Database, projetId: string): Promise<Map<string, string>> {
  const { results } = await db.prepare(
    `SELECT r.id FROM repondants r JOIN questionnaires q ON q.id = r.questionnaire_id
     WHERE q.projet_id = ? AND ${ONT_COMMENCE} ${ORDRE_DES_PSEUDONYMES}`,
  ).bind(projetId).all<{ id: string }>()
  return numeroter(results.map(r => r.id))
}

/** Répondant tel qu'une IA d'analyse peut le voir : ni nom, ni prénom, ni mail, ni jeton. */
export interface RepondantPseudonymise {
  repondant_id: string
  /** Nul pour un invité qui n'a pas commencé : il n'a pas d'entretien. */
  pseudonyme: string | null
  poste: string
  entreprise: string
  statut: StatutRepondant
  nb_reponses: number
  commence_le: string | null
  termine_le: string | null
}

/** Répondants d'un questionnaire dans l'ordre de leurs pseudonymes, les invités en dernier. */
export async function listerRepondantsPseudonymises(db: D1Database, questionnaireId: string): Promise<RepondantPseudonymise[]> {
  const questionnaire = await lireQuestionnaire(db, questionnaireId)
  const pseudonymes = await pseudonymesDuProjet(db, questionnaire.projet_id)
  // Colonnes choisies une à une : l'identité ne doit pas sortir de cette requête.
  const { results } = await db.prepare(
    `SELECT r.id AS repondant_id, r.poste, r.entreprise, r.statut, r.commence_le, r.termine_le,
       (SELECT COUNT(*) FROM tours t WHERE t.repondant_id = r.id AND t.reponse IS NOT NULL) AS nb_reponses
     FROM repondants r WHERE r.questionnaire_id = ?
     ORDER BY r.commence_le IS NULL, r.commence_le, r.id`,
  ).bind(questionnaireId).all<Omit<RepondantPseudonymise, 'pseudonyme'>>()
  return results.map(r => ({
    repondant_id: r.repondant_id,
    pseudonyme: pseudonymes.get(r.repondant_id) ?? null,
    poste: r.poste, entreprise: r.entreprise, statut: r.statut,
    nb_reponses: r.nb_reponses, commence_le: r.commence_le, termine_le: r.termine_le,
  }))
}

/** Entretien pseudonymisé d'un seul répondant, avec le projet et le questionnaire auxquels il se rattache. */
export async function entretienPseudonymise(db: D1Database, repondantId: string): Promise<{
  projet_id: string
  questionnaire_id: string
  /** Nul pour un invité qui n'a pas commencé. */
  pseudonyme: string | null
  corpus: Corpus
}> {
  const ligne = await db.prepare(
    `SELECT q.projet_id, q.id AS questionnaire_id FROM repondants r JOIN questionnaires q ON q.id = r.questionnaire_id
     WHERE r.id = ?`,
  ).bind(repondantId).first<{ projet_id: string; questionnaire_id: string }>()
  if (!ligne) throw new ErreurMetier(`Répondant introuvable : ${repondantId}`, 404)
  const corpus = await construireCorpus(db, { projet_id: ligne.projet_id, repondant_id: repondantId })
  return { ...ligne, pseudonyme: corpus.repondants[0]?.pseudonyme ?? null, corpus }
}

/**
 * Entretiens d'un projet, d'un questionnaire ou d'un répondant, en texte compact et pseudonymisé.
 * Le numéro d'un répondant se calcule sur tout le projet : il ne change pas avec la portée demandée.
 */
export async function construireCorpus(db: D1Database, portee: PorteeAnalyse): Promise<Corpus> {
  await lireProjet(db, portee.projet_id)
  if (portee.questionnaire_id) {
    const questionnaire = await lireQuestionnaire(db, portee.questionnaire_id)
    if (questionnaire.projet_id !== portee.projet_id) {
      throw new ErreurMetier(`Questionnaire introuvable : ${portee.questionnaire_id}`, 404)
    }
  }

  const { results: commences } = await db.prepare(
    `SELECT r.id, r.questionnaire_id, r.poste, r.entreprise, r.statut, r.termine_le, q.public_vise, q.contenu
     FROM repondants r JOIN questionnaires q ON q.id = r.questionnaire_id
     WHERE q.projet_id = ? AND ${ONT_COMMENCE} ${ORDRE_DES_PSEUDONYMES}`,
  ).bind(portee.projet_id).all<LigneRepondant>()
  const pseudonymes = numeroter(commences.map(r => r.id))

  let retenus: LigneRepondant[]
  if (portee.repondant_id) {
    const appartient = await db.prepare(
      `SELECT r.id FROM repondants r JOIN questionnaires q ON q.id = r.questionnaire_id
       WHERE r.id = ? AND q.projet_id = ? AND (?3 IS NULL OR q.id = ?3)`,
    ).bind(portee.repondant_id, portee.projet_id, portee.questionnaire_id ?? null).first()
    if (!appartient) throw new ErreurMetier(`Répondant introuvable : ${portee.repondant_id}`, 404)
    retenus = commences.filter(r => r.id === portee.repondant_id)
  } else {
    const statuts = portee.inclure_en_cours ? ['termine', 'commence'] : ['termine']
    retenus = commences.filter(r =>
      statuts.includes(r.statut) && (!portee.questionnaire_id || r.questionnaire_id === portee.questionnaire_id))
  }
  if (retenus.length === 0) return { texte: '', nb_entretiens: 0, repondants: [] }

  const { results: lignes } = await db.prepare(
    `SELECT t.repondant_id, t.type, t.question_id, t.question, t.reponse
     FROM tours t JOIN repondants r ON r.id = t.repondant_id JOIN questionnaires q ON q.id = r.questionnaire_id
     WHERE q.projet_id = ? ORDER BY t.repondant_id, t.ordre`,
  ).bind(portee.projet_id).all<LigneTour>()
  const toursParRepondant = new Map<string, LigneTour[]>()
  for (const ligne of lignes) {
    toursParRepondant.set(ligne.repondant_id, [...(toursParRepondant.get(ligne.repondant_id) ?? []), ligne])
  }

  return {
    texte: retenus.map(r => rendreEntretien(r, titreEntretien(pseudonymes.get(r.id)!, r.poste, r.entreprise), toursParRepondant.get(r.id) ?? [])).join('\n'),
    nb_entretiens: retenus.length,
    repondants: retenus.map(r => ({ id: r.id, pseudonyme: pseudonymes.get(r.id)! })),
  }
}

/** Début d'un morceau : on recule jusqu'au dernier `## ` qui précède la limite, pour ne pas couper un entretien. */
function limiteDuMorceau(lettres: string[], debut: number, fin: number): number {
  for (let p = fin; p > debut; p--) {
    if (lettres[p] === '#' && lettres[p + 1] === '#' && lettres[p + 2] === ' ' && lettres[p - 1] === '\n') return p
  }
  return fin
}

/** Morceau de `longueur` caractères entiers à partir de `debut`, coupé de préférence entre deux entretiens. */
export function decouper(texte: string, debut: number, longueur: number): Morceau {
  const lettres = caracteres(texte)
  const taille = lettres.length
  let fin = Math.min(debut + longueur, taille)
  if (fin < taille) fin = limiteDuMorceau(lettres, debut, fin)
  return { texte: lettres.slice(debut, fin).join(''), debut, taille, suite: fin < taille ? fin : null }
}

const TYPES_DEMANDE_LIBELLES: Record<TypeDemande, string> = {
  evolution_simple: 'évolution simple',
  amelioration: 'amélioration',
  nouvelle_fonctionnalite: 'nouvelle fonctionnalité',
}

/** Contexte du projet pour l'analyse : cadrage, logiciels et objectifs des questions. Pas les documents joints. */
export async function enteteAnalyse(db: D1Database, projetId: string): Promise<string> {
  const projet = await lireProjet(db, projetId)
  const lignes = [`# Projet : ${projet.titre}`, `Type de demande : ${TYPES_DEMANDE_LIBELLES[projet.type_demande]}`]
  if (projet.description) lignes.push('', '## Demande', projet.description)
  if (projet.logiciels.length > 0) {
    lignes.push('', '## Logiciels')
    for (const logiciel of projet.logiciels) {
      lignes.push(`- ${logiciel.nom}${logiciel.contexte ? ` : ${logiciel.contexte}` : ''}`)
    }
  }
  if (projet.note_cadrage) lignes.push('', '## Note de cadrage', projet.note_cadrage)
  if (projet.resume_contexte) lignes.push('', '## Résumé de contexte', projet.resume_contexte)

  for (const resume of projet.questionnaires) {
    const questionnaire = await lireQuestionnaire(db, resume.id)
    lignes.push('', `## Questionnaire : ${questionnaire.public_vise} (${questionnaire.mode})`)
    if (questionnaire.mode === 'hybride') {
      for (const q of (questionnaire.contenu as ContenuHybride).questions) {
        lignes.push(`- ${q.libelle} — objectif : ${q.objectif}`)
      }
    } else {
      const contenu = questionnaire.contenu as ContenuEntretien
      lignes.push(`Question d'ouverture : ${contenu.question_ouverture}`)
      for (const theme of contenu.themes) lignes.push(`- Thème « ${theme.titre} » — objectif : ${theme.objectif}`)
    }
  }
  return lignes.join('\n') + '\n'
}
