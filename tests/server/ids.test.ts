import { describe, expect, it } from 'vitest'
import { maintenantIso, nouveauCode, nouvelId } from '../../server/ids'

describe('identifiants', () => {
  it('produit des identifiants uniques', () => {
    expect(nouvelId()).not.toBe(nouvelId())
  })

  it('produit des codes de 10 caractères sans caractères ambigus', () => {
    const codes = Array.from({ length: 200 }, nouveauCode)
    for (const code of codes) expect(code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/)
    expect(new Set(codes).size).toBe(200)
  })

  it('horodate en ISO 8601 UTC', () => {
    expect(maintenantIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})
