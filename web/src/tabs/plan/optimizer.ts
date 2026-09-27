// Budget-constrained tree allocation (implementation_plan.md §8.1). Pure functions; runs in a Web Worker.
//
// Each hex h has marginal ML cooling gains[u] (°F) for its u-th crown unit (25 m²) of new canopy,
// non-increasing in u, and candidate sites in pipeline order (crown × surv / cost, descending). The k-th tree
// in a hex takes the next `crown` gain entries (small 1, medium 2, large 3). A site's value is its expected
// (survival-weighted) cooling for the hex's residents, scaled by the priority multiplier, plus a
// size-dependent eco credit. A heap holds each hex's next affordable site; the best value per dollar is bought
// until the budget runs out.
import type { Baselines, Hex, Impact, Params, ParetoPoint, Result, Site, TreeBenefit } from '@/lib/types'
import { MaxHeap } from './heap'

type Size = Site['size']

/** Eco co-benefit of one medium tree, on the same scale as the best crown unit's cooling (= 1). */
export const ECO_MEDIUM_NORM = 0.4
/** Fraction of 20-year benefits delivered at each maturity horizon. */
export const MATURITY: Record<Params['years'], number> = { 0: 0.15, 10: 0.5, 20: 1.0 }

/**
 * Income cut-off for "low-income" blocks: the resident-weighted median of tract median household income, so
 * low-income blocks hold the poorer half of residents. Used by the equity guarantee and the low-income share.
 */
export function lowIncomeThreshold(hexes: Hex[]): number {
  const v = hexes.filter((h) => h.income != null && h.pop > 0).sort((a, b) => a.income! - b.income!)
  const total = v.reduce((a, h) => a + h.pop, 0)
  let cum = 0
  for (const h of v) {
    cum += h.pop
    if (cum >= total / 2) return h.income!
  }
  return 0
}

export type OptInput = {
  hexes: Hex[]
  sites: Site[]
  treeBenefits: Record<Size, TreeBenefit>
  /** neighborhood → Tree Equity Score (0–100), optional; enables the TES baseline */
  nbTes?: Record<string, number>
}

export type Prepared = {
  hexes: Hex[]
  index: Map<string, number>
  /** sites per hex index, in contract order (crown × surv / cost desc, ties cheapest) */
  sites: Site[][]
  /** best single crown unit's person-°F, the cooling normalizer */
  maxHeatVal: number
  /** eco credit per tree by size, scaled by USFS $ benefits relative to a medium tree */
  ecoNorm: Record<Size, number>
  treeBenefits: OptInput['treeBenefits']
  nbTes?: Record<string, number>
  /** 1 where the hex's tract income is below `lowIncomeThreshold` */
  lowIncome: Uint8Array
}

const density = (s: Site) => (s.crown * s.surv) / s.cost

export function prepare(input: OptInput): Prepared {
  const idx = new Map(input.hexes.map((h, i) => [h.h3, i]))
  const sites: Site[][] = input.hexes.map(() => [])
  for (const s of input.sites) {
    const i = idx.get(s.h3)
    if (i !== undefined) sites[i].push(s)
  }
  // The pipeline already writes this order; re-sorting (stable) guards against unsorted input.
  for (const l of sites) l.sort((a, b) => density(b) - density(a) || a.cost - b.cost)
  let maxHeatVal = 0
  input.hexes.forEach((h) => {
    if (h.cap > 0 && h.gains.length) maxHeatVal = Math.max(maxHeatVal, h.gains[0] * h.pop + h.spill)
  })
  const tb = input.treeBenefits
  const cut = lowIncomeThreshold(input.hexes)
  const lowIncome = Uint8Array.from(input.hexes, (h) => (h.income != null && h.income < cut ? 1 : 0))
  const eco = (size: Size) => (ECO_MEDIUM_NORM * tb[size].usdYr) / (tb.medium.usdYr || 1)
  return {
    hexes: input.hexes,
    index: idx,
    sites,
    maxHeatVal: maxHeatVal || 1,
    ecoNorm: { small: eco('small'), medium: eco('medium'), large: eco('large') },
    treeBenefits: tb,
    nbTes: input.nbTes,
    lowIncome,
  }
}

/** `off[i]` is hex i's first slot in the flat per-site arrays (prefix sum of caps). */
type Eligible = { lists: Site[][]; caps: Int32Array; off: Int32Array; nSlots: number }

function eligible(P: Prepared, p: Params): Eligible {
  const excl = new Set(p.excludeNbs)
  const caps = new Int32Array(P.hexes.length)
  const lists = P.hexes.map((h, i) => {
    if (excl.has(h.nb)) return []
    const l = p.avoidUtilities ? P.sites[i].filter((s) => !s.util) : P.sites[i]
    caps[i] = Math.min(l.length, h.cap)
    return l
  })
  const off = new Int32Array(P.hexes.length)
  let nSlots = 0
  for (let i = 0; i < caps.length; i++) {
    off[i] = nSlots
    nSlots += caps[i]
  }
  return { lists, caps, off, nSlots }
}

/** °F from `crown` units starting at unit u; entries past the end of gains count as 0. */
function gainSum(h: Hex, u: number, crown: number) {
  let g = 0
  for (let j = u; j < u + crown && j < h.gains.length; j++) g += h.gains[j]
  return g
}

