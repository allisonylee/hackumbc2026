// Map layers for the Learn tab. The story's current beat (store.story.step) picks colors, heights and
// which overlays are visible; deck.gl transitions animate between beats. Layer ids are prefixed `learn-`.
import { useMemo } from 'react'
import { useReducedMotion } from 'motion/react'
import { H3HexagonLayer } from '@deck.gl/geo-layers'
import { GeoJsonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import polygonClipping, { type Geom } from 'polygon-clipping'
import type { LayersList, PickingInfo } from '@deck.gl/core'
import { useStore } from '@/store'
import { BRAND, HOLC_COLORS, RAMPS, norm, type RGB, type RGBA } from '@/lib/colors'
import type { Hex, HolcFeature, NbFeature, Site } from '@/lib/types'
import { before, EMPTY_TAB_LAYERS, type TabLayers } from '@/map/types'
import { hottestCoolest, quantile } from './helpers'
import { useLearn } from './learnStore'
import { STEPS, type Step, type StepId } from './steps'

type Beat = StepId | 'help'
type HexMode = { color: 'heat' | 'canopy'; alpha: number; height: 'heat' | 'flat' }

const HEX_MODES: Record<Beat, HexMode> = {
  hook: { color: 'heat', alpha: 225, height: 'heat' },
  history: { color: 'heat', alpha: 0, height: 'flat' },
  echo: { color: 'heat', alpha: 0, height: 'flat' },
  canopy: { color: 'canopy', alpha: 225, height: 'heat' },
  cost: { color: 'heat', alpha: 35, height: 'flat' },
  gap: { color: 'canopy', alpha: 200, height: 'flat' },
  turn: { color: 'canopy', alpha: 55, height: 'flat' },
  // Bookend: the 3D heat city from beat 1 behind the call to action.
  cta: { color: 'heat', alpha: 170, height: 'heat' },
  help: { color: 'canopy', alpha: 60, height: 'flat' },
}

const MAX_HEIGHT_M = 650
/** Beat 5 label spacing in degrees at the city-wide view (roughly one label's width and height). */
const LABEL_DX = 0.045
const LABEL_DY = 0.012
const rgba = (c: RGB | readonly number[], a: number): RGBA => [c[0], c[1], c[2], a]
const CLEAR: RGBA = [0, 0, 0, 0]
/** Markers in the flat hexes' plane draw on top, or they flicker (z-fight) while the camera moves. */
const ON_TOP = { depthCompare: 'always' } as const
const HOLC_D_LINE: RGBA = [...HOLC_COLORS.D, 255] as RGBA
/** Beats that show the full A–D HOLC shading (with the hexes hidden). */
const HOLC_SHADED = new Set<Beat>(['history', 'echo'])

type TurnSite = { s: Site; inR: boolean; inO: boolean }

export function useLearnLayers(active: boolean): TabLayers {
  const data = useStore((s) => s.data)
  const beforeId = useStore((s) => s.map.labelLayerId)
  const step = useStore((s) => s.story.step)
  const turn = useLearn((s) => s.turn)
  const phase = useLearn((s) => s.turnPhase)
  const help = useLearn((s) => s.help)
  const reduce = useReducedMotion()

  const beat: Beat = (STEPS[step] as Step | undefined)?.id ?? 'help'

  // Data-derived constants: heat domain and neighborhood groups.
  const base = useMemo(() => {
    if (!data) return null
    const anoms = data.hexes.map((h) => h.heatAnom)
    const lo = quantile(anoms, 0.02)
    const hi = quantile(anoms, 0.98)
    const hc = hottestCoolest(data.nbs.features.map((f) => f.properties))
    // The 1937 maps reach into Baltimore County; clip their shading to the city boundary.
    const [first, ...rest] = data.city.features.map((f) => f.geometry.coordinates as Geom)
    const city = first ? polygonClipping.union(first, ...rest) : null
    const holcInCity = {
      type: 'FeatureCollection' as const,
      features: data.holc.features.flatMap((f) => {
        if (!city) return [f]
        const cut = polygonClipping.intersection(f.geometry.coordinates as Geom, city)
        return cut.length ? [{ ...f, geometry: { type: 'MultiPolygon' as const, coordinates: cut } }] : []
      }),
    }
    // Beat 5 labels, hottest first then coolest, skipping any that would overlap one already placed.
    // The beat always shows the whole city, so a fixed spacing in degrees (~one label box) is enough.
    const props = data.nbs.features.map((f) => f.properties)
    const ranked = [
      ...props.filter((p) => hc?.hot.names.includes(p.name)).sort((a, b) => b.heat - a.heat),
      ...props.filter((p) => hc?.cool.names.includes(p.name)).sort((a, b) => a.heat - b.heat),
    ]
    const costLabels: typeof ranked = []
    for (const p of ranked) {
      if (costLabels.every((q) => Math.abs(q.labelLng - p.labelLng) > LABEL_DX || Math.abs(q.labelLat - p.labelLat) > LABEL_DY)) costLabels.push(p)
    }
    return {
      holcInCity,
      costLabels,
      lo, hi,
      hot: new Set(hc?.hot.names ?? []),
      cool: new Set(hc?.cool.names ?? []),
    }
  }, [data])

  // Beat 7: every site either run picked, flagged by run.
  const turnSites = useMemo<TurnSite[]>(() => {
    if (!data || !turn) return []
    const r = new Set(turn.random.siteIds)
    const o = new Set(turn.optimized.siteIds)
    const out: TurnSite[] = []
    for (const id of new Set([...turn.random.siteIds, ...turn.optimized.siteIds])) {
      const s = data.siteById.get(id)
      if (s) out.push({ s, inR: r.has(id), inO: o.has(id) })
    }
    return out
  }, [data, turn])

  const helpSites = useMemo<Site[]>(
    () => (data ? help.siteIds.map((id) => data.siteById.get(id)).filter((s): s is Site => !!s) : []),
    [data, help.siteIds],
  )

  return useMemo(() => {
    if (!active || !data || !base) return EMPTY_TAB_LAYERS
    const t = (ms: number) => (reduce ? 0 : ms)
    const mode = HEX_MODES[beat]
    const heatT = (anom: number) => norm(anom, base.lo, base.hi)

    const hexLayer = new H3HexagonLayer<Hex>({
      id: 'learn-hex',
      data: data.hexes,
      getHexagon: (d) => d.h3,
      extruded: true,
      coverage: 0.9,
      material: false,
      getElevation: (d) => {
        if (mode.height === 'flat') return 0
        return Math.max(0, Math.min(1, heatT(d.heatAnom))) * MAX_HEIGHT_M + 4
      },
      getFillColor: (d) => {
        if (mode.color === 'canopy') return rgba(RAMPS.canopy(d.canopy / 0.6), mode.alpha)
        return rgba(RAMPS.heat(heatT(d.heatAnom)), mode.alpha)
      },
      updateTriggers: { getElevation: [beat], getFillColor: [beat] },
      transitions: {
        getElevation: { duration: t(1100), enter: () => [0] },
        getFillColor: t(900),
      },
      pickable: false,
      // Hidden hexes must not occlude the HOLC shading (e.g. while beat 1's columns shrink away). Visible
      // ones keep depth so collapsing columns still draw in the right order.
      parameters: { depthWriteEnabled: mode.alpha > 0 },
      ...before(beforeId),
    })

    const holcLayer = new GeoJsonLayer<HolcFeature['properties']>({
      id: 'learn-holc',
      data: base.holcInCity,
      filled: true,
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineWidth: (f) => (f.properties.grade === 'D' && beat === 'canopy' ? 2.5 : 1.25),
      getFillColor: (f) => {
        const g = f.properties.grade
        if (!g) return CLEAR
        if (HOLC_SHADED.has(beat)) return rgba(HOLC_COLORS[g], 150)
        if (beat === 'canopy' && g === 'D') return rgba(HOLC_COLORS.D, 35)
        return CLEAR
      },
      getLineColor: (f) => {
        const g = f.properties.grade
        if (!g) return CLEAR
        if (HOLC_SHADED.has(beat)) return rgba(HOLC_COLORS[g], 230)
        if (beat === 'canopy' && g === 'D') return HOLC_D_LINE
        return CLEAR
      },
      updateTriggers: { getFillColor: beat, getLineColor: beat, getLineWidth: beat },
      transitions: {
        getFillColor: { duration: t(1000), enter: (v: number[]) => [v[0], v[1], v[2], 0] },
        getLineColor: { duration: t(1000), enter: (v: number[]) => [v[0], v[1], v[2], 0] },
      },
      pickable: false,
      ...before(beforeId),
    })

    const selNb = help.nb
    const nbLayer = new GeoJsonLayer<NbFeature['properties']>({
      id: 'learn-nbs',
      data: data.nbs,
      filled: true,
      stroked: true,
      lineWidthUnits: 'pixels',
      getLineWidth: (f) => (beat === 'help' && f.properties.name === selNb ? 3 : 1.5),
      getFillColor: (f) => {
        const p = f.properties
        if (beat === 'cost') {
          if (base.hot.has(p.name)) return rgba(BRAND.heat, 190)
          if (base.cool.has(p.name)) return rgba(BRAND.cool, 170)
        }
        if (beat === 'gap' && p.canopy < 0.2) return rgba(BRAND.lowCanopy, 40)
        if (beat === 'help' && p.name === selNb) return rgba(BRAND.equity, 35)
        return CLEAR
      },
      getLineColor: (f) => {
        const p = f.properties
        if (beat === 'cost') {
          if (base.hot.has(p.name)) return rgba(BRAND.heat, 255)
          if (base.cool.has(p.name)) return rgba(BRAND.cool, 230)
        }
        if (beat === 'gap' && p.canopy < 0.2) return rgba(BRAND.lowCanopy, 220)
        if (beat === 'help' && p.name === selNb) return rgba(BRAND.equity, 255)
        return CLEAR
      },
      updateTriggers: { getFillColor: [beat, selNb], getLineColor: [beat, selNb], getLineWidth: [beat, selNb] },
      transitions: { getFillColor: t(800), getLineColor: t(800) },
      pickable: beat === 'cost',
      // Always on top: these flat fills share the hexes' plane and would otherwise flicker (z-fight) or be
      // hidden by columns that are still collapsing when the beat starts.
      parameters: { depthCompare: 'always' },
      ...before(beforeId),
    })

    const layers: LayersList = [hexLayer, holcLayer, nbLayer]

    // Beat 5: name the hottest and coolest neighborhoods that have room for a label.
    if (beat === 'cost') {
      layers.push(
        new TextLayer<NbFeature['properties']>({
          id: 'learn-cost-labels',
          data: base.costLabels,
          getPosition: (p) => [p.labelLng, p.labelLat],
          getText: (p) => p.name,
          getSize: 11,
          sizeUnits: 'pixels',
          getColor: [255, 255, 255, 235],
          fontFamily: 'Inter Variable, system-ui, sans-serif',
          fontWeight: 600,
          characterSet: 'auto',
          fontSettings: { sdf: true },
          outlineWidth: 4,
          outlineColor: [11, 15, 14, 230],
          maxWidth: 8,
          wordBreak: 'break-word',
          parameters: { depthCompare: 'always' },
          pickable: false,
        }),
      )
    }

    if (turnSites.length) {
      const on = beat === 'turn'
      const opt = phase === 'optimized'
      layers.push(
        new ScatterplotLayer<TurnSite>({
          id: 'learn-turn-sites',
          data: turnSites,
          getPosition: (d) => [d.s.lng, d.s.lat],
          radiusUnits: 'pixels',
          getRadius: (d) => (!on ? 0 : opt ? (d.inO ? 3.4 : 0) : d.inR ? 3.4 : 0),
          getFillColor: (d) => rgba(opt && d.inO ? BRAND.canopy : BRAND.random, 235),
          stroked: true,
          getLineColor: [11, 15, 14, 200],
          lineWidthUnits: 'pixels',
          getLineWidth: 0.6,
          updateTriggers: { getRadius: [on, opt], getFillColor: [opt] },
          transitions: { getRadius: t(700), getFillColor: t(700) },
          pickable: false,
          parameters: ON_TOP,
          ...before(beforeId),
        }),
      )
    }

    if (beat === 'help') {
      if (helpSites.length) {
        layers.push(
          new ScatterplotLayer<Site>({
            id: 'learn-help-halo',
            data: helpSites,
            getPosition: (d) => [d.lng, d.lat],
            radiusUnits: 'pixels',
            getRadius: 16,
            getFillColor: rgba(BRAND.canopy, 60),
            transitions: { getRadius: { duration: t(600), enter: () => [0] } },
            pickable: false,
            parameters: ON_TOP,
          }),
          new ScatterplotLayer<Site>({
            id: 'learn-help-sites',
            data: helpSites,
            getPosition: (d) => [d.lng, d.lat],
            radiusUnits: 'pixels',
            getRadius: 7,
            getFillColor: rgba(BRAND.canopy, 255),
            stroked: true,
            getLineColor: [255, 255, 255, 255],
            lineWidthUnits: 'pixels',
            getLineWidth: 2,
            transitions: { getRadius: { duration: t(600), enter: () => [0] } },
            pickable: true,
            parameters: ON_TOP,
            autoHighlight: true,
          }),
        )
      }
      if (help.origin && !help.nb) {
        layers.push(
          new ScatterplotLayer<[number, number]>({
            id: 'learn-help-origin',
            data: [help.origin],
            getPosition: (d) => d,
            radiusUnits: 'pixels',
            getRadius: 6,
            getFillColor: rgba(BRAND.equity, 255),
            stroked: true,
            getLineColor: [255, 255, 255, 255],
            lineWidthUnits: 'pixels',
            getLineWidth: 2,
            pickable: false,
            parameters: ON_TOP,
          }),
        )
      }
    }

    const getTooltip = (info: PickingInfo) => {
      if (!info.object) return null
      const id = info.layer?.id
      if (id === 'learn-help-sites') {
        const s = info.object as Site
        const sp = data.speciesByName.get(s.species)
        return {
          html: `<b>${s.species}</b>${sp ? ` <i>${sp.latin}</i>` : ''}<br/>${s.space ?? 'Street site'} · ${s.nb}`,
        }
      }
      if (id === 'learn-nbs') {
        const p = (info.object as NbFeature).properties
        if (!base.hot.has(p.name) && !base.cool.has(p.name)) return null
        return `${p.name}: ${p.heat.toFixed(1)}°F`
      }
      return null
    }

    return { layers, getTooltip }
  }, [active, data, base, beat, turnSites, phase, helpSites, help.origin, help.nb, beforeId, reduce])
}
