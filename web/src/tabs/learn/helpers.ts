// Pure helpers for the Learn tab (story + How to help). No store or DOM access, so they are unit-tested.
import type { CameraView } from '@/lib/views'
import type { NbProps, Site } from '@/lib/types'

export type LngLat = [number, number]

/** Great-circle distance in meters. */
export function haversineM(a: LngLat, b: LngLat) {
  const R = 6_371_000
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLng = (b[0] - a[0]) * rad
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

export type NearSite = { site: Site; distM: number }

/** The k sites closest to `origin`, nearest first. With `nb`, sites in that neighborhood are preferred
 *  when it has at least k; otherwise the search falls back to every site. */
export function nearestSites(sites: Site[], origin: LngLat, k = 5, nb?: string | null): NearSite[] {
  let pool = sites
  if (nb) {
    const inNb = sites.filter((s) => s.nb === nb)
    if (inNb.length >= k) pool = inNb
  }
  // Keep a small sorted buffer instead of sorting all ~60k sites.
  const best: NearSite[] = []
  for (const site of pool) {
    const distM = haversineM(origin, [site.lng, site.lat])
    if (best.length < k || distM < best[best.length - 1].distM) {
      let i = best.length
      while (i > 0 && best[i - 1].distM > distM) i--
      best.splice(i, 0, { site, distM })
      if (best.length > k) best.pop()
    }
  }
  return best
}

export type GroupSummary = {
  names: string[]
  pop: number
  heat: number
  canopy: number
  asthma: number
  poverty: number
  income: number
}

function summarize(list: NbProps[]): GroupSummary {
  const pop = list.reduce((s, n) => s + n.pop, 0)
  // Population-weighted means; fall back to plain means if every group member has zero population.
  const w = (n: NbProps) => (pop > 0 ? n.pop / pop : 1 / list.length)
  const mean = (f: (n: NbProps) => number) => list.reduce((s, n) => s + f(n) * w(n), 0)
  return {
    names: list.map((n) => n.name),
    pop,
    heat: mean((n) => n.heat),
    canopy: mean((n) => n.canopy),
    asthma: mean((n) => n.asthma),
    poverty: mean((n) => n.poverty),
    income: mean((n) => n.income),
  }
}

/** The n hottest and n coolest populated neighborhoods (by afternoon heat), with pop-weighted means. */
export function hottestCoolest(nbs: NbProps[], n = 10): { hot: GroupSummary; cool: GroupSummary } | null {
  const valid = nbs.filter((p) => p.pop > 0 && Number.isFinite(p.heat))
  if (valid.length < 2) return null
  const k = Math.max(1, Math.min(n, Math.floor(valid.length / 2)))
  const sorted = [...valid].sort((a, b) => b.heat - a.heat)
  return { hot: summarize(sorted.slice(0, k)), cool: summarize(sorted.slice(-k).reverse()) }
}

/** [[minLng, minLat], [maxLng, maxLat]] of the points, or null for none. */
export function boundsOf(points: LngLat[]): [[number, number], [number, number]] | null {
  if (!points.length) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of points) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return [[x0, y0], [x1, y1]]
}

/** Quantile of a numeric array (linear interpolation), ignoring non-finite values. */
export function quantile(values: number[], q: number) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return 0
  const x = (v.length - 1) * Math.min(1, Math.max(0, q))
  const i = Math.floor(x)
  return v[i] + (v[Math.min(v.length - 1, i + 1)] - v[i]) * (x - i)
}

/**
 * Shift a camera so its target appears `px` pixels right of (and `py` pixels below) the viewport center,
 * e.g. to keep it clear of a text column. Accounts for bearing; Web-Mercator approximation, ignores pitch.
 */
export function offsetCamera(v: CameraView, px: number, py = 0): CameraView {
  if (!px && !py) return v
  const degPerPx = 360 / (512 * 2 ** v.zoom)
  const b = ((v.bearing ?? 0) * Math.PI) / 180
  // Screen right = compass (bearing + 90°), screen down = compass (bearing + 180°).
  const east = Math.cos(b) * px - Math.sin(b) * py
  const north = -Math.sin(b) * px - Math.cos(b) * py
  return {
    ...v,
    longitude: v.longitude - east * degPerPx,
    latitude: v.latitude - north * degPerPx * Math.cos((v.latitude * Math.PI) / 180),
  }
}

/** Center and zoom that fit `bounds` into a w×h pixel area (Web Mercator, 512 px tiles). */
export function fitView(bounds: [[number, number], [number, number]], w: number, h: number, maxZoom = 16) {
  const [[x0, y0], [x1, y1]] = bounds
  const lat = (y0 + y1) / 2
  const lngSpan = Math.max(1e-6, x1 - x0)
  const latSpan = Math.max(1e-6, (y1 - y0) / Math.cos((lat * Math.PI) / 180))
  const z = Math.min(Math.log2((Math.max(1, w) * 360) / (512 * lngSpan)), Math.log2((Math.max(1, h) * 360) / (512 * latSpan)))
  return { longitude: (x0 + x1) / 2, latitude: lat, zoom: Math.min(maxZoom, z) }
}

/** Parse the `nb` query parameter against the known neighborhood names (case-insensitive). */
export function parseNbParam(search: string, names: Iterable<string>): string | null {
  const raw = new URLSearchParams(search).get('nb')
  if (!raw) return null
  const want = raw.trim().toLowerCase()
  for (const n of names) if (n.toLowerCase() === want) return n
  return null
}

/** Absolute share link for the Learn tab, with the neighborhood encoded as ?nb=. */
export function shareUrl(origin: string, base: string, nb: string | null) {
  const u = new URL('learn', new URL(base || '/', origin))
  if (nb) u.searchParams.set('nb', nb)
  return u.toString()
}

export const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`)
