// Lecture d'une réponse de l'IA en flux, selon le contrat commun décrit dans `shared/flux.ts` : une ligne d'en-tête
// JSON qui annonce le séparateur des lignes de contrôle (et les champs propres à l'appelant), le texte au fil de
// l'eau, des lignes de contrôle `\n<séparateur> <JSON>\n` retirées du texte (signal de vie), et une dernière ligne
// de contrôle de succès, avec la charge utile de l'appelant, ou d'erreur.

import { FORME_SEPARATEUR, type ControleFlux } from '../../shared/flux'

export const REPONSE_INATTENDUE = 'Réponse inattendue du serveur : la génération a peut-être échoué.'
export const ERREUR_SANS_MESSAGE = 'La génération a échoué.'
export const FLUX_COUPE = "La connexion s'est arrêtée avant la fin de la génération. Relancez-la."

/** Objet JSON reçu, à valider champ par champ. */
export type ObjetRecu = Record<string, unknown>

export interface FormatFlux<C, S> {
  /** Champs de l'en-tête propres à l'appelant ; `null` si l'en-tête ne convient pas. Par défaut : aucun champ. */
  entete?: (valeur: ObjetRecu) => C | null
  /** Charge utile de la ligne de succès ; `null` si elle ne convient pas, ce qui rend la réponse inattendue. */
  succes: (valeur: ObjetRecu) => S | null
  /** Erreur rendue quand le flux s'arrête sans ligne finale. Par défaut : `FLUX_COUPE`. */
  fluxCoupe?: string
}

export interface ResultatFlux<C, S> {
  /** Champs de l'en-tête ; `null` si l'en-tête est absent ou illisible (`erreur` vaut alors `REPONSE_INATTENDUE`). */
  entete: C | null
  texte: string
  /** Présent seulement quand le serveur a confirmé le succès. */
  succes?: S
  /** Présent si la génération a échoué ou si le flux s'est arrêté sans conclure. */
  erreur?: string
}

/** Charge utile faite d'un seul identifiant non vide, par exemple `{ questionnaire_id }`. */
export function identifiant<K extends string>(cle: K): (valeur: ObjetRecu) => Record<K, string> | null {
  return valeur => {
    const id = valeur[cle]
    return typeof id === 'string' && id ? { [cle]: id } as Record<K, string> : null
  }
}

function objetJson(texte: string): ObjetRecu | null {
  let valeur: unknown
  try {
    valeur = JSON.parse(texte)
  } catch {
    return null
  }
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur) ? valeur as ObjetRecu : null
}

/** Nombre de caractères de fin de `texte` qui pourraient commencer `marque` : ils sont retenus. */
function finEnAttente(texte: string, marque: string): number {
  for (let n = Math.min(marque.length - 1, texte.length); n > 0; n--) {
    if (marque.startsWith(texte.slice(-n))) return n
  }
  return 0
}

/** Accumule les morceaux d'octets reçus ; `texte` est ce qui peut être affiché à l'instant. */
export class LecteurFlux<C, S> {
  private readonly decodeur = new TextDecoder('utf-8')
  /** Texte reçu tant que la ligne d'en-tête n'est pas complète. */
  private debut = ''
  private enteteInvalide = false
  private champs: C | null = null
  private marque = ''
  /** Texte affichable, lignes de contrôle retirées. */
  private affiche = ''
  /** Reçu mais pas encore classé : début possible d'une ligne de contrôle. */
  private reste = ''
  private fin: ControleFlux<{ charge: S }> | null = null
  private controleInvalide = false

  constructor(private readonly format: FormatFlux<C, S>) {}

  /** Champs de l'en-tête, dès qu'il est lu. */
  get entete(): C | null {
    return this.champs
  }

  get texte(): string {
    return this.affiche
  }

  ajouter(octets: Uint8Array): void {
    this.recevoir(this.decodeur.decode(octets, { stream: true }))
  }

