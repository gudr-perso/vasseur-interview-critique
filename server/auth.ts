import { erreur } from './http'

export const NOM_COOKIE = 'vs_admin'
export const DUREE_SESSION_S = 60 * 60 * 24 * 30

const encodeur = new TextEncoder()

async function hmacHex(secret: string, message: string): Promise<string> {
  const cle = await crypto.subtle.importKey(
    'raw', encodeur.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cle, encodeur.encode(message))
  return [...new Uint8Array(signature)].map(o => o.toString(16).padStart(2, '0')).join('')
}

function egalEnTempsConstant(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}

/** Texte signé : l'échéance et l'empreinte du mot de passe courant, pour que changer le mot de passe révoque les sessions. */
async function messageSession(secret: string, motDePasse: string, echeance: string): Promise<string> {
  return `session:${echeance}:${await hmacHex(secret, `mdp:${motDePasse}`)}`
}

/** Valeur du cookie : `<échéance en ms>.<signature>`. */
export async function creerSession(
  secret: string, motDePasse: string, maintenantMs: number,
): Promise<string> {
  const echeance = String(maintenantMs + DUREE_SESSION_S * 1000)
  return `${echeance}.${await hmacHex(secret, await messageSession(secret, motDePasse, echeance))}`
}

export async function sessionValide(
  secret: string, motDePasse: string, valeur: string | null, maintenantMs: number,
): Promise<boolean> {
  if (!valeur) return false
  const morceaux = valeur.split('.')
  if (morceaux.length !== 2) return false
  const [echeance, signature] = morceaux
  if (!/^\d+$/.test(echeance) || Number(echeance) <= maintenantMs) return false
  const attendue = await hmacHex(secret, await messageSession(secret, motDePasse, echeance))
  return egalEnTempsConstant(signature, attendue)
}

/** Compare deux mots de passe sans fuite de durée : on compare leurs empreintes. */
export async function motDePasseValide(secret: string, saisi: string, attendu: string): Promise<boolean> {
  const [a, b] = await Promise.all([hmacHex(secret, `mdp:${saisi}`), hmacHex(secret, `mdp:${attendu}`)])
  return egalEnTempsConstant(a, b)
}

/** Compare deux secrets sans fuite de durée. Deux chaînes vides ne sont jamais égales. */
export async function chainesEgales(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false
  const [x, y] = await Promise.all([hmacHex('comparaison', a), hmacHex('comparaison', b)])
  return egalEnTempsConstant(x, y)
}

export function lireCookie(requete: Request, nom: string): string | null {
  const enTete = requete.headers.get('Cookie')
  if (!enTete) return null
  for (const morceau of enTete.split(';')) {
    const [cle, ...reste] = morceau.trim().split('=')
    if (cle === nom) return reste.join('=')
  }
  return null
}

export function enTeteCookie(valeur: string, dureeS: number): string {
  return `${NOM_COOKIE}=${valeur}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${dureeS}`
}

/** Renvoie `null` si la requête porte une session admin valide, sinon la réponse de refus. */
export async function exigerAdmin(
  requete: Request, env: { SESSION_SECRET: string; ADMIN_PASSWORD: string }, maintenantMs: number = Date.now(),
): Promise<Response | null> {
  if (!env.SESSION_SECRET || !env.ADMIN_PASSWORD) {
    return erreur('ADMIN_PASSWORD ou SESSION_SECRET non configuré.', 500)
  }
  const valide = await sessionValide(
    env.SESSION_SECRET, env.ADMIN_PASSWORD, lireCookie(requete, NOM_COOKIE), maintenantMs,
  )
  return valide ? null : erreur('Authentification requise.', 401)
}
