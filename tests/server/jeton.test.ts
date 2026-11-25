import { describe, expect, it } from 'vitest'
import { nouveauJeton } from '../../server/ids'

describe('nouveauJeton', () => {
  it('produit 22 caractères base64url, tous différents', () => {
    const jetons = Array.from({ length: 500 }, nouveauJeton)
    for (const jeton of jetons) expect(jeton).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(new Set(jetons).size).toBe(500)
  })
})
