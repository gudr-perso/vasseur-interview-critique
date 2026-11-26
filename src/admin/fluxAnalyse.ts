// Lecture du flux renvoyé par `POST /api/admin/projets/:id/analyses`, selon le contrat décrit dans
// `shared/analyses.ts` : une ligne d'en-tête JSON qui annonce le séparateur des lignes de contrôle, le texte de
// l'analyse au fil de l'eau, des lignes de contrôle `\n<séparateur> <JSON>\n` retirées du texte (signal de vie),
// et une dernière ligne de contrôle de succès, avec l'identifiant de l'analyse enregistrée, ou d'erreur.

import { FORME_SEPARATEUR, type ControleFluxAnalyse } from '../../shared/analyses'

export interface ResultatGeneration {
  nb_entretiens: number
  texte: string
  /** Analyse enregistrée : présent seulement quand le serveur a confirmé le succès. */
  analyse_id?: string
  /** Présent si la génération a échoué ou si le flux s'est arrêté sans conclure. */
  erreur?: string
}

export const REPONSE_INATTENDUE = 'Réponse inattendue du serveur : la génération a peut-être échoué.'
export const ERREUR_SANS_MESSAGE = 'La génération a échoué.'
export const FLUX_INACHEVE =
  "La connexion s'est arrêtée avant la fin de la génération : l'analyse n'a sans doute pas été enregistrée. Actualisez la liste pour vérifier, sinon relancez-la."

function lireEntete(ligne: string): { nb: number; separateur: string } | null {
  let valeur: unknown
  try {
    valeur = JSON.parse(ligne)
  } catch {
    return null
  }
  if (typeof valeur !== 'object' || valeur === null || !('nb_entretiens' in valeur) || !('controle' in valeur)) return null
  const { nb_entretiens: n, controle } = valeur
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return null
  if (typeof controle !== 'string' || !FORME_SEPARATEUR.test(controle)) return null
  return { nb: n, separateur: controle }
}

function lireControle(json: string): ControleFluxAnalyse | null {
  let valeur: unknown
  try {
    valeur = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof valeur !== 'object' || valeur === null || !('type' in valeur)) return null
  const controle = valeur as Record<string, unknown>
  if (controle.type === 'vie') return { type: 'vie' }
  if (controle.type === 'succes' && typeof controle.analyse_id === 'string' && controle.analyse_id) {
    return { type: 'succes', analyse_id: controle.analyse_id }
  }
  if (controle.type === 'erreur') {
    return { type: 'erreur', message: typeof controle.message === 'string' ? controle.message : '' }
  }
  return null
}

/** Nombre de caractères de fin de `texte` qui pourraient commencer `marque` : ils sont retenus. */
function finEnAttente(texte: string, marque: string): number {
  for (let n = Math.min(marque.length - 1, texte.length); n > 0; n--) {
    if (marque.startsWith(texte.slice(-n))) return n
  }
  return 0
}

/** Accumule les morceaux d'octets reçus ; `texte` est ce qui peut être affiché à l'instant. */
export class LecteurFluxAnalyse {
  private readonly decodeur = new TextDecoder('utf-8')
  /** Texte reçu tant que la ligne d'en-tête n'est pas complète. */
  private debut = ''
  private enteteInvalide = false
  private nb: number | null = null
  private marque = ''
  /** Texte de l'analyse, lignes de contrôle retirées. */
  private affiche = ''
  /** Reçu mais pas encore classé : début possible d'une ligne de contrôle. */
  private reste = ''
  private fin: ControleFluxAnalyse | null = null
  private controleInvalide = false

  get nb_entretiens(): number | null {
    return this.nb
  }

  get texte(): string {
    return this.affiche
  }

  ajouter(octets: Uint8Array): void {
    this.recevoir(this.decodeur.decode(octets, { stream: true }))
  }

  terminer(): ResultatGeneration {
    this.recevoir(this.decodeur.decode())
    if (this.nb === null && !this.enteteInvalide && this.debut) this.lireEntete(this.debut)
    if (this.nb === null) return { nb_entretiens: 0, texte: '', erreur: REPONSE_INATTENDUE }
    const resultat = { nb_entretiens: this.nb, texte: this.affiche }
    if (this.controleInvalide) return { ...resultat, erreur: REPONSE_INATTENDUE }
    if (this.fin?.type === 'succes') return { ...resultat, analyse_id: this.fin.analyse_id }
    if (this.fin?.type === 'erreur') return { ...resultat, erreur: this.fin.message.trim() || ERREUR_SANS_MESSAGE }
    // Pas de ligne finale : le flux a été coupé en route. Ce qui était retenu n'était pas une ligne de contrôle.
    return { ...resultat, texte: this.affiche + this.reste, erreur: FLUX_INACHEVE }
  }

  private lireEntete(ligne: string): boolean {
    const entete = lireEntete(ligne)
    if (!entete) {
      this.enteteInvalide = true
      return false
    }
    this.nb = entete.nb
    this.marque = `\n${entete.separateur} `
    return true
  }

  private recevoir(morceau: string): void {
    if (!morceau || this.enteteInvalide || this.fin || this.controleInvalide) return
    if (this.nb === null) {
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
      const controle = lireControle(this.reste.slice(this.marque.length, finLigne))
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
 * Lit tout le flux. `surTexte` reçoit le texte affichable cumulé chaque fois qu'il change.
 * Une coupure de lecture (réseau, arrêt demandé) est relancée telle quelle.
 */
export async function lireFluxAnalyse(
  flux: ReadableStream<Uint8Array>,
  surTexte: (texte: string, nb_entretiens: number) => void,
): Promise<ResultatGeneration> {
  const lecteur = new LecteurFluxAnalyse()
  const source = flux.getReader()
  // Le texte affichable ne fait que s'allonger : sa longueur suffit à savoir s'il a changé.
  let longueur = -1
  for (;;) {
    const { done, value } = await source.read()
    if (done) break
    lecteur.ajouter(value)
    const nb = lecteur.nb_entretiens
    const texte = lecteur.texte
    if (nb !== null && texte.length !== longueur) {
      longueur = texte.length
      surTexte(texte, nb)
    }
  }
  return lecteur.terminer()
}
