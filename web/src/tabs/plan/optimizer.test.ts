import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Hex, Params, Site } from '@/lib/types'
import { allocate, baselines, pareto, prepare, type OptInput } from './optimizer'

const hex = (h3: string, over: Partial<Hex>): Hex => ({
  h3, nb: 'A', canopy: 0.2, imperv: 0.5, bldg: 0.2, road: 0.1, heat: 92, heatAnom: 0, heatPred: 92,
  heatResid: 0, spill: 0, income: 50000, poverty: 0.2, poc: 0.5, asthma: 10, svi: 0.5, holc: null,
  pop: 100, vulnEq: 0.2, vulnHealth: 0.2, flood: false, cap: 3, gains: [0.1, 0.08, 0.06], shap: [],
  ...over,
})
const sitesFor = (h3: string, n: number, nb = 'A', cost = 1000, util = false): Site[] =>
  Array.from({ length: n }, (_, k) => ({
    id: `${h3}-${k}`, lng: -76.6, lat: 39.3, h3, type: 'pit', cost, util, width: 5, space: 'Tree Lawn', nb, species: 'Oak',
  }))

// 5-hex fixture: h1 has the highest gains; h4/h5 are low-income; h5 is in neighborhood "B".
const hexes: Hex[] = [
  hex('h1', { gains: [0.5, 0.4, 0.3] }),
  hex('h2', { gains: [0.2, 0.1, 0.05] }),
  hex('h3', { gains: [0.05, 0.04, 0.03], canopy: 0.05 }),
  hex('h4', { gains: [0.15, 0.1, 0.05], vulnEq: 0.8, holc: 'D' }),
  hex('h5', { gains: [0.12, 0.1, 0.08], vulnEq: 0.9, nb: 'B', cap: 2 }),
]
const sites: Site[] = [
  ...sitesFor('h1', 3), ...sitesFor('h2', 3), ...sitesFor('h3', 3), ...sitesFor('h4', 3), ...sitesFor('h5', 2, 'B'),
]
sites[1] = { ...sites[1], util: true }
const input: OptInput = {
  hexes, sites,
  species: [{ name: 'Oak', size: 'large' }],
  treeBenefits: { small: { co2LbYr: 1, stormGalYr: 1, usdYr: 1 }, medium: { co2LbYr: 2, stormGalYr: 2, usdYr: 2 }, large: { co2LbYr: 3, stormGalYr: 3, usdYr: 3 } },
  nbTes: { A: 80, B: 40 },
}
const P = prepare(input)
const base: Params = { budget: 5000, weights: { heat: 1, equity: 0, health: 0, eco: 0 }, equityQuota: 0, excludeNbs: [], avoidUtilities: false, years: 20 }

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
    const Q = prepare({ hexes: load('hexes.json'), sites: load('sites.json'), species: load('species.json'), treeBenefits: stats.treeBenefits })
    const p: Params = { ...base, budget: 2_000_000, weights: { heat: 0.6, equity: 0.6, health: 0.6, eco: 0.3 } }
    allocate(Q, p) // warm up
    const t0 = performance.now()
    const r = allocate(Q, p)
    const ms = performance.now() - t0
    console.log(`allocate: ${r.impact.trees} trees in ${ms.toFixed(1)} ms (${Q.hexes.length} hexes${stats.mock ? ', mock data' : ''})`)
    expect(ms).toBeLessThan(50)
  })
})
