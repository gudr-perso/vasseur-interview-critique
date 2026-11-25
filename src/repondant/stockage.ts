import { estVide, lireBrouillonBrut, type Brouillon } from './saisie'

// Stockage local du navigateur. Il peut être absent ou refuser l'accès (navigation privée, réglages) :
// chaque accès est protégé, et l'écran fonctionne sans lui.

const PREFIXE_JETON = 'vs-repondant-'

function local(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function session(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function lire(stockage: Storage | null, cle: string): string | null {
  try {
    return stockage?.getItem(cle) ?? null
  } catch {
    return null
  }
}

function ecrire(stockage: Storage | null, cle: string, valeur: string | null): void {
  try {
    if (valeur === null) stockage?.removeItem(cle)
    else stockage?.setItem(cle, valeur)
  } catch {
    // Stockage plein ou refusé : la saisie reste à l'écran, seule la reprise après rechargement est perdue.
  }
}

/** Jeton déjà obtenu par ce navigateur sur le lien générique `code`. */
export function jetonPourCode(code: string): string | null {
  return lire(local(), PREFIXE_JETON + code)
}

export function retenirJeton(code: string, jeton: string): void {
  ecrire(local(), PREFIXE_JETON + code, jeton)
}

/** Oublie tout lien générique qui menait à ce jeton (répondant supprimé ou inconnu). */
export function oublierJeton(jeton: string): void {
  const stockage = local()
  if (!stockage) return
  try {
    const cles: string[] = []
    for (let i = 0; i < stockage.length; i++) {
      const cle = stockage.key(i)
      if (cle?.startsWith(PREFIXE_JETON) && stockage.getItem(cle) === jeton) cles.push(cle)
    }
    cles.forEach(cle => stockage.removeItem(cle))
  } catch {
    // Rien à faire : au pire, le lien générique redirigera encore vers « Lien invalide ».
  }
}

const cleSaisie = (jeton: string, ordre: number) => `vs-saisie-${jeton}-${ordre}`

export function lireBrouillon(jeton: string, ordre: number): Brouillon {
  return lireBrouillonBrut(lire(session(), cleSaisie(jeton, ordre)))
}

export function garderBrouillon(jeton: string, ordre: number, brouillon: Brouillon): void {
  ecrire(session(), cleSaisie(jeton, ordre), estVide(brouillon) ? null : JSON.stringify(brouillon))
}

export function effacerBrouillon(jeton: string, ordre: number): void {
  ecrire(session(), cleSaisie(jeton, ordre), null)
}
