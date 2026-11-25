import { reponseEnTexte, type Reponse } from '../../shared/repondants'
import { ErreurMetier } from '../erreurs'
import { rendreEntretien, type LigneTour } from './corpus'
import { lireProjet } from './projets'
import { lireQuestionnaire } from './questionnaires'

export type FormatExport = 'csv' | 'md'

export interface DemandeExport {
  projet_id: string
  /** Absent : tout le projet. */
  questionnaire_id?: string
  /** Ajoute les entretiens commencés mais pas terminés. */
  inclure_en_cours: boolean
}

export interface Export {
  contenu: string
  type_mime: string
  /** Nom de fichier sans accent ni caractère spécial. */
  nom_fichier: string
  /** Même nom, avec ses accents. */
  nom_affiche: string
}

/** Colonnes du CSV, dans l'ordre : elles ne changent pas d'un export à l'autre. */
export const COLONNES_CSV = [
  'projet', 'questionnaire', 'public', 'mode', 'nom', 'prenom', 'poste', 'entreprise', 'mail', 'origine',
  'statut', 'commence_le', 'termine_le', 'ordre', 'type', 'question_id', 'question', 'reponse', 'valeur',
  'commentaire', 'repondu_le',
] as const

const BOM = '﻿'

interface LigneEntretien {
  id: string
  questionnaire_id: string
  nom: string
  prenom: string
  poste: string
  entreprise: string
  mail: string
  origine: string
  statut: 'commence' | 'termine'
  commence_le: string | null
  termine_le: string | null
  public_vise: string
  mode: string
  contenu: string
}

interface LigneTourExport extends LigneTour {
  ordre: number
  cree_le: string
}

/**
 * Cellule CSV : neutralise l'injection de formule (une cellule qui commence par `=`, `+`, `-`, `@`,
 * tabulation ou retour chariot reçoit une apostrophe), puis met entre guillemets si nécessaire.
 */
