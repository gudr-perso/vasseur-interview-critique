import { describe, expect, it } from 'vitest'

describe('outillage', () => {
  it('dispose de WebCrypto', () => {
    expect(typeof crypto.subtle.sign).toBe('function')
  })
})
