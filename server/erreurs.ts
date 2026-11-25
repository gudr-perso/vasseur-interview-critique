/** Erreur dont le message peut être montré tel quel à l'utilisateur (admin ou Claude). */
export class ErreurMetier extends Error {
  constructor(message: string, readonly statut: 400 | 404 | 409 | 410 | 413 | 429 = 400) {
    super(message)
    this.name = 'ErreurMetier'
  }
}
