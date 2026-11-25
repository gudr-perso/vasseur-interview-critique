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

/** Clés du stockage qui vérifient `garder`, lues sans risque. */
function clesOu(stockage: Storage | null, garder: (cle: string, valeur: string | null) => boolean): string[] {
  if (!stockage) return []
  try {
    const cles: string[] = []
    for (let i = 0; i < stockage.length; i++) {
      const cle = stockage.key(i)
      if (cle && garder(cle, stockage.getItem(cle))) cles.push(cle)
    }
    return cles
  } catch {
    return []
  }
}

const meneA = (jeton: string) => (cle: string, valeur: string | null) => cle.startsWith(PREFIXE_JETON) && valeur === jeton

/**
 * Code du lien générique par lequel ce navigateur a obtenu ce jeton ; null pour une invitation nominative
 * (jamais retenue ici) ou un jeton déjà oublié.
 */
export function codePourJeton(jeton: string): string | null {
  const cle = clesOu(local(), meneA(jeton))[0]
  return cle ? cle.slice(PREFIXE_JETON.length) : null
}

/**
 * Oublie tout lien générique qui menait à ce jeton : entretien terminé, répondant supprimé ou inconnu,
 * ou nouvelle participation sur un poste partagé. La personne suivante repart de l'accueil.
 */
export function oublierJeton(jeton: string): void {
  const stockage = local()
  // Au pire, le lien générique redirigera encore vers ce jeton.
  clesOu(stockage, meneA(jeton)).forEach(cle => ecrire(stockage, cle, null))
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

/** Efface toutes les saisies en cours d'un jeton (poste partagé : rien ne reste pour la personne suivante). */
export function effacerBrouillons(jeton: string): void {
  const stockage = session()
  const prefixe = `vs-saisie-${jeton}-`
  clesOu(stockage, cle => cle.startsWith(prefixe)).forEach(cle => ecrire(stockage, cle, null))
}
