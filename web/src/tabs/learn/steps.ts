// The nine story beats (implementation_plan.md §9.1). Text only; overlays live in overlays.tsx and map
// layers in layers.ts, both keyed by step id. Every number is read from the loaded data or optimizer runs.
import type { ComponentType } from 'react'
import type { AppData } from '@/lib/types'
import type { MultiPolygon, Polygon } from 'geojson'
import { fmtInt, fmtPct, fmtSignedF } from '@/lib/format'
import { boundsOf, hottestCoolest, type LngLat } from './helpers'
import type { TurnRuns, VisionRun } from './learnStore'
import type { CameraSpec } from './viewport'
import {
  CanopyAvsD, CtaButtons, EchoChart, GapBar, HolcKey, HookCounter, HumanCostTiles, TurnCards, VisionCounter,
} from './overlays'

export type StepId = 'hook' | 'history' | 'echo' | 'canopy' | 'cost' | 'gap' | 'turn' | 'vision' | 'cta'


export type StoryCtx = {
  data: AppData
  hc: ReturnType<typeof hottestCoolest>
  turn: TurnRuns | null
  vision: VisionRun | null
}

export type Step = {
  id: StepId
  kicker: (c: StoryCtx) => string
  title: (c: StoryCtx) => string
  body: (c: StoryCtx) => string
  source: string
  camera: (c: StoryCtx) => CameraSpec | null
  Overlay?: ComponentType<{ active: boolean }>
}

/** 3D buildings on for these beats (restored afterwards). */
export const BUILDING_STEPS = new Set<StepId>(['cost'])

/** The city's yearly pace and the pace the goal needs, as cited text (Howard Center, Code Red, 2019). */
export const PACE_NEEDED_PER_YEAR = 25_000
export const VISION_YEARS = 10

const holc = (d: AppData, g: 'A' | 'B' | 'C' | 'D') => d.stats.byHolc.find((x) => x.grade === g)

type Bounds = [[number, number], [number, number]]
const boundsCache = new WeakMap<object, Bounds | null>()
function featureBounds(fc: { features: { geometry: Polygon | MultiPolygon }[] }): Bounds | null {
  if (boundsCache.has(fc)) return boundsCache.get(fc)!
  const pts: LngLat[] = []
  for (const f of fc.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    for (const p of polys) for (const c of p[0]) pts.push([c[0], c[1]])
  }
  const b = boundsOf(pts)
  boundsCache.set(fc, b)
  return b
}
const siteBounds = (d: AppData) => {
  if (boundsCache.has(d.sites)) return boundsCache.get(d.sites)!
  const b = boundsOf(d.sites.map((s) => [s.lng, s.lat]))
  boundsCache.set(d.sites, b)
  return b
}

const fit = (b: Bounds | null, pitch: number, bearing: number, zoomDelta = 0): CameraSpec | null =>
  b && { kind: 'fit', bounds: b, pitch, bearing, zoomDelta }

