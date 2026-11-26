import type { MessageCadrage, RoleCadrage, TypeMessageCadrage } from '../../shared/cadrage'
import type { TypeDemande } from '../../shared/interviews'
import { ErreurMetier } from '../erreurs'
import { maintenantIso, nouvelId } from '../ids'
import { caracteres } from '../texte'
import { TYPES_DEMANDE_LIBELLES } from './corpus'
import { estInvisible, LIMITES, verifierLongueur } from './limites'
import { lireProjet } from './projets'

export type { MessageCadrage, RoleCadrage, TypeMessageCadrage }

/** Auteur d'un message d'après sa nature : seule une réponse vient de l'admin. */
export function roleDuType(type: TypeMessageCadrage): RoleCadrage {
  return type === 'reponse' ? 'admin' : 'ia'
}

/** Questions que l'IA peut poser, selon l'ampleur de la demande (décision 4 du plan). */
const PLAFONDS: Record<TypeDemande, number> = {
  evolution_simple: 3,
  amelioration: 6,
  nouvelle_fonctionnalite: 12,
}

/** Taille maximale du contexte donné à l'IA, en caractères (décision 5). */
export const MAX_CONTEXTE = 300_000

export function plafondQuestions(typeDemande: TypeDemande): number {
  return PLAFONDS[typeDemande]
}

/** Nombre de questions posées par l'IA, d'après la nature enregistrée de chaque message. */
export function questionsPosees(messages: Pick<MessageCadrage, 'type'>[]): number {
  return messages.filter(m => m.type === 'question').length
}

/** Vrai quand l'IA a conclu le dialogue : son dernier message est une conclusion. */
export function dialogueConclu(messages: Pick<MessageCadrage, 'type'>[]): boolean {
  return messages.at(-1)?.type === 'conclusion'
}

export async function listerMessages(db: D1Database, projetId: string): Promise<MessageCadrage[]> {
  const { results } = await db.prepare(
    'SELECT id, role, type, contenu, cree_le FROM cadrage_messages WHERE projet_id = ? ORDER BY cree_le, rowid',
  ).bind(projetId).all<MessageCadrage>()
  return results
}

export async function ajouterMessage(
  db: D1Database, projetId: string, type: TypeMessageCadrage, contenu: string,
): Promise<MessageCadrage> {
  const role = roleDuType(type)
  await lireProjet(db, projetId)
  const texte = contenu.trim()
  if (estInvisible(texte)) throw new ErreurMetier('Le message est vide.')
  verifierLongueur(
    texte, role === 'admin' ? LIMITES.message_cadrage_admin : LIMITES.message_cadrage_ia, 'Message trop long',
  )
  const message: MessageCadrage = { id: nouvelId(), role, type, contenu: texte, cree_le: maintenantIso() }
  await db.prepare('INSERT INTO cadrage_messages (id, projet_id, role, type, contenu, cree_le) VALUES (?,?,?,?,?,?)')
    .bind(message.id, projetId, role, type, texte, message.cree_le).run()
  return message
}

export async function effacerDialogue(db: D1Database, projetId: string): Promise<void> {
  await lireProjet(db, projetId)
  await db.prepare('DELETE FROM cadrage_messages WHERE projet_id = ?').bind(projetId).run()
}

/** Les `gardes` premiers caractères entiers du texte (une émoticône n'est jamais coupée en deux). */
function tronquer(texte: string, gardes: number): string {
  return caracteres(texte).slice(0, gardes).join('')
}

/**
 * Contexte du projet pour l'IA du cadrage : un travail interne, donc les documents en entier.
 * Aucune donnée de répondant (identité, réponses, entretiens) : seules la description, les fiches des logiciels,
 * la note de cadrage et les documents y figurent.
 * `tronquee` est vrai quand au moins un document a été raccourci pour tenir dans `MAX_CONTEXTE` caractères
 * (en-tête compris) ; chaque document est alors réduit dans la même proportion et sa mention dit combien est gardé.
 */
export async function contexteCadrage(db: D1Database, projetId: string): Promise<{ texte: string; tronquee: boolean }> {
  const projet = await lireProjet(db, projetId)
  const entete = [`# Projet : ${projet.titre}`, `Type de demande : ${TYPES_DEMANDE_LIBELLES[projet.type_demande]}`]
  if (projet.description) entete.push('', '## Demande', projet.description)
  if (projet.logiciels.length > 0) {
    entete.push('', '## Logiciels')
    for (const logiciel of projet.logiciels) {
      entete.push(`- ${logiciel.nom}${logiciel.contexte ? ` : ${logiciel.contexte}` : ''}`)
    }
  }
  if (projet.note_cadrage.trim()) entete.push('', '## Note de cadrage existante', projet.note_cadrage)
  const texteEntete = entete.join('\n')
  if (projet.documents.length === 0) return { texte: texteEntete + '\n', tronquee: false }

  const longueurs = projet.documents.map(d => caracteres(d.contenu).length)
  const totalDocuments = longueurs.reduce((a, b) => a + b, 0)
  const budget = Math.max(0, MAX_CONTEXTE - caracteres(texteEntete).length)
  const tronquee = totalDocuments > budget

  const lignes = [texteEntete, '', '## Documents']
  projet.documents.forEach((document, i) => {
    const total = longueurs[i]
    const gardes = tronquee ? Math.floor(total * budget / totalDocuments) : total
    lignes.push('', `### ${document.nom}`, tronquee ? tronquer(document.contenu, gardes) : document.contenu)
    if (tronquee) lignes.push(`*(document tronqué : ${gardes} caractères sur ${total})*`)
  })
  return { texte: lignes.join('\n') + '\n', tronquee }
}
