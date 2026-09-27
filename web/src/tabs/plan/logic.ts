// Pure helpers for the Plan tab UI (no React, no store). Tested in logic.test.ts.
import type { Hex, Impact, ParetoPoint, Site, Weights } from '@/lib/types'

// ---------- Budget slider (log scale) ----------
export const BUDGET_MIN = 25_000
export const BUDGET_MAX = 10_000_000
export const SLIDER_STEPS = 1000

/** Slider position (0..SLIDER_STEPS) → dollars, log scale over [BUDGET_MIN, BUDGET_MAX]. */
export function sliderToBudget(v: number) {
  const t = Math.min(1, Math.max(0, v / SLIDER_STEPS))
  return BUDGET_MIN * Math.pow(BUDGET_MAX / BUDGET_MIN, t)
}
export function budgetToSlider(b: number) {
  const c = Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, b))
  return (Math.log(c / BUDGET_MIN) / Math.log(BUDGET_MAX / BUDGET_MIN)) * SLIDER_STEPS
}
/** Round a budget to a "nice" value so the label doesn't jitter while dragging. */
export function niceBudget(b: number) {
  const mag = Math.pow(10, Math.floor(Math.log10(b)) - 1)
  return Math.round(b / mag) * mag
}

// ---------- Presets (§8.2) ----------
export const PRESETS: { id: string; label: string; weights: Weights }[] = [
  { id: 'cooling', label: 'Max cooling', weights: { heat: 1, equity: 0, health: 0, eco: 0.1 } },
  { id: 'equity', label: 'Equity first', weights: { heat: 0.4, equity: 1, health: 0.3, eco: 0.1 } },
  { id: 'health', label: 'Health', weights: { heat: 0.4, equity: 0.3, health: 1, eco: 0.1 } },
  { id: 'balanced', label: 'Balanced', weights: { heat: 0.6, equity: 0.6, health: 0.6, eco: 0.3 } },
]
export const WEIGHT_KEYS = ['heat', 'equity', 'health', 'eco'] as const

export function matchPreset(w: Weights, eps = 0.011) {
  return PRESETS.find((p) => WEIGHT_KEYS.every((k) => Math.abs(p.weights[k] - w[k]) < eps))?.id ?? ''
}
export const lerpWeights = (a: Weights, b: Weights, t: number): Weights => ({
  heat: a.heat + (b.heat - a.heat) * t,
  equity: a.equity + (b.equity - a.equity) * t,
  health: a.health + (b.health - a.health) * t,
  eco: a.eco + (b.eco - a.eco) * t,
})

// ---------- Sprout animation (§8.3) ----------
export const SPROUT_MS = 450
export const STAGGER_MS = 3
export const MAX_DELAY_MS = 1500
/** Above this many planned sites the per-site stagger is skipped. */
export const STAGGER_LIMIT = 10_000

/**
 * Birth time for each planned site. Sites already in the previous plan keep their birth (so they don't
 * re-sprout while the slider moves); new sites sprout at t0 + min(n × 3 ms, 1500 ms), n = their order among
 * the new sites (for a brand-new plan this is the rank).
 */
export function computeBirths(prev: Map<string, number>, ids: string[], t0: number) {
  const births = new Map<string, number>()
  const stagger = ids.length <= STAGGER_LIMIT
  let n = 0
  let last = -Infinity
  for (const id of ids) {
    const b = prev.get(id)
    if (b !== undefined) births.set(id, b)
    else {
      const t = t0 + (stagger ? Math.min(n * STAGGER_MS, MAX_DELAY_MS) : 0)
      births.set(id, t)
      last = Math.max(last, t)
      n++
    }
  }
  return { births, lastBirth: last, added: n }
}

/** 0 before birth, springs slightly past 1, then settles at 1 (ease-out-back). */
export function sproutScale(age: number) {
  if (age <= 0) return 0
  if (age >= SPROUT_MS) return 1
  const t = age / SPROUT_MS - 1
  const c1 = 1.70158
  return 1 + (c1 + 1) * t * t * t + c1 * t * t
}

// ---------- Pareto annotation (§8.4) ----------
export type ParetoNote = { fromShare: number; toShare: number; gainPts: number; lossPct: number }

/**
 * "The first X points of equity cost only Y% of cooling": from the quota-0 plan, the largest gain in
 * low-income share whose cooling loss stays within `maxLoss`. Falls back to the point with the best
 * gain-per-loss when every gain costs more. Null when the curve is flat.
 */
