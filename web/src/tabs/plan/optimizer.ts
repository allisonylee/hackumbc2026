// Budget-constrained tree allocation (implementation_plan.md §8.1). Pure functions; runs in a Web Worker.
//
// Each hex h has marginal ML cooling gains[k] (°F) for its k-th tree, non-increasing in k, and a list of
// candidate sites sorted cheapest first. The value per dollar of the k-th tree is therefore non-increasing
// within a hex, so a heap holding each hex's next tree gives the exact greedy order without re-checks.
import type { Baselines, Hex, Impact, Params, ParetoPoint, Result, Site, Species, TreeBenefit } from '@/lib/types'
import { MaxHeap } from './heap'

/** Eco co-benefit of one (medium) tree, on the same 0–1 scale as the best single tree's cooling. */
export const ECO_PER_TREE_NORM = 0.2
/** Fraction of 20-year benefits delivered at each maturity horizon. */
export const MATURITY: Record<Params['years'], number> = { 0: 0.15, 10: 0.5, 20: 1.0 }
export const LOW_INCOME_VULN = 0.5

export type OptInput = {
  hexes: Hex[]
  sites: Site[]
  species: Pick<Species, 'name' | 'size'>[]
  treeBenefits: Record<'small' | 'medium' | 'large', TreeBenefit>
  /** neighborhood → Tree Equity Score (0–100), optional; enables the TES baseline */
  nbTes?: Record<string, number>
}

export type Prepared = {
  hexes: Hex[]
  index: Map<string, number>
  /** sites per hex index, cheapest first */
  sites: Site[][]
  maxHeatVal: number
  sizeOf: Map<string, 'small' | 'medium' | 'large'>
  treeBenefits: OptInput['treeBenefits']
  nbTes?: Record<string, number>
}

export function prepare(input: OptInput): Prepared {
  const idx = new Map(input.hexes.map((h, i) => [h.h3, i]))
  const sites: Site[][] = input.hexes.map(() => [])
  for (const s of input.sites) {
    const i = idx.get(s.h3)
    if (i !== undefined) sites[i].push(s)
  }
  for (const l of sites) l.sort((a, b) => a.cost - b.cost)
  let maxHeatVal = 0
  input.hexes.forEach((h) => {
    if (h.cap > 0 && h.gains.length) maxHeatVal = Math.max(maxHeatVal, h.gains[0] * h.pop + h.spill)
  })
  return {
    hexes: input.hexes,
    index: idx,
    sites,
    maxHeatVal: maxHeatVal || 1,
    sizeOf: new Map(input.species.map((s) => [s.name, s.size])),
    treeBenefits: input.treeBenefits,
    nbTes: input.nbTes,
  }
}

type Eligible = { lists: Site[][]; caps: Int32Array }

function eligible(P: Prepared, p: Params): Eligible {
  const excl = new Set(p.excludeNbs)
  const caps = new Int32Array(P.hexes.length)
  const lists = P.hexes.map((h, i) => {
    if (excl.has(h.nb)) return []
    const l = p.avoidUtilities ? P.sites[i].filter((s) => !s.util) : P.sites[i]
    caps[i] = Math.min(l.length, h.cap, h.gains.length)
    return l
  })
  return { lists, caps }
}

/** Person-°F of cooling from the k-th tree in hex h (own hex + neighbor spillover). */
const benefit = (h: Hex, k: number) => h.gains[k] * h.pop + h.spill

function value(P: Prepared, h: Hex, k: number, w: Params['weights']) {
  const cool = benefit(h, k) / P.maxHeatVal
  return cool * (w.heat + w.equity * h.vulnEq + w.health * h.vulnHealth) + w.eco * ECO_PER_TREE_NORM
}

/** Greedy over `hexIdx`, continuing from `counts`. Mutates counts/picked; returns dollars spent. */
function greedy(P: Prepared, E: Eligible, p: Params, hexIdx: number[], budget: number, counts: Int32Array, picked: Site[]) {
  const heap = new MaxHeap()
  const ratio = (i: number) => value(P, P.hexes[i], counts[i], p.weights) / E.lists[i][counts[i]].cost
  for (const i of hexIdx) if (counts[i] < E.caps[i]) heap.push(ratio(i), i)
  let spent = 0
  while (heap.size) {
    const i = heap.pop()
    const site = E.lists[i][counts[i]]
    if (spent + site.cost > budget) continue // later sites in this hex cost at least as much: drop the hex
    spent += site.cost
    picked.push(site)
    counts[i]++
    if (counts[i] < E.caps[i]) heap.push(ratio(i), i)
  }
  return spent
}

