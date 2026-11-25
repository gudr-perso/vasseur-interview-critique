// 32 caractères, sans I, O, 0, 1 : lisibles dans une URL dictée ou recopiée.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function nouvelId(): string {
  return crypto.randomUUID()
}

/** Code d'URL d'un questionnaire : 10 caractères, soit 50 bits d'aléa. */
export function nouveauCode(): string {
  const octets = crypto.getRandomValues(new Uint8Array(10))
  // 256 est un multiple de 32 : le modulo ne biaise pas le tirage.
  return [...octets].map(o => ALPHABET[o % 32]).join('')
}

export function maintenantIso(): string {
  return new Date().toISOString()
}

/** Jeton d'accès d'un répondant : 128 bits d'aléa, 22 caractères base64url. */
export function nouveauJeton(): string {
  const octets = crypto.getRandomValues(new Uint8Array(16))
  let binaire = ''
  for (const octet of octets) binaire += String.fromCharCode(octet)
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
