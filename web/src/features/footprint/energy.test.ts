import { describe, expect, it } from 'vitest'
import { fmtDuration, fmtWh, fmtWhShort, optimizerWh } from './energy'

describe('energy formatting', () => {
  it('fmtWh picks a readable unit', () => {
    expect(fmtWh(12)).toBe('12 Wh')
    expect(fmtWh(0.4)).toBe('0.4 Wh')
    expect(fmtWh(0.021)).toBe('21 mWh')
    expect(fmtWh(0.000208)).toBe('208 µWh')
    expect(fmtWh(1500)).toBe('1.5 kWh')
    expect(fmtWh(0)).toBe('0 Wh')
  })
  it('fmtWhShort stays in Wh', () => {
    expect(fmtWhShort(0.0213)).toBe('0.021 Wh')
    expect(fmtWhShort(0.0004)).toBe('<0.001 Wh')
  })
  it('optimizerWh converts ms × W to Wh', () => {
    expect(optimizerWh(3600_000, 1)).toBeCloseTo(1)
    expect(optimizerWh(50, 15)).toBeCloseTo(0.000208, 6)
  })
  it('fmtDuration', () => {
    expect(fmtDuration(0.5)).toBe('30 seconds')
    expect(fmtDuration(2.1)).toBe('2 minutes')
    expect(fmtDuration(180)).toBe('3.0 hours')
    expect(fmtDuration(60 * 24 * 3)).toBe('3 days')
  })
})
