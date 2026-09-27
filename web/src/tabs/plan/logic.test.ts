import { describe, expect, it } from 'vitest'
import type { Impact, Site } from '@/lib/types'
import {
  BUDGET_MAX, BUDGET_MIN, MAX_DELAY_MS, SLIDER_STEPS, STAGGER_LIMIT, bboxOf, bestPerColumn, budgetToSlider, computeBirths,
  matchPreset, perturbedWeights, robustIds, sitesToCsv, sitesToGeoJson,
  sliderToBudget, sproutScale, PRESETS,
} from './logic'

describe('budget slider', () => {
  it('maps the ends and round-trips', () => {
    expect(sliderToBudget(0)).toBeCloseTo(BUDGET_MIN)
    expect(sliderToBudget(SLIDER_STEPS)).toBeCloseTo(BUDGET_MAX)
    for (const b of [25_000, 250_000, 1_000_000, 7_300_000]) expect(sliderToBudget(budgetToSlider(b))).toBeCloseTo(b, 3)
  })
  it('clamps', () => {
    expect(budgetToSlider(1)).toBe(0)
    expect(budgetToSlider(1e9)).toBeCloseTo(SLIDER_STEPS)
  })
})

describe('presets', () => {
  it('recognizes each preset and nothing else', () => {
    for (const p of PRESETS) expect(matchPreset(p.weights)).toBe(p.id)
    expect(matchPreset({ heat: 0.5, equity: 0.5, health: 0.5, eco: 0.5 })).toBe('')
  })
})

describe('sprout births', () => {
  it('staggers a new plan by rank, capped', () => {
    const ids = Array.from({ length: 1000 }, (_, i) => `s${i}`)
    const { births, lastBirth, added } = computeBirths(new Map(), ids, 100)
    expect(added).toBe(1000)
    expect(births.get('s0')).toBe(100)
    expect(births.get('s10')).toBe(130)
    expect(births.get('s999')).toBe(100 + MAX_DELAY_MS)
    expect(lastBirth).toBe(100 + MAX_DELAY_MS)
  })
  it('keeps births of sites already planted', () => {
    const prev = new Map([['a', 5]])
    const { births, added } = computeBirths(prev, ['b', 'a', 'c'], 100)
    expect(births.get('a')).toBe(5)
    expect(births.get('b')).toBe(100)
    expect(births.get('c')).toBe(103)
    expect(added).toBe(2)
  })
  it('skips the stagger for very large plans', () => {
    const ids = Array.from({ length: STAGGER_LIMIT + 1 }, (_, i) => `s${i}`)
    const { births } = computeBirths(new Map(), ids, 50)
    expect(births.get(`s${STAGGER_LIMIT}`)).toBe(50)
  })
  it('scale goes 0 → overshoot → 1', () => {
    expect(sproutScale(-1)).toBe(0)
    expect(sproutScale(0)).toBe(0)
    expect(sproutScale(1e6)).toBe(1)
    const mid = [50, 150, 300, 400].map(sproutScale)
    expect(Math.max(...mid)).toBeGreaterThan(1)
  })
})


describe('bestPerColumn', () => {
  const imp = (c: number, s: number): Impact => ({
    trees: 1, spent: 1, coolingPersonF: c, avgFTargeted: c / 10, residents: 1, shareLowIncome: s, shareHolcCD: s,
    co2LbYr: 0, stormGalYr: 0, benefitUsdYr: 0,
  })
  it('finds the max per column', () => {
    const best = bestPerColumn([
      { id: 'plan', label: 'Plan', impact: imp(10, 0.3) },
      { id: 'random', label: 'Random', impact: imp(4, 0.5) },
    ])
    expect(best.coolingPersonF).toBe('plan')
    expect(best.shareLowIncome).toBe('random')
  })
})

describe('export', () => {
  const sites: Site[] = [
    { id: '1', lng: -76.6, lat: 39.3, h3: 'x', type: 'pit', cost: 1000, util: false, width: 4, space: 'Tree Lawn', nb: 'Mount Vernon', species: 'Oak' },
    { id: '2', lng: -76.61, lat: 39.31, h3: 'x', type: 'potential', cost: 2000, util: true, width: null, space: null, nb: 'Harlem Park, "West"', species: 'Elm' },
  ]
  it('writes CSV with a header, rank order and escaping', () => {
    const lines = sitesToCsv(sites).trim().split('\n')
    expect(lines[0]).toBe('rank,id,lat,lng,neighborhood,space,species,cost')
    expect(lines[1]).toBe('1,1,39.3,-76.6,Mount Vernon,Tree Lawn,Oak,1000')
    expect(lines[2]).toBe('2,2,39.31,-76.61,"Harlem Park, ""West""",,Elm,2000')
  })
  it('writes GeoJSON points in [lng, lat]', () => {
    const g = sitesToGeoJson(sites)
    expect(g.features).toHaveLength(2)
    expect(g.features[0].geometry.coordinates).toEqual([-76.6, 39.3])
    expect(g.features[1].properties.rank).toBe(2)
  })
})

describe('robust picks', () => {
  it('perturbs deterministically within the spread', () => {
    const w = { heat: 1, equity: 0.5, health: 0, eco: 0.2 }
    const a = perturbedWeights(w, 20, 0.3, 1)
    expect(a).toEqual(perturbedWeights(w, 20, 0.3, 1))
    for (const x of a) {
      expect(x.heat).toBeGreaterThanOrEqual(0.7)
      expect(x.heat).toBeLessThanOrEqual(1.3)
      expect(x.health).toBe(0)
    }
  })
  it('keeps ids picked in ≥ 80% of runs', () => {
    const runs = [['a', 'b'], ['a', 'b'], ['a', 'c', 'b'], ['a', 'b'], ['a', 'c']]
    expect([...robustIds(runs)].sort()).toEqual(['a', 'b'])
    expect([...robustIds(runs, 1)]).toEqual(['a'])
  })
})

describe('bboxOf', () => {
  it('handles multipolygons', () => {
    expect(bboxOf({ type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 2], [0, 0]]], [[[-1, 5], [3, 1], [-1, 5]]]] })).toEqual([[-1, 0], [3, 5]])
  })
})
