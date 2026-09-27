// Color ramps shared by map layers, legends and charts. RGBA arrays for deck.gl; use toCss() for DOM.
export type RGB = [number, number, number]
export type RGBA = [number, number, number, number]

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
export const toCss = (c: RGB | RGBA, a?: number) =>
  `rgba(${c[0]},${c[1]},${c[2]},${a ?? (c.length === 4 ? c[3] / 255 : 1)})`

/** Piecewise-linear ramp over evenly spaced stops; t in [0,1]. */
export function ramp(stops: string[]) {
  const rgb = stops.map(hex)
  const fn = (t: number): RGB => {
    const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (rgb.length - 1)
    const i = Math.min(rgb.length - 2, Math.floor(x))
    const f = x - i
    const a = rgb[i], b = rgb[i + 1]
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
  }
  fn.stops = stops
  return fn
}
export type Ramp = ReturnType<typeof ramp>

export const RAMPS = {
  canopy: ramp(['#6b4226', '#a0703a', '#c9b458', '#7fbf5a', '#2f9e44', '#14532d']),
  heat: ramp(['#fde68a', '#fbbf24', '#f97316', '#dc2626', '#7f1d1d']),
  // viridis: low income = dark purple, high income = yellow
  income: ramp(['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725']),
  asthma: ramp(['#f3e8ff', '#d8b4fe', '#a855f7', '#7e22ce', '#3b0764']),
  residual: ramp(['#2563eb', '#93c5fd', '#f5f5f5', '#fca5a5', '#dc2626']),
  cooling: ramp(['#134e4a', '#0f766e', '#14b8a6', '#5eead4', '#ccfbf1']),
  // canopy added by a plan: light lime (a little) → deep green (a lot), readable on the dark basemap
  gain: ramp(['#ecfccb', '#bef264', '#4ade80', '#16a34a', '#166534']),
}

/** Joshua Stevens 3×3 bivariate palette. Index = rowCanopyTercile(inverted) * 3 + colTercile. */
export const BIVARIATE = ['#e8e8e8', '#ace4e4', '#5ac8c8', '#dfb0d6', '#a5add3', '#5698b9', '#be64ac', '#8c62aa', '#3b4994'].map(hex)

export const HOLC_COLORS: Record<'A' | 'B' | 'C' | 'D', RGB> = {
  A: hex('#76a865'), B: hex('#7cb5bd'), C: hex('#ffff00'), D: hex('#d9838d'),
}

export const BRAND = {
  canopy: hex('#4ade80'),
  heat: hex('#f97316'),
  equity: hex('#a78bfa'),
  cool: hex('#2dd4bf'),
  random: hex('#fb923c'),
  lowCanopy: hex('#fbbf24'),
}

/** Normalize v into [0,1] over [lo, hi]. */
export const norm = (v: number, lo: number, hi: number) => (hi === lo ? 0.5 : (v - lo) / (hi - lo))