function impactOf(P: Prepared, p: Params, picked: Site[]): Result {
  const hexIndex = P.index
  const perHex: Record<string, number> = {}
  let spent = 0, cooling = 0, lowInc = 0, holcCD = 0, co2 = 0, storm = 0, usd = 0, surviving = 0
  const m = MATURITY[p.years]
  for (const s of picked) {
    const h = P.hexes[hexIndex.get(s.h3)!]
    const k = perHex[s.h3] ?? 0
    perHex[s.h3] = k + 1
    const b = benefit(h, k)
    spent += s.cost
    surviving += s.surv
    cooling += b
    if (h.vulnEq >= LOW_INCOME_VULN) lowInc += b
    if (h.holc === 'C' || h.holc === 'D') holcCD++
    const tb = P.treeBenefits[P.sizeOf.get(s.species) ?? 'medium']
    co2 += tb.co2LbYr * m
    storm += tb.stormGalYr * m
    usd += tb.usdYr * m
  }
  let residents = 0, people = 0, fSum = 0
  const targeted = Object.keys(perHex)
  for (const id of targeted) {
    const h = P.hexes[hexIndex.get(id)!]
    residents += h.pop
    people += h.people
    let f = 0
    for (let k = 0; k < perHex[id]; k++) f += h.gains[k]
    fSum += f
  }
  const impact: Impact = {
    trees: picked.length,
    expectedSurviving: surviving,
    spent,
    coolingPersonF: cooling,
    avgFTargeted: targeted.length ? fSum / targeted.length : 0,
    residents,
    peopleExposed: people,
    shareLowIncome: cooling > 0 ? lowInc / cooling : 0,
    shareHolcCD: picked.length ? holcCD / picked.length : 0,
    co2LbYr: co2,
    stormGalYr: storm,
    benefitUsdYr: usd,
  }
  return { siteIds: picked.map((s) => s.id), perHex, impact }
}

export function allocate(P: Prepared, p: Params): Result {
  const E = eligible(P, p)
  const counts = new Int32Array(P.hexes.length)
  const picked: Site[] = []
  const all = P.hexes.map((_, i) => i)
  let spent = 0
  if (p.equityQuota > 0) {
    const low = all.filter((i) => P.hexes[i].vulnEq >= LOW_INCOME_VULN)
    spent = greedy(P, E, p, low, p.budget * Math.min(1, p.equityQuota), counts, picked)
  }
  greedy(P, E, p, all, p.budget - spent, counts, picked)
  return impactOf(P, p, picked)
}

export function pareto(P: Prepared, p: Params, steps = 21): ParetoPoint[] {
  const out: ParetoPoint[] = []
  for (let i = 0; i < steps; i++) {
    const quota = steps === 1 ? 0 : i / (steps - 1)
    const r = allocate(P, { ...p, equityQuota: quota })
    out.push({ quota, cooling: r.impact.coolingPersonF, shareLowIncome: r.impact.shareLowIncome })
  }
  return out
}

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fill hexes in the given order, cheapest sites first, skipping sites that don't fit. */
function fillInOrder(E: Eligible, order: number[], budget: number) {
  const picked: Site[] = []
  let spent = 0
  for (const i of order) {
    for (let k = 0; k < E.caps[i]; k++) {
      const s = E.lists[i][k]
      if (spent + s.cost > budget) break
      spent += s.cost
      picked.push(s)
    }
  }
  return picked
}

export function baselines(P: Prepared, p: Params, seed = 42): Baselines {
  const E = eligible(P, p)
  // Random: shuffle every eligible site, take while the budget allows.
  const pool: Site[] = []
  E.lists.forEach((l, i) => { for (let k = 0; k < E.caps[i]; k++) pool.push(l[k]) })
  const rand = rng(seed)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const randomPicked: Site[] = []
  let spent = 0
  for (const s of pool) {
    if (spent + s.cost > p.budget) continue
    spent += s.cost
    randomPicked.push(s)
  }

  const withSites = P.hexes.map((_, i) => i).filter((i) => E.caps[i] > 0)
  const byCanopy = [...withSites].sort((a, b) => P.hexes[a].canopy - P.hexes[b].canopy || a - b)
  const out: Baselines = {
    random: impactOf(P, p, randomPicked),
    lowestCanopy: impactOf(P, p, fillInOrder(E, byCanopy, p.budget)),
  }
  if (P.nbTes && Object.keys(P.nbTes).length) {
    const tes = (i: number) => P.nbTes![P.hexes[i].nb] ?? 100
    const byTes = [...withSites].sort((a, b) => tes(a) - tes(b) || P.hexes[a].canopy - P.hexes[b].canopy || a - b)
    out.tes = impactOf(P, p, fillInOrder(E, byTes, p.budget))
  }
  return out
}
