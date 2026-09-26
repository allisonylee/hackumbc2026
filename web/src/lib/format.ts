export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US')
export const fmtPct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`
export const fmtF = (x: number, digits = 1) => `${x.toFixed(digits)}°F`
export const fmtSignedF = (x: number, digits = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(digits)}°F`

export function fmtUsd(n: number, compact = true) {
  if (!compact) return `$${fmtInt(n)}`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}k`
  return `$${Math.round(n)}`
}

export function fmtCompact(n: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

/** Friendly labels for model features (SHAP bars, importance chart). */
export const FEATURE_LABELS: Record<string, string> = {
  canopy: 'Tree cover',
  imperv: 'Pavement & roofs',
  bldg: 'Buildings',
  road: 'Roads',
  lowveg: 'Grass & shrubs',
  canopyLag1: 'Trees next door',
  canopyLag3: 'Trees nearby',
  impervLag1: 'Pavement next door',
  impervLag3: 'Pavement nearby',
  waterNear: 'Near water',
  distHarborKm: 'Distance from harbor',
  elev: 'Elevation',
  ndvi: 'Greenness',
}
export const featureLabel = (f: string) => FEATURE_LABELS[f] ?? f
