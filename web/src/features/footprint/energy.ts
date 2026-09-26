/** Energy formatting and the reference values the footprint UI cites. */

/** Formats watt-hours with a unit that keeps 2–3 significant digits. */
export function fmtWh(wh: number): string {
  const a = Math.abs(wh)
  if (a === 0) return '0 Wh'
  if (a >= 1000) return `${sig(wh / 1000)} kWh`
  if (a >= 0.1) return `${sig(wh)} Wh`
  if (a >= 0.001) return `${sig(wh * 1000)} mWh`
  return `${sig(wh * 1e6)} µWh`
}
/** Chat badge style: "0.021 Wh" (always in Wh so answers compare at a glance). */
export function fmtWhShort(wh: number): string {
  if (wh <= 0) return '0 Wh'
  if (wh < 0.001) return '<0.001 Wh'
  return `${sig(wh, 2)} Wh`
}
export const fmtG = (g: number) => (g >= 1000 ? `${sig(g / 1000)} kg` : `${sig(g)} g`)

function sig(x: number, digits = 3): string {
  if (x === 0) return '0'
  const p = Math.max(0, digits - 1 - Math.floor(Math.log10(Math.abs(x))))
  return Number(x.toFixed(Math.min(p, 6))).toLocaleString('en-US', { maximumFractionDigits: Math.min(p, 6) })
}

export const G_PER_LB = 453.592
export const MIN_PER_YEAR = 365 * 24 * 60

/** Per-query energy of other assistants, from research.md §3 (with sources). */
export const REFERENCE_QUERIES: { name: string; wh: string; ml: string; source: string; url: string }[] = [
  {
    name: 'Google Gemini, median text prompt', wh: '0.24', ml: '0.26',
    source: 'Google, arXiv 2508.15734 (Aug 2025)', url: 'https://arxiv.org/abs/2508.15734',
  },
  {
    name: 'OpenAI GPT-4o, typical query', wh: '~0.3', ml: '—',
    source: 'Epoch AI (2025)', url: 'https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use',
  },
  {
    name: 'ChatGPT, average query', wh: '0.34', ml: '~0.32',
    source: 'Altman (2025), company-reported', url: 'https://blog.samaltman.com/the-gentle-singularity',
  },
  {
    name: 'Canopy Guide (small local model)', wh: '~0.01–0.05', ml: '0 (no data center)',
    source: 'Our estimate; a 3B model on a Mac ≈ 0.034 Wh per answer (ML.ENERGY)', url: 'https://ml.energy/leaderboard',
  },
]

/**
 * Network energy per GB transferred. Aslan et al. 2018 (J. Industrial Ecology) put
 * it at 0.06 kWh/GB for 2015 and found it halving roughly every 2 years; the low
 * end extrapolates that trend to ~2025. Estimates in the literature vary widely.
 */
export const NETWORK_KWH_PER_GB = { low: 0.002, high: 0.06 }
export const NETWORK_SOURCE = {
  label: 'Aslan et al. 2018, "Electricity Intensity of Internet Data Transmission"',
  url: 'https://doi.org/10.1111/jiec.12630',
}

/** Optimizer run: typical duration when none has run yet, and assumed CPU power. */
export const TYPICAL_OPT_RUN_MS = 50 // plan §11.1: "about 50 ms of CPU"
export const ASSUMED_CPU_W = 15 // one busy laptop core plus package overhead (assumption)
export const optimizerWh = (ms: number, watts = ASSUMED_CPU_W) => (ms / 1000) * watts / 3600

/** Short, human duration from minutes. */
export function fmtDuration(min: number): string {
  if (!Number.isFinite(min)) return '—'
  if (min < 1) return `${Math.max(1, Math.round(min * 60))} seconds`
  if (min < 120) return `${Math.round(min)} minutes`
  const h = min / 60
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} hours`
  const d = h / 24
  if (d < 60) return `${Math.round(d)} days`
  return `${(d / 365).toFixed(1)} years`
}
