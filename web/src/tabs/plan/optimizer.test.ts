import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Hex, Params, Site } from '@/lib/types'
import { allocate, baselines, lowIncomeThreshold, pareto, prepare, type OptInput } from './optimizer'

const hex = (h3: string, over: Partial<Hex>): Hex => ({
  h3, nb: 'A', canopy: 0.2, imperv: 0.5, bldg: 0.2, road: 0.1, heat: 92, heatAnom: 0, heatPred: 92,
  heatResid: 0, spill: 0, income: 50000, poverty: 0.2, poc: 0.5, asthma: 10, svi: 0.5, holc: null,
  pop: 100, vulnEq: 0.2, vulnHealth: 0.2, flood: false, cap: 3, gains: [0.1, 0.08, 0.06], shap: [],
  ...over,
})
// Default sites are small (1 crown unit) with survival 1, so one tree = one gain entry.
const sitesFor = (h3: string, n: number, nb = 'A', cost = 1000, util = false, over: Partial<Site> = {}): Site[] =>
  Array.from({ length: n }, (_, k) => ({
    id: `${h3}-${k}`, lng: -76.6, lat: 39.3, h3, type: 'pit', cost, util, width: 5, space: 'Tree Lawn', nb,
    species: 'Redbud', size: 'small', crown: 1, surv: 1, ...over,
  }))
const TB = { small: { co2LbYr: 1, stormGalYr: 1, usdYr: 1 }, medium: { co2LbYr: 2, stormGalYr: 2, usdYr: 2 }, large: { co2LbYr: 3, stormGalYr: 3, usdYr: 3 } }

// 5-hex fixture: h1 has the highest gains; h4/h5 are low-income; h5 is in neighborhood "B".
const hexes: Hex[] = [
  hex('h1', { gains: [0.5, 0.4, 0.3] }),
  hex('h2', { gains: [0.2, 0.1, 0.05] }),
  hex('h3', { gains: [0.05, 0.04, 0.03], canopy: 0.05 }),
  hex('h4', { gains: [0.15, 0.1, 0.05], vulnEq: 0.8, income: 25000, holc: 'D' }),
  hex('h5', { gains: [0.12, 0.1, 0.08], vulnEq: 0.9, income: 25000, nb: 'B', cap: 2 }),
]
const sites: Site[] = [
  ...sitesFor('h1', 3), ...sitesFor('h2', 3), ...sitesFor('h3', 3), ...sitesFor('h4', 3), ...sitesFor('h5', 2, 'B'),
]
sites[1] = { ...sites[1], util: true }
const input: OptInput = {
  hexes, sites,
  treeBenefits: TB,
  nbTes: { A: 80, B: 40 },
}
const P = prepare(input)
const base: Params = { budget: 5000, weights: { heat: 1, equity: 0, health: 0, eco: 0 }, equityQuota: 0, excludeNbs: [], avoidUtilities: false, years: 20 }

describe('lowIncomeThreshold', () => {
  it('is the resident-weighted median income', () => {
    expect(lowIncomeThreshold(hexes)).toBe(50000)
    expect(Array.from(P.lowIncome)).toEqual([0, 0, 0, 1, 1])
    // weighting: one crowded poor hex outweighs two sparse rich ones
    const w = [hex('a', { income: 20000, pop: 300 }), hex('b', { income: 90000, pop: 50 }), hex('c', { income: 80000, pop: 50 })]
    expect(lowIncomeThreshold(w)).toBe(20000)
  })

  it('ignores hexes without income or residents', () => {
    expect(lowIncomeThreshold([hex('a', { income: null }), hex('b', { income: 40000, pop: 0 }), hex('c', { income: 60000 })])).toBe(60000)
  })
})

