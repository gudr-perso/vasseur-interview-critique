import { describe, expect, it } from 'vitest'
import { reponseEnTexte as partagee } from '../../shared/repondants'
import { reponseEnTexte as serveur } from '../../server/services/reponses'

describe('reponseEnTexte', () => {
  it("est la même fonction pour le serveur et pour l'admin", () => {
    expect(serveur).toBe(partagee)
  })
})