export function celluleCsv(valeur: string): string {
  const sure = /^[=+\-@\t\r]/.test(valeur) ? `'${valeur}` : valeur
  return /[;"\r\n]/.test(sure) ? `"${sure.replace(/"/g, '""')}"` : sure
}

function ligneCsv(cellules: string[]): string {
  return cellules.map(celluleCsv).join(';')
}

/** Valeur brute d'une réponse : option, options séparées par « | », ou note. */
function valeurBrute(reponse: Reponse | null): string {
  const valeur = reponse?.valeur
  if (valeur === undefined) return ''
  return Array.isArray(valeur) ? valeur.join(' | ') : String(valeur)
}

/** Nom de fichier sans accent ni caractère spécial. */
export function nomSansAccent(texte: string): string {
  const net = texte.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')
  return net || 'export'
}

/** En-tête `Content-Disposition` : forme simple en ASCII, et forme `filename*` avec les accents (RFC 5987). */
export function enTeteTelechargement(export_: Pick<Export, 'nom_fichier' | 'nom_affiche'>): string {
  const encode = encodeURIComponent(export_.nom_affiche).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${export_.nom_fichier}"; filename*=UTF-8''${encode}`
}

function nomAffiche(base: string, date: string, extension: string): string {
  // Ni séparateur de chemin, ni caractère de contrôle, ni guillemet.
  const propre = base.replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'export'
  return `${propre}-${date}.${extension}`
}

function nomEntier(repondant: Pick<LigneEntretien, 'nom' | 'prenom'>): string {
  return [repondant.prenom, repondant.nom].filter(Boolean).join(' ').replace(/\s+/g, ' ')
}

export async function exporterReponses(
  db: D1Database, demande: DemandeExport, format: FormatExport, maintenant: Date = new Date(),
): Promise<Export> {
  const projet = await lireProjet(db, demande.projet_id)
  let questionnaire: Awaited<ReturnType<typeof lireQuestionnaire>> | undefined
  if (demande.questionnaire_id) {
    questionnaire = await lireQuestionnaire(db, demande.questionnaire_id)
    if (questionnaire.projet_id !== projet.id) {
      throw new ErreurMetier(`Questionnaire introuvable : ${demande.questionnaire_id}`, 404)
    }
  }

  const statuts = demande.inclure_en_cours ? ['termine', 'commence'] : ['termine']
  const { results: repondants } = await db.prepare(
    `SELECT r.id, r.questionnaire_id, r.nom, r.prenom, r.poste, r.entreprise, r.mail, r.origine, r.statut,
            r.commence_le, r.termine_le, q.public_vise, q.mode, q.contenu
     FROM repondants r JOIN questionnaires q ON q.id = r.questionnaire_id
     WHERE q.projet_id = ?1 AND (?2 IS NULL OR q.id = ?2)
     ORDER BY q.cree_le, q.id, r.commence_le, r.id`,
  ).bind(projet.id, demande.questionnaire_id ?? null).all<LigneEntretien>()
  const retenus = repondants.filter(r => statuts.includes(r.statut))

  const { results: lignes } = await db.prepare(
    `SELECT t.repondant_id, t.ordre, t.type, t.question_id, t.question, t.reponse, t.cree_le
     FROM tours t JOIN repondants r ON r.id = t.repondant_id JOIN questionnaires q ON q.id = r.questionnaire_id
     WHERE q.projet_id = ?1 AND (?2 IS NULL OR q.id = ?2)
     ORDER BY t.repondant_id, t.ordre`,
  ).bind(projet.id, demande.questionnaire_id ?? null).all<LigneTourExport>()
  const tours = new Map<string, LigneTourExport[]>()
  for (const ligne of lignes) tours.set(ligne.repondant_id, [...(tours.get(ligne.repondant_id) ?? []), ligne])

  const date = maintenant.toISOString().slice(0, 10)
  const base = questionnaire ? questionnaire.public_vise : projet.titre
  const extension = format
  const nom_affiche = nomAffiche(base, date, extension)
  const nom_fichier = `${nomSansAccent(base)}-${date}.${extension}`

  if (format === 'csv') {
    const sortie = [ligneCsv([...COLONNES_CSV])]
    for (const r of retenus) {
      for (const t of tours.get(r.id) ?? []) {
        const reponse = t.reponse === null ? null : JSON.parse(t.reponse) as Reponse
        sortie.push(ligneCsv([
          projet.titre, r.questionnaire_id, r.public_vise, r.mode, r.nom, r.prenom, r.poste, r.entreprise, r.mail,
          r.origine, r.statut, r.commence_le ?? '', r.termine_le ?? '', String(t.ordre), t.type, t.question_id ?? '',
          t.question, reponse ? reponseEnTexte({ ...reponse, commentaire: undefined }) : '', valeurBrute(reponse),
          reponse?.commentaire ?? '', reponse ? t.cree_le : '',
        ]))
      }
    }
    return { contenu: BOM + sortie.join('\r\n') + '\r\n', type_mime: 'text/csv; charset=utf-8', nom_fichier, nom_affiche }
  }

  const [annee, mois, jour] = date.split('-')
  const entete = [`# ${projet.titre}`]
  if (questionnaire) entete.push(`Questionnaire : ${questionnaire.public_vise}`)
  entete.push(`Export du ${jour}/${mois}/${annee} · ${retenus.length} entretien${retenus.length > 1 ? 's' : ''}`, '')
  const sections = retenus.map(r => {
    const identite = nomEntier(r) || 'Répondant sans nom'
    const detail = [r.poste, r.entreprise].filter(Boolean).join(', ')
    const titre = `## ${identite}${detail ? ` — ${detail}` : ''} (${r.statut === 'termine' ? 'terminé' : 'en cours'})`
    return rendreEntretien(r, titre, tours.get(r.id) ?? [], false)
  })
  return {
    contenu: entete.join('\n') + '\n' + sections.join('\n'),
    type_mime: 'text/markdown; charset=utf-8', nom_fichier, nom_affiche,
  }
}

/** Lit `format` et `inclure_en_cours` dans l'adresse d'une demande d'export. */
export function lireOptionsExport(url: URL): { format: FormatExport; inclure_en_cours: boolean } {
  const format = url.searchParams.get('format') ?? 'csv'
  if (format !== 'csv' && format !== 'md') throw new ErreurMetier('Format inconnu : attendu « csv » ou « md ».')
  const enCours = url.searchParams.get('inclure_en_cours') ?? '0'
  if (enCours !== '0' && enCours !== '1') throw new ErreurMetier('inclure_en_cours : attendu 0 ou 1.')
  return { format, inclure_en_cours: enCours === '1' }
}

export function reponseExport(export_: Export): Response {
  return new Response(export_.contenu, {
    headers: {
      'Content-Type': export_.type_mime,
      'Content-Disposition': enTeteTelechargement(export_),
      'Cache-Control': 'no-store',
    },
  })
}