describe('allocate', () => {
  it('never exceeds the budget', () => {
    for (const budget of [0, 999, 1000, 3500, 7000, 1e9]) {
      expect(allocate(P, { ...base, budget }).impact.spent).toBeLessThanOrEqual(budget)
    }
  })

  it('never exceeds a hex cap', () => {
    const r = allocate(P, { ...base, budget: 1e9 })
    for (const h of hexes) expect(r.perHex[h.h3] ?? 0).toBeLessThanOrEqual(h.cap)
    expect(r.impact.trees).toBe(14)
  })

  it('picks the highest-gain hex first', () => {
    const r = allocate(P, { ...base, budget: 1000 })
    expect(r.siteIds).toEqual(['h1-0'])
    expect(allocate(P, { ...base, budget: 3000 }).siteIds).toEqual(['h1-0', 'h1-1', 'h1-2'])
  })

  it('satisfies the equity quota', () => {
    const r = allocate(P, { ...base, budget: 6000, equityQuota: 0.5 })
    const low = r.siteIds.filter((id) => id.startsWith('h4') || id.startsWith('h5')).length
    expect(low / r.impact.trees).toBeGreaterThanOrEqual(0.5)
  })

  it('gives excluded neighborhoods zero trees', () => {
    const r = allocate(P, { ...base, budget: 1e9, excludeNbs: ['B'] })
    expect(r.perHex.h5 ?? 0).toBe(0)
  })

  it('avoids utility sites when asked', () => {
    const r = allocate(P, { ...base, budget: 1e9, avoidUtilities: true })
    expect(r.siteIds).not.toContain('h1-1')
  })

  it('is deterministic', () => {
    const p = { ...base, budget: 6000, weights: { heat: 0.6, equity: 0.6, health: 0.6, eco: 0.3 } }
    expect(allocate(P, p)).toEqual(allocate(P, p))
    expect(baselines(P, p)).toEqual(baselines(P, p))
  })
})

describe('crown units, survival and weights', () => {
  const plan = (hs: Hex[], ss: Site[], p: Partial<Params>) =>
    allocate(prepare({ hexes: hs, sites: ss, treeBenefits: TB }), { ...base, ...p })

  it('a large tree uses 3 gain entries and a small tree 1', () => {
    const h = hex('x', { gains: [0.4, 0.3, 0.2, 0.1], cap: 2 })
    const big = plan([h], sitesFor('x', 1, 'A', 1000, false, { size: 'large', crown: 3 }), { budget: 1000 })
    expect(big.impact.coolingPersonF).toBeCloseTo((0.4 + 0.3 + 0.2) * 100)
    const two = plan([h], [...sitesFor('x', 1, 'A', 1000, false, { size: 'large', crown: 3 }),
      { ...sitesFor('x', 1)[0], id: 'x-s' }], { budget: 2000 })
    expect(two.impact.coolingPersonF).toBeCloseTo((0.4 + 0.3 + 0.2 + 0.1) * 100) // second tree takes unit 4
  })

  it('crown units past the end of gains count as zero', () => {
    const h = hex('x', { gains: [0.4], cap: 1 })
    const r = plan([h], sitesFor('x', 1, 'A', 1000, false, { size: 'large', crown: 3 }), { budget: 1000 })
    expect(r.impact.coolingPersonF).toBeCloseTo(40)
  })

  it('lower survival lowers a site\'s rank and its expected benefit', () => {
    const hs = [hex('a', { gains: [0.3] , cap: 1 }), hex('b', { gains: [0.3], cap: 1 })]
    const ss = [...sitesFor('a', 1, 'A', 1000, false, { surv: 0.5 }), ...sitesFor('b', 1, 'A', 1000, false, { surv: 0.9 })]
    const r = plan(hs, ss, { budget: 1000 })
    expect(r.siteIds).toEqual(['b-0'])
    expect(r.impact.expectedSurviving).toBeCloseTo(0.9)
    expect(r.impact.coolingPersonF).toBeCloseTo(0.9 * 30)
  })

  it('ranks by residents', () => {
    const hs = [hex('a', { pop: 100 }), hex('b', { pop: 160 })]
    const r = plan(hs, [...sitesFor('a', 3), ...sitesFor('b', 3)], { budget: 1000 })
    expect(r.siteIds).toEqual(['b-0'])
    expect(r.impact.residents).toBe(160)
  })

  it('takes the next affordable site in a hex when the best one does not fit', () => {
    const h = hex('x', { gains: [0.3, 0.2, 0.1], cap: 2 })
    const ss = [...sitesFor('x', 1, 'A', 2000, false, { type: 'potential', size: 'large', crown: 3, id: 'x-big' }),
      ...sitesFor('x', 1, 'A', 1000, false, { id: 'x-small' })]
    expect(plan([h], ss, { budget: 1000 }).siteIds).toEqual(['x-small'])
  })

  it('equity weight moves trees; with Heat only, vulnEq changes nothing', () => {
    const mk = (v: number) => [hex('a', { gains: [0.3, 0.2, 0.1] }), hex('b', { gains: [0.25, 0.2, 0.1], vulnEq: v })]
    const ss = [...sitesFor('a', 3), ...sitesFor('b', 3)]
    expect(plan(mk(0.9), ss, { budget: 1000 }).siteIds).toEqual(plan(mk(0.1), ss, { budget: 1000 }).siteIds)
    expect(plan(mk(0.1), ss, { budget: 1000 }).siteIds).toEqual(['a-0'])
    const eq = { heat: 1, equity: 1, health: 0, eco: 0 }
    expect(plan(mk(0.9), ss, { budget: 1000, weights: eq }).siteIds).toEqual(['b-0'])
  })

  it('scaling all weights by a constant gives an identical plan', () => {
    const w = { heat: 0.6, equity: 0.4, health: 0.2, eco: 0.3 }
    const half = { heat: 0.3, equity: 0.2, health: 0.1, eco: 0.15 }
    expect(allocate(P, { ...base, budget: 6000, weights: half }).siteIds)
      .toEqual(allocate(P, { ...base, budget: 6000, weights: w }).siteIds)
  })

  it('eco credit favors larger trees when cooling is equal', () => {
    const hs = [hex('a', { gains: [0, 0, 0] }), hex('b', { gains: [0, 0, 0] })]
    const ss = [...sitesFor('a', 1), ...sitesFor('b', 1, 'A', 1000, false, { size: 'large', crown: 3 })]
    expect(plan(hs, ss, { budget: 1000, weights: { heat: 0, equity: 0, health: 0, eco: 1 } }).siteIds).toEqual(['b-0'])
  })
})