export function paretoNote(points: ParetoPoint[], maxLoss = 0.05): ParetoNote | null {
  if (points.length < 2) return null
  const pts = [...points].sort((a, b) => a.quota - b.quota)
  const p0 = pts[0]
  if (p0.cooling <= 0) return null
  const cand = pts
    .slice(1)
    .map((p) => ({ p, gain: p.shareLowIncome - p0.shareLowIncome, loss: Math.max(0, 1 - p.cooling / p0.cooling) }))
    .filter((c) => c.gain > 0.005)
  if (!cand.length) return null
  const within = cand.filter((c) => c.loss <= maxLoss)
  const best = within.length
    ? within.reduce((a, b) => (b.gain > a.gain ? b : a))
    : cand.reduce((a, b) => (b.gain / Math.max(b.loss, 1e-9) > a.gain / Math.max(a.loss, 1e-9) ? b : a))
  return { fromShare: p0.shareLowIncome, toShare: best.p.shareLowIncome, gainPts: best.gain * 100, lossPct: best.loss * 100 }
}

export function paretoNoteText(n: ParetoNote) {
  const loss = n.lossPct < 1 ? 'less than 1%' : `only ${n.lossPct.toFixed(0)}%`
  const from = Math.round(n.fromShare * 100)
  const to = Math.round(n.toShare * 100)
  return `The first ${to - from} points of equity (${from}% → ${to}% of benefit to low-income blocks) cost ${loss} of cooling.`
}

// ---------- Baselines table ----------
export type BaselineRow = { id: string; label: string; impact: Impact }
export const BASELINE_COLS = ['coolingPersonF', 'avgFTargeted', 'shareLowIncome', 'shareHolcCD'] as const
export type BaselineCol = (typeof BASELINE_COLS)[number]

/** Row id with the highest value per column (ties: first row wins). */
export function bestPerColumn(rows: BaselineRow[]): Record<BaselineCol, string | null> {
  const out = {} as Record<BaselineCol, string | null>
  for (const c of BASELINE_COLS) {
    let best: BaselineRow | null = null
    for (const r of rows) if (!best || r.impact[c] > best.impact[c] + 1e-12) best = r
    out[c] = best?.id ?? null
  }
  return out
}

// ---------- Export (§8.4) ----------
const csvCell = (v: string | number | null | undefined) => {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function sitesToCsv(sites: Site[]) {
  const head = ['rank', 'id', 'lat', 'lng', 'neighborhood', 'space', 'species', 'cost']
  const rows = sites.map((s, i) => [i + 1, s.id, s.lat, s.lng, s.nb, s.space, s.species, s.cost].map(csvCell).join(','))
  return [head.join(','), ...rows].join('\n') + '\n'
}

export function sitesToGeoJson(sites: Site[]) {
  return {
    type: 'FeatureCollection' as const,
    features: sites.map((s, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
      properties: { rank: i + 1, id: s.id, neighborhood: s.nb, space: s.space, width: s.width, species: s.species, cost: s.cost, type: s.type, util: s.util },
    })),
  }
}

// ---------- Planned cooling per hex (hover tooltip) ----------
/** °F of cooling in a hex from its first n trees (sum of marginal gains). */
export function hexCoolingF(h: Hex, n: number) {
  let f = 0
  for (let k = 0; k < Math.min(n, h.gains.length); k++) f += h.gains[k]
  return f
}

// ---------- Robust picks (§8.5) ----------
/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `runs` weight vectors, each weight scaled by a factor in [1 − spread, 1 + spread]. */
export function perturbedWeights(w: Weights, runs = 20, spread = 0.3, seed = 7): Weights[] {
  const r = mulberry32(seed)
  const f = () => 1 - spread + 2 * spread * r()
  return Array.from({ length: runs }, () => ({ heat: w.heat * f(), equity: w.equity * f(), health: w.health * f(), eco: w.eco * f() }))
}

/** Ids that appear in at least `threshold` of the runs. */
export function robustIds(runs: string[][], threshold = 0.8) {
  const counts = new Map<string, number>()
  for (const ids of runs) for (const id of new Set(ids)) counts.set(id, (counts.get(id) ?? 0) + 1)
  const need = Math.ceil(threshold * runs.length - 1e-9)
  const out = new Set<string>()
  for (const [id, c] of counts) if (c >= need) out.add(id)
  return out
}

// ---------- Geometry ----------
/** [[minLng, minLat], [maxLng, maxLat]] of a (Multi)Polygon. */
export function bboxOf(g: { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] }): [[number, number], [number, number]] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
  for (const p of polys) for (const ring of p) for (const [x, y] of ring) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return [[x0, y0], [x1, y1]]
}