  terminer(): ResultatFlux<C, S> {
    this.recevoir(this.decodeur.decode())
    if (this.champs === null && !this.enteteInvalide && this.debut) this.lireEntete(this.debut)
    if (this.champs === null) return { entete: null, texte: '', erreur: REPONSE_INATTENDUE }
    const resultat = { entete: this.champs, texte: this.affiche }
    if (this.controleInvalide) return { ...resultat, erreur: REPONSE_INATTENDUE }
    if (this.fin?.type === 'succes') return { ...resultat, succes: this.fin.charge }
    if (this.fin?.type === 'erreur') return { ...resultat, erreur: this.fin.message.trim() || ERREUR_SANS_MESSAGE }
    // Pas de ligne finale : le flux a été coupé en route. Ce qui était retenu n'était pas une ligne de contrôle.
    return { ...resultat, texte: this.affiche + this.reste, erreur: this.format.fluxCoupe ?? FLUX_COUPE }
  }

  private lireEntete(ligne: string): boolean {
    const valeur = objetJson(ligne)
    const { controle } = valeur ?? {}
    const champs = valeur && typeof controle === 'string' && FORME_SEPARATEUR.test(controle)
      ? (this.format.entete ? this.format.entete(valeur) : {} as C)
      : null
    if (champs === null) {
      this.enteteInvalide = true
      return false
    }
    this.champs = champs
    this.marque = `\n${controle} `
    return true
  }

  private lireControle(json: string): ControleFlux<{ charge: S }> | null {
    const valeur = objetJson(json)
    if (!valeur) return null
    if (valeur.type === 'vie') return { type: 'vie' }
    if (valeur.type === 'succes') {
      const charge = this.format.succes(valeur)
      return charge === null ? null : { type: 'succes', charge }
    }
    if (valeur.type === 'erreur') {
      return { type: 'erreur', message: typeof valeur.message === 'string' ? valeur.message : '' }
    }
    return null
  }

  private recevoir(morceau: string): void {
    if (!morceau || this.enteteInvalide || this.fin || this.controleInvalide) return
    if (this.champs === null) {
      this.debut += morceau
      const fin = this.debut.indexOf('\n')
      if (fin < 0 || !this.lireEntete(this.debut.slice(0, fin))) return
      morceau = this.debut.slice(fin + 1)
      this.debut = ''
    }
    this.reste += morceau
    for (;;) {
      const position = this.reste.indexOf(this.marque)
      if (position < 0) {
        const retenus = finEnAttente(this.reste, this.marque)
        this.affiche += this.reste.slice(0, this.reste.length - retenus)
        this.reste = this.reste.slice(this.reste.length - retenus)
        return
      }
      this.affiche += this.reste.slice(0, position)
      this.reste = this.reste.slice(position)
      const finLigne = this.reste.indexOf('\n', this.marque.length)
      // Ligne de contrôle incomplète : on attend la suite.
      if (finLigne < 0) return
      const controle = this.lireControle(this.reste.slice(this.marque.length, finLigne))
      this.reste = this.reste.slice(finLigne + 1)
      if (!controle) {
        this.controleInvalide = true
        return
      }
      if (controle.type !== 'vie') {
        // Succès ou erreur termine le flux : rien ne doit suivre.
        this.fin = controle
        return
      }
    }
  }
}

/**
 * Lit tout le flux. `surTexte` reçoit le texte affichable cumulé et les champs de l'en-tête chaque fois que le
 * texte change (une première fois, texte vide, dès l'en-tête lu). Une coupure de lecture (réseau, arrêt demandé)
 * est relancée telle quelle.
 */
export async function lireFlux<C, S>(
  flux: ReadableStream<Uint8Array>,
  format: FormatFlux<C, S>,
  surTexte: (texte: string, entete: C) => void,
): Promise<ResultatFlux<C, S>> {
  const lecteur = new LecteurFlux(format)
  const source = flux.getReader()
  // Le texte affichable ne fait que s'allonger : sa longueur suffit à savoir s'il a changé.
  let longueur = -1
  for (;;) {
    const { done, value } = await source.read()
    if (done) break
    lecteur.ajouter(value)
    const entete = lecteur.entete
    const texte = lecteur.texte
    if (entete !== null && texte.length !== longueur) {
      longueur = texte.length
      surTexte(texte, entete)
    }
  }
  return lecteur.terminer()
}
