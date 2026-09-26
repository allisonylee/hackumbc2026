import { describe, expect, it } from 'vitest'
import { fuzzyScore } from './fuzzy'

describe('fuzzyScore', () => {
  it('ranks prefix > word start > substring > subsequence > miss', () => {
    const prefix = fuzzyScore('Roland Park', 'rol')
    const word = fuzzyScore('Roland Park', 'park')
    const sub = fuzzyScore('Roland Park', 'lan')
    const seq = fuzzyScore('Roland Park', 'rlpk')
    expect(prefix).toBe(1)
    expect(word).toBeGreaterThan(sub)
    expect(sub).toBeGreaterThan(seq)
    expect(seq).toBeGreaterThan(0)
    expect(fuzzyScore('Roland Park', 'xyz')).toBe(0)
  })
  it('is case-insensitive and matches everything on empty query', () => {
    expect(fuzzyScore('Downtown', 'DOWN')).toBe(1)
    expect(fuzzyScore('Downtown', '  ')).toBe(1)
  })
})