export const STEPS: Step[] = [
  {
    id: 'hook',
    kicker: () => 'August 29, 2018 · afternoon',
    title: () => 'One city, one afternoon',
    body: () =>
      'On one summer afternoon, a street-by-street survey measured the air temperature across Baltimore. A few miles apart, the hottest blocks ran this much hotter than the coolest:',
    source: 'NOAA / CAPA Heat Watch, Aug 29 2018',
    camera: ({ data }) => fit(featureBounds(data.city), 50, -15),
    Overlay: HookCounter,
  },
  {
    id: 'history',
    kicker: () => '1937',
    title: () => 'Lines on a map',
    body: () =>
      'Federal HOLC surveyors graded Baltimore’s neighborhoods A to D. Areas graded D, “hazardous” and shaded red, were largely Black neighborhoods, cut off from home loans for decades.',
    source: 'Mapping Inequality, University of Richmond',
    camera: ({ data }) => fit(featureBounds(data.holc), 40, 8),
    Overlay: HolcKey,
  },
  {
    id: 'echo',
    kicker: () => 'Today',
    title: () => 'The same blocks are hottest',
    body: ({ data }) => {
      const a = holc(data, 'A'), d = holc(data, 'D')
      const delta = a && d ? ` Formerly redlined D areas averaged ${fmtSignedF(d.heat - a.heat)} compared with A areas.` : ''
      return `Nearly ninety years later, the afternoon heat still tracks the old grades.${delta}`
    },
    source: 'NOAA Heat Watch 2018 × HOLC maps (Mapping Inequality); Hoffman et al. 2020',
    camera: ({ data }) => fit(featureBounds(data.holc), 52, 24, 0.2),
    Overlay: EchoChart,
  },
  {
    id: 'canopy',
    kicker: () => 'Shade',
    title: () => 'Where the red lines fell, trees are scarce',
    body: ({ data }) => {
      const a = holc(data, 'A'), d = holc(data, 'D')
      const tail = a && d ? ` Today A-graded areas have ${fmtPct(a.canopy)} tree cover; D-graded areas have ${fmtPct(d.canopy)}.` : ''
      return `Tree canopy is a city’s best shade against heat.${tail}`
    },
    source: 'Chesapeake Bay Program 1 m land cover (2021/22)',
    camera: ({ data }) => fit(featureBounds(data.holc), 35, 0),
    Overlay: CanopyAvsD,
  },
  {
    id: 'cost',
    kicker: () => 'Who feels it',
    title: () => 'Heat lands on people',
    body: ({ hc }) =>
      hc
        ? `Compare the ${hc.hot.names.length} hottest and ${hc.cool.names.length} coolest neighborhoods. Below: ${hc.hot.names[0]}, the hottest, at street level.`
        : 'Heat is not just discomfort: it strains hearts and lungs, and it hits hardest where incomes are lowest.',
    source: 'CDC PLACES (adult asthma); Census ACS 5-year (poverty); NOAA Heat Watch 2018',
    camera: ({ data, hc }) => {
      const f = hc && data.nbByName.get(hc.hot.names[0])
      if (!f) return null
      return { kind: 'point', center: [f.properties.labelLng, f.properties.labelLat], zoom: 15.6, pitch: 62, bearing: 30 }
    },
    Overlay: HumanCostTiles,
  },
  {
    id: 'gap',
    kicker: () => 'The goal',
    title: ({ data }) => `${fmtPct(data.stats.city.canopyGoal)} canopy by 2037`,
    body: ({ data }) =>
      `Baltimore sits at ${fmtPct(data.stats.city.canopy)}, and ${fmtInt(data.stats.city.nbBelow20)} neighborhoods are below 20%. The city plants about 10,000 trees a year; the goal needs about ${fmtInt(PACE_NEEDED_PER_YEAR)}.`,
    source: 'TreeBaltimore canopy goal; Howard Center, “Code Red” (2019)',
    camera: ({ data }) => fit(featureBounds(data.city), 0, 0),
    Overlay: GapBar,
  },
  {
    id: 'turn',
    kicker: () => 'The turn',
    title: () => 'Same 1,000 trees. Where they go matters.',
    body: () =>
      'We placed the same number of trees twice: once on empty sites picked at random, once where our optimizer finds the most cooling for the people who need it most.',
    source: 'Our ML heat model + optimizer, run live in your browser (Balanced weights)',
    camera: ({ data }) => fit(siteBounds(data), 25, 0),
    Overlay: TurnCards,
  },
  {
    id: 'vision',
    kicker: () => `${VISION_YEARS} years from now`,
    title: () => 'A cooler Baltimore',
    body: ({ vision }) => {
      const pace = `At the pace the goal needs, ${VISION_YEARS} years of planting`
      if (!vision) return `${pace} could reach every empty site in the city’s inventory.`
      return vision.result.impact.trees < vision.trees
        ? `${pace} would fill all ${fmtInt(vision.result.impact.trees)} empty sites in the city’s inventory. The planted blocks cool:`
        : `${pace} means ${fmtInt(vision.result.impact.trees)} new street trees. The planted blocks cool:`
    },
    source: 'Model projection from the city tree inventory; pace from Howard Center (2019)',
    camera: ({ data }) => fit(siteBounds(data), 52, -25),
    Overlay: VisionCounter,
  },
  {
    id: 'cta',
    kicker: () => 'Your turn',
    title: () => 'You can help',
    body: () =>
      'Request a free street tree, join a planting, or share your neighborhood’s numbers. A tree on the hottest blocks does the most good.',
    source: 'TreeBaltimore · Baltimore Tree Trust · Blue Water Baltimore · Parks & People',
    camera: ({ data }) => fit(featureBounds(data.city), 45, -10),
    Overlay: CtaButtons,
  },
]

export const HELP_INDEX = STEPS.length
