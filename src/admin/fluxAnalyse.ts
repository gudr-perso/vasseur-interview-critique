// Lecture du flux renvoyé par `POST /api/admin/projets/:id/analyses` : une première ligne JSON
// d'en-tête (`{"nb_entretiens":4}`), puis le texte de l'analyse au fil de l'eau ; en cas d'échec
// en cours de route, une dernière ligne `\n\n[[ERREUR]] <message>`.

export interface ResultatGeneration {
  nb_entretiens: number
  texte: string
  /** Présent si la génération a échoué ou n'a rien produit. */
  erreur?: string
}

const MARQUE_ERREUR = '\n\n[[ERREUR]]'
export const REPONSE_INATTENDUE = 'Réponse inattendue du serveur : la génération a peut-être échoué.'
export const ERREUR_SANS_MESSAGE = 'La génération a échoué.'
export const ANALYSE_VIDE = "L'IA n'a produit aucun texte : rien n'a été enregistré."

function lireEntete(ligne: string): number | null {
  let valeur: unknown
  try {
    valeur = JSON.parse(ligne)
  } catch {
    return null
  }
  if (typeof valeur !== 'object' || valeur === null || !('nb_entretiens' in valeur)) return null
  const n = valeur.nb_entretiens
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null
}

/** Nombre de caractères de fin de `texte` qui pourraient commencer la marque d'erreur : ils sont retenus. */
function finEnAttente(texte: string): number {
  for (let n = Math.min(MARQUE_ERREUR.length - 1, texte.length); n > 0; n--) {
    if (MARQUE_ERREUR.startsWith(texte.slice(-n))) return n
  }
  return 0
}

/** Accumule les morceaux d'octets reçus ; `texte` est ce qui peut être affiché à l'instant. */
export class LecteurFluxAnalyse {
  private readonly decodeur = new TextDecoder('utf-8')
  /** Texte reçu tant que la ligne d'en-tête n'est pas complète. */
  private debut = ''
  private corps = ''
  private indexErreur = -1
  private enteteInvalide = false
  private nb: number | null = null

  get nb_entretiens(): number | null {
    return this.nb
  }

  get texte(): string {
    if (this.indexErreur >= 0) return this.corps.slice(0, this.indexErreur)
    return this.corps.slice(0, this.corps.length - finEnAttente(this.corps))
  }

  ajouter(octets: Uint8Array): void {
    this.recevoir(this.decodeur.decode(octets, { stream: true }))
  }

  terminer(): ResultatGeneration {
    this.recevoir(this.decodeur.decode())
    if (this.nb === null && !this.enteteInvalide && this.debut) {
      // En-tête seul, sans saut de ligne ni texte.
      this.nb = lireEntete(this.debut)
    }
    if (this.nb === null) return { nb_entretiens: 0, texte: '', erreur: REPONSE_INATTENDUE }
    const resultat = { nb_entretiens: this.nb }
    if (this.indexErreur >= 0) {
      const message = this.corps.slice(this.indexErreur + MARQUE_ERREUR.length).trim()
      return { ...resultat, texte: this.texte, erreur: message || ERREUR_SANS_MESSAGE }
    }
    if (!this.corps.trim()) return { ...resultat, texte: '', erreur: ANALYSE_VIDE }
    return { ...resultat, texte: this.corps }
  }

  private recevoir(morceau: string): void {
    if (!morceau || this.enteteInvalide) return
    if (this.nb === null) {
      this.debut += morceau
      const fin = this.debut.indexOf('\n')
      if (fin < 0) return
      this.nb = lireEntete(this.debut.slice(0, fin))
      if (this.nb === null) {
        this.enteteInvalide = true
        return
      }
      morceau = this.debut.slice(fin + 1)
      this.debut = ''
    }
    if (this.indexErreur >= 0) {
      this.corps += morceau
      return
    }
    // La marque peut chevaucher la fin du texte déjà reçu : la recherche reprend juste avant.
    const depart = Math.max(0, this.corps.length - MARQUE_ERREUR.length + 1)
    this.corps += morceau
    this.indexErreur = this.corps.indexOf(MARQUE_ERREUR, depart)
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