/** Person-°F of cooling (own hex + neighbor spillover) from a tree of `crown` units at unit u, before survival. */
const benefit = (h: Hex, u: number, crown: number) => gainSum(h, u, crown) * h.pop + h.spill * crown

function value(P: Prepared, h: Hex, u: number, s: Site, w: Params['weights']) {
  const cool = benefit(h, u, s.crown) / P.maxHeatVal
  return s.surv * (cool * (w.heat + w.equity * h.vulnEq + w.health * h.vulnHealth) + w.eco * P.ecoNorm[s.size])
}

/** Shared per-plan state across greedy passes. `taken[E.off[i] + k]` marks site k of hex i as planted. */
type State = { units: Int32Array; trees: Int32Array; taken: Uint8Array; picked: Site[] }

/** First untaken site in hex i that fits `remaining`, as an index into E.lists[i], or −1. */
function nextSite(E: Eligible, S: State, i: number, remaining: number) {
  if (S.trees[i] >= E.caps[i]) return -1
  const l = E.lists[i]
  const o = E.off[i]
  for (let k = 0; k < E.caps[i]; k++) if (!S.taken[o + k] && l[k].cost <= remaining) return k
  return -1
}

/**
 * Greedy over `hexIdx` with `budget`, continuing from S. Returns dollars spent.
 * Heap entries are exact until the remaining budget drops below the candidate's cost; then the hex is
 * re-scored with its next affordable site (skipped sites stay available to later passes).
 */
function greedy(P: Prepared, E: Eligible, p: Params, hexIdx: number[], budget: number, S: State) {
  const heap = new MaxHeap()
  const cand = new Int32Array(P.hexes.length).fill(-1)
  let spent = 0
  const push = (i: number) => {
    const k = nextSite(E, S, i, budget - spent)
    cand[i] = k
    if (k < 0) return
    const s = E.lists[i][k]
    heap.push(value(P, P.hexes[i], S.units[i], s, p.weights) / s.cost, i)
  }
  for (const i of hexIdx) push(i)
  while (heap.size) {
    const i = heap.pop()
    const s = E.lists[i][cand[i]]
    if (spent + s.cost > budget) {
      push(i) // candidate no longer fits: try this hex's next affordable site
      continue
    }
    spent += s.cost
    S.picked.push(s)
    S.taken[E.off[i] + cand[i]] = 1
    S.units[i] += s.crown
    S.trees[i]++
    push(i)
  }
  return spent
}

function impactOf(P: Prepared, p: Params, picked: Site[]): Result {
  const hexIndex = P.index
  const perHex: Record<string, number> = {}
  const units: Record<string, number> = {}
  const fByHex: Record<string, number> = {}
  let spent = 0, cooling = 0, lowInc = 0, holcCD = 0, co2 = 0, storm = 0, usd = 0, surviving = 0
  const m = MATURITY[p.years]
  for (const s of picked) {
    const hi = hexIndex.get(s.h3)!
    const h = P.hexes[hi]
    const u = units[s.h3] ?? 0
    units[s.h3] = u + s.crown
    perHex[s.h3] = (perHex[s.h3] ?? 0) + 1
    const b = s.surv * benefit(h, u, s.crown)
    fByHex[s.h3] = (fByHex[s.h3] ?? 0) + s.surv * gainSum(h, u, s.crown)
    spent += s.cost
    surviving += s.surv
    cooling += b
    if (P.lowIncome[hi]) lowInc += b
    if (h.holc === 'C' || h.holc === 'D') holcCD++
    const tb = P.treeBenefits[s.size]
    co2 += tb.co2LbYr * m * s.surv
    storm += tb.stormGalYr * m * s.surv
    usd += tb.usdYr * m * s.surv
  }
  let residents = 0, fSum = 0
  const targeted = Object.keys(perHex)
  for (const id of targeted) {
    const h = P.hexes[hexIndex.get(id)!]
    residents += h.pop
    fSum += fByHex[id]
  }
  const impact: Impact = {
    trees: picked.length,
    expectedSurviving: surviving,
    spent,
    coolingPersonF: cooling,
    avgFTargeted: targeted.length ? fSum / targeted.length : 0,
    residents,
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
  const n = P.hexes.length
  const S: State = { units: new Int32Array(n), trees: new Int32Array(n), taken: new Uint8Array(E.nSlots), picked: [] }
  const all = P.hexes.map((_, i) => i)
  let spent = 0
  if (p.equityQuota > 0) {
    const low = all.filter((i) => P.lowIncome[i])
    spent = greedy(P, E, p, low, p.budget * Math.min(1, p.equityQuota), S)
  }
  greedy(P, E, p, all, p.budget - spent, S)
  return impactOf(P, p, S.picked)
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

/** Fill hexes in the given order, each hex's sites in list order, skipping sites that don't fit. */
function fillInOrder(E: Eligible, order: number[], budget: number) {
  const picked: Site[] = []
  let spent = 0
  for (const i of order) {
    for (let k = 0; k < E.caps[i]; k++) {
      const s = E.lists[i][k]
      if (spent + s.cost > budget) continue
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
