import { describe, expect, it } from 'vitest'
import { dollars } from '../../src/admin/montants'

const net = (s: string) => s.replace(/[  ]/g, ' ')

describe('dollars', () => {
  it('écrit zéro sans décimale', () => {
    expect(dollars(0)).toBe('0 $')
  })

  it('garde trois chiffres significatifs au plus sous 1 $', () => {
    expect(net(dollars(42_000))).toBe('0,042 $')
    expect(net(dollars(3_100))).toBe('0,0031 $')
    expect(net(dollars(123_456))).toBe('0,123 $')
    expect(net(dollars(999_999))).toBe('1,00 $')
  })

  it('donne deux décimales à partir de 1 $', () => {
    expect(net(dollars(1_000_000))).toBe('1,00 $')
    expect(net(dollars(12_340_000))).toBe('12,34 $')
    expect(net(dollars(1_234_500_000))).toBe('1 234,50 $')
  })
})
