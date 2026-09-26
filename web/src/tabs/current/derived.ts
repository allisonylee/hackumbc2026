// Values derived once from the loaded data (color domains, per-neighborhood hex groups, bounds).
// Cached per AppData object, so every caller shares one computation.
import type { Position } from 'geojson'
import { useStore } from '@/store'
import type { AppData, Hex, HolcGrade, NbProps } from '@/lib/types'

export type Bounds = [[number, number], [number, number]]
export type Domain = [number, number]

export type NbHexSummary = {
  n: number
  /** mean hex canopy (the what-if slider works on this) */
  canopy: number
  measured: number | null
  /** mean model prediction over the hexes that have a measurement (fair comparison) */
  predMeasured: number | null
  pred: number
  holcShare: Partial<Record<HolcGrade, number>>
  /** mean SHAP contribution per feature (hexes carry their top 3; others count as 0) */
  shap: [string, number][]
}

export type Derived = {
  domains: { canopy: Domain; heat: Domain; income: Domain; asthma: Domain; resid: Domain }
  /** °F; heatAnom is measured against this */
  cityMedianF: number
  /** metres of extrusion per °F above the median, scaled so the hottest blocks reach a fixed height */
  heightPerF: number
  nbBounds: Map<string, Bounds>
  hexesByNb: Map<string, Hex[]>
  nbList: NbProps[]
  holcLabels: { grade: HolcGrade; position: [number, number] }[]
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return NaN
  const i = (sorted.length - 1) * q
  const lo = Math.floor(i), hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}
function domainOf(values: (number | null | undefined)[], lo = 0.02, hi = 0.98): Domain {
  const v = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return [0, 1]
  return [quantile(v, lo), quantile(v, hi)]
}

function ringsOf(g: { type: string; coordinates: unknown }): Position[][] {
  if (g.type === 'Polygon') return g.coordinates as Position[][]
  if (g.type === 'MultiPolygon') return (g.coordinates as Position[][][]).flat()
  return []
}
function bboxOf(g: { type: string; coordinates: unknown }): Bounds {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const ring of ringsOf(g)) for (const [x, y] of ring) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return [[x0, y0], [x1, y1]]
}

/** Column height (m) for the 98th-percentile heat anomaly. */
const TOP_HEIGHT_M = 250

const cache = new WeakMap<AppData, Derived>()

export function getDerived(d: AppData): Derived {
  const hit = cache.get(d)
  if (hit) return hit

  const hexesByNb = new Map<string, Hex[]>()
  for (const h of d.hexes) {
    const l = hexesByNb.get(h.nb)
    if (l) l.push(h)
    else hexesByNb.set(h.nb, [h])
  }

  const offsets = d.hexes.filter((h) => h.heat != null).map((h) => (h.heat as number) - h.heatAnom).sort((a, b) => a - b)
  const cityMedianF = offsets.length
    ? quantile(offsets, 0.5)
    : quantile(d.hexes.map((h) => h.heatPred - h.heatAnom).sort((a, b) => a - b), 0.5)

  const residAbs = domainOf(d.hexes.map((h) => (h.heatResid == null ? null : Math.abs(h.heatResid))), 0, 0.98)[1] || 1

  const anomHi = domainOf(d.hexes.map((h) => h.heatAnom))[1]
  const heightPerF = TOP_HEIGHT_M / (anomHi > 0 ? anomHi : 1)

  const canopyHi = domainOf(d.hexes.map((h) => h.canopy))[1]
  const out: Derived = {
    domains: {
      canopy: [0, canopyHi > 0 ? canopyHi : 1],
      heat: domainOf(d.hexes.map((h) => h.heat ?? h.heatPred)),
      income: domainOf(d.hexes.map((h) => h.income)),
      asthma: domainOf(d.hexes.map((h) => h.asthma)),
      resid: [-residAbs, residAbs],
    },
    cityMedianF,
    heightPerF,
    nbBounds: new Map(d.nbs.features.map((f) => [f.properties.name, bboxOf(f.geometry)])),
    hexesByNb,
    nbList: d.nbs.features.map((f) => f.properties),
    holcLabels: d.holc.features
      .filter((f) => f.properties.grade)
      .map((f) => {
        const [[x0, y0], [x1, y1]] = bboxOf(f.geometry)
        return { grade: f.properties.grade as HolcGrade, position: [(x0 + x1) / 2, (y0 + y1) / 2] as [number, number] }
      }),
  }
  cache.set(d, out)
  return out
}

export function useDerived(): Derived | null {
  const data = useStore((s) => s.data)
  return data ? getDerived(data) : null
}

const summaryCache = new WeakMap<AppData, Map<string, NbHexSummary | null>>()

/** Aggregates the neighborhood's hexes for the NeighborhoodCard's ML section. */
export function nbHexSummary(d: AppData, nb: string): NbHexSummary | null {
  let m = summaryCache.get(d)
  if (!m) summaryCache.set(d, (m = new Map()))
  if (m.has(nb)) return m.get(nb) ?? null
  const hexes = getDerived(d).hexesByNb.get(nb) ?? []
  let res: NbHexSummary | null = null
  if (hexes.length) {
    const measured = hexes.filter((h) => h.heat != null)
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    const holc: Partial<Record<HolcGrade, number>> = {}
    const shap = new Map<string, number>()
    for (const h of hexes) {
      if (h.holc) holc[h.holc] = (holc[h.holc] ?? 0) + 1 / hexes.length
      for (const [f, v] of h.shap) shap.set(f, (shap.get(f) ?? 0) + v / hexes.length)
    }
    res = {
      n: hexes.length,
      canopy: mean(hexes.map((h) => h.canopy)),
      measured: measured.length ? mean(measured.map((h) => h.heat as number)) : null,
      predMeasured: measured.length ? mean(measured.map((h) => h.heatPred)) : null,
      pred: mean(hexes.map((h) => h.heatPred)),
      holcShare: holc,
      shap: [...shap.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3),
    }
  }
  m.set(nb, res)
  return res
}
