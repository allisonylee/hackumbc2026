// TypeScript mirror of CONTRACTS.md. Keep in sync with it (changes happen on main only).
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson'

export type HolcGrade = 'A' | 'B' | 'C' | 'D'

export type Hex = {
  h3: string
  nb: string
  canopy: number
  canopy13?: number
  imperv: number
  bldg: number
  road: number
  /** 0–1 low vegetation (grass, herbaceous, shrub), 2021 */
  lowveg: number
  /** 0–1 water fraction within grid_disk(h, 4) */
  waterNear: number
  heat: number | null
  heatAnom: number
  heatPred: number
  heatResid: number | null
  spill: number
  income: number | null
  poverty: number | null
  poc: number | null
  asthma: number | null
  svi: number | null
  holc: HolcGrade | null
  pop: number
  vulnEq: number
  vulnHealth: number
  flood: boolean
  cap: number
  /** marginal °F cooling per crown unit (25 m²) of new canopy, non-increasing */
  gains: number[]
  shap: [string, number][]
}

export type Site = {
  id: string
  lng: number
  lat: number
  h3: string
  type: 'pit' | 'potential'
  cost: number
  util: boolean
  width: number | null
  space: string | null
  nb: string
  species: string
  size: 'small' | 'medium' | 'large'
  /** crown units: small 1, medium 2, large 3 */
  crown: 1 | 2 | 3
  /** 0–1 expected survival */
  surv: number
}

export type NbProps = {
  name: string
  canopy: number
  heat: number
  income: number
  pop: number
  asthma: number
  poverty: number
  sites: number
  tes?: number
  rankHeat: number
  rankCanopy: number
  bivHeat: number
  bivIncome: number
  canopyGap: number
  labelLng: number
  labelLat: number
}
export type NbFeature = Feature<Polygon | MultiPolygon, NbProps>
export type HolcFeature = Feature<Polygon | MultiPolygon, { grade: HolcGrade | null }>
export type CityFeature = Feature<Polygon | MultiPolygon, { name: string }>

/** [lng, lat, dbh inches] */
export type Tree = [number, number, number]

export type CoolingCenterProps = {
  name: string
  address: string
  nb: string
  hours: string | null
  url: string | null
}
export type CoolingCenter = Feature<Point, CoolingCenterProps>

export type TreeBenefit = { co2LbYr: number; stormGalYr: number; usdYr: number }

export type Stats = {
  mock?: boolean
  city: { canopy: number; canopyGoal: number; heatSpreadF: number; emptySites: number; nbBelow20: number }
  corr: { vars: string[]; matrix: number[][] }
  regression: { slopeFPer10pct: number; r2: number; n: number }
  byHolc: { grade: HolcGrade; canopy: number; heat: number; n: number }[]
  model: {
    target: string
    date: string
    features: string[]
    nTrain: number
    r2Random: number
    r2Spatial: number
    rmseSpatial: number
    maeSpatial: number
    baselines: { meanRmse: number; linearR2Spatial: number; linearSlopeFPer10pct: number }
    pdFPer10pct: number
    pdCurve: [number, number][]
    importance: [string, number][]
    trainSeconds: number
    trainWh: number
    limitations: string[]
  }
  literature: { zaerpour_C_per10: number; meta_C_per10: number }
  treeBenefits: Record<'small' | 'medium' | 'large', TreeBenefit>
  assumptions: {
    crownM2: Record<'small' | 'medium' | 'large', number>
    survMean: number
    survBySpace: [string, number][]
    deadShareBySpace: [string, number][]
  }
}

export type Species = {
  name: string
  latin: string
  size: 'small' | 'medium' | 'large'
  underWires: boolean
  minWidthFt: number
  native: boolean
  notes: string
}

export type Footprint = {
  pipelineKWh: number
  pipelineGCO2: number
  trainKWh: number
  trainGCO2: number
  region: string
  measuredAt: string
  devAiNote: string
  cloudRefs: { name: string; wh: number; ml: number | null; source: string }[]
}

export type CorpusChunk = { id: string; title: string; url: string; source: string; text: string }

// ---- Optimizer interface ----
export type Weights = { heat: number; equity: number; health: number; eco: number }
export type Params = {
  budget: number
  weights: Weights
  equityQuota: number
  excludeNbs: string[]
  avoidUtilities: boolean
  years: 0 | 10 | 20
}
export type Impact = {
  trees: number
  expectedSurviving: number
  spent: number
  coolingPersonF: number
  avgFTargeted: number
  residents: number
  shareLowIncome: number
  shareHolcCD: number
  co2LbYr: number
  stormGalYr: number
  benefitUsdYr: number
}
export type Result = {
  siteIds: string[]
  perHex: Record<string, number>
  impact: Impact
}
export type Baselines = { random: Result; lowestCanopy: Result; tes?: Result }

// ---- Chat API ----
export type ChatMessage = { role: 'user' | 'assistant'; content: string }
export type ChatSource = { n: number; title: string; url: string }
export type ChatEvent =
  | { type: 'sources'; items: ChatSource[] }
  | { type: 'token'; text: string }
  | { type: 'done'; tokens: number; energyWh: number; measured: boolean; cached: boolean }
  | { type: 'error'; message: string }

export type AppData = {
  hexes: Hex[]
  sites: Site[]
  nbs: FeatureCollection<Polygon | MultiPolygon, NbProps>
  holc: FeatureCollection<Polygon | MultiPolygon, { grade: HolcGrade | null }>
  city: FeatureCollection<Polygon | MultiPolygon, { name: string }>
  cooling: FeatureCollection<Point, CoolingCenterProps>
  stats: Stats
  species: Species[]
  footprint: Footprint
  // indexes
  hexById: Map<string, Hex>
  sitesByHex: Map<string, Site[]>
  siteById: Map<string, Site>
  nbByName: Map<string, NbFeature>
  speciesByName: Map<string, Species>
}