describe('large hexes', () => {
  it('plants every site in a hex with more than 32 sites, each once', () => {
    const h = hex('big', { cap: 45, gains: Array.from({ length: 135 }, (_, k) => 0.5 * 0.99 ** k) })
    const r = allocate(prepare({ hexes: [h], sites: sitesFor('big', 45), treeBenefits: TB }), { ...base, budget: 1e9 })
    expect(r.impact.trees).toBe(45)
    expect(new Set(r.siteIds).size).toBe(45)
  })
})

describe('pareto and baselines', () => {
  it('pareto sweeps quota 0..1 in 21 steps', () => {
    const pts = pareto(P, { ...base, budget: 6000 })
    expect(pts).toHaveLength(21)
    expect(pts[0].quota).toBe(0)
    expect(pts[20].quota).toBe(1)
    expect(pts[20].shareLowIncome).toBeGreaterThanOrEqual(pts[0].shareLowIncome)
  })

  it('baselines respect the budget and include TES', () => {
    const b = baselines(P, { ...base, budget: 4000 })
    expect(b.random.impact.spent).toBeLessThanOrEqual(4000)
    expect(b.lowestCanopy.siteIds[0]).toBe('h3-0')
    expect(b.tes?.siteIds[0]).toBe('h5-0')
  })

  it('optimized plan cools at least as much as the baselines', () => {
    const p = { ...base, budget: 5000 }
    const r = allocate(P, p).impact.coolingPersonF
    const b = baselines(P, p)
    expect(r).toBeGreaterThanOrEqual(b.random.impact.coolingPersonF)
    expect(r).toBeGreaterThanOrEqual(b.lowestCanopy.impact.coolingPersonF)
  })
})

describe('runtime on shipped data', () => {
  it('allocates in under 50 ms', () => {
    const dir = resolve(import.meta.dirname, '../../../public/data')
    const load = (f: string) => JSON.parse(readFileSync(resolve(dir, f), 'utf8'))
    const stats = load('stats.json')
    const Q = prepare({ hexes: load('hexes.json'), sites: load('sites.json'), treeBenefits: stats.treeBenefits })
    const p: Params = { ...base, budget: 2_000_000, weights: { heat: 0.6, equity: 0.6, health: 0.6, eco: 0.3 } }
    allocate(Q, p) // warm up
    const t0 = performance.now()
    const r = allocate(Q, p)
    const ms = performance.now() - t0
    console.log(`allocate: ${r.impact.trees} trees in ${ms.toFixed(1)} ms (${Q.hexes.length} hexes${stats.mock ? ', mock data' : ''})`)
    expect(ms).toBeLessThan(50)
  })
})
