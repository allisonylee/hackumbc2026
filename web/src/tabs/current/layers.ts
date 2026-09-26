import { useEffect, useMemo, useState } from 'react'
import type { Layer, PickingInfo } from '@deck.gl/core'
import { GeoJsonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { H3HexagonLayer } from '@deck.gl/geo-layers'
import {
  CollisionFilterExtension, PathStyleExtension,
  type CollisionFilterExtensionProps, type PathStyleExtensionProps,
} from '@deck.gl/extensions'
import type { Feature, Point } from 'geojson'
import { useStore, type ColorBy } from '@/store'
import { BIVARIATE, BRAND, HOLC_COLORS, RAMPS, norm, type RGBA } from '@/lib/colors'
import { fmtF, fmtPct, fmtSignedF } from '@/lib/format'
import { loadTrees } from '@/lib/data'
import type { CoolingCenterProps, Hex, HolcGrade, NbFeature, NbProps, Site, Tree } from '@/lib/types'
import { before, EMPTY_TAB_LAYERS, type TabLayers, type Tooltip } from '@/map/types'
import { useDerived, type Derived } from './derived'
import { focusNb, noteViewport, prefersReducedMotion, setHoveredIfChanged, useCurrentUi } from './ui'

/** metres of extrusion per °F above the city median */
const HEIGHT_PER_F = 45
const RISE_MS = 1800
export const LABEL_MIN_ZOOM = 12.5
export const SITES_MIN_ZOOM = 14
export const TREES_MIN_ZOOM = 15

// Extensions are created once: new instances on every render would recompile the shaders.
const COLLISION = new CollisionFilterExtension()
const DASH = new PathStyleExtension({ dash: true })
const NO_DATA: RGBA = [120, 120, 120, 150]

export type HexColorOpts = {
  colorBy: ColorBy
  modelView: 'pred' | 'resid'
  /** time-lapse position 0 (2013) → 1 (today), or null */
  t: number | null
  deltas: Map<string, number> | null
  domains: Derived['domains']
}

/** Hex fill color for the current "Color by" mode. Shared with the legend's logic. */
export function hexColor(h: Hex, o: HexColorOpts): RGBA {
  const d = o.deltas?.get(h.h3) ?? 0
  let rgb
  switch (o.colorBy) {
    case 'canopy': {
      const c = o.t != null && typeof h.canopy13 === 'number' ? h.canopy13 + (h.canopy - h.canopy13) * o.t : h.canopy
      rgb = RAMPS.canopy(norm(c, ...o.domains.canopy))
      break
    }
    case 'heat':
      rgb = RAMPS.heat(norm((h.heat ?? h.heatPred) + d, ...o.domains.heat))
      break
    case 'income':
      if (h.income == null) return NO_DATA
      rgb = RAMPS.income(norm(h.income, ...o.domains.income))
      break
    case 'asthma':
      if (h.asthma == null) return NO_DATA
      rgb = RAMPS.asthma(norm(h.asthma, ...o.domains.asthma))
      break
    case 'model':
      if (o.modelView === 'pred') rgb = RAMPS.heat(norm(h.heatPred + d, ...o.domains.heat))
      else if (h.heatResid == null) return NO_DATA
      else rgb = RAMPS.residual(norm(h.heatResid, ...o.domains.resid))
      break
  }
  return [rgb[0], rgb[1], rgb[2], 255]
}

/** elevationScale multiplier animating 0 → 1 once per session, when the map is ready. */
let hasRisen = false
function useRise(ready: boolean) {
  const [rise, setRise] = useState(hasRisen ? 1 : 0)
  useEffect(() => {
    if (!ready || hasRisen) return
    hasRisen = true
    if (prefersReducedMotion()) {
      setRise(1)
      return
    }
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / RISE_MS)
      setRise(1 - (1 - t) ** 3)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      setRise(1)
    }
  }, [ready])
  return rise
}

function useTrees(want: boolean) {
  const [trees, setTrees] = useState<Tree[] | null>(null)
  useEffect(() => {
    if (!want || trees) return
    let alive = true
    loadTrees().then((t) => alive && setTrees(t)).catch(() => {})
    return () => { alive = false }
  }, [want, trees])
  return trees
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const TOOLTIP_STYLE: Partial<CSSStyleDeclaration> = {
  background: 'rgba(11,15,14,0.92)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px',
  padding: '6px 9px',
  fontSize: '12px',
  lineHeight: '1.45',
  fontFamily: 'Inter Variable, system-ui, sans-serif',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  maxWidth: '260px',
}
const tip = (html: string): Tooltip => ({ html, style: TOOLTIP_STYLE })

export function useCurrentLayers(active: boolean): TabLayers {
  const data = useStore((s) => s.data)
  const derived = useDerived()
  const beforeId = useStore((s) => s.map.labelLayerId)
  const zoom = useStore((s) => s.map.zoom)
  const mode3d = useStore((s) => s.map.mode3d)
  const { colorBy, modelView, heightByHeat, bivariate, layers: toggles, timelapse } = useStore((s) => s.current)
  const hoveredNb = useStore((s) => s.hovered.nb)
  const selectedNb = useStore((s) => s.selectedNb)
  const deltas = useCurrentUi((s) => s.deltas)
  const deltasKey = useCurrentUi((s) => s.deltasKey)
  const rise = useRise(active && !!data && !!beforeId)
  const trees = useTrees(active && toggles.trees && zoom >= TREES_MIN_ZOOM)

  const t = timelapse ? timelapse.t : null
  const reduce = prefersReducedMotion()
  const hexOpacity = zoom <= 14.75 ? 0.7 : zoom >= 15.25 ? 0.15 : 0.7 - ((zoom - 14.75) / 0.5) * 0.55
  const elevOn = mode3d && heightByHeat && !bivariate

  // ---- Hexes (rebuilt when color/height state changes) ----
  const hexLayer = useMemo(() => {
    if (!active || !data || !derived) return null
    const opts: HexColorOpts = { colorBy, modelView, t, deltas, domains: derived.domains }
    return new H3HexagonLayer<Hex>({
      id: 'hex-current',
      data: data.hexes,
      getHexagon: (d) => d.h3,
      extruded: true,
      coverage: 0.9,
      elevationScale: HEIGHT_PER_F * rise,
      getElevation: (d) => (elevOn ? Math.max(0, d.heatAnom + (deltas?.get(d.h3) ?? 0)) : 0),
      getFillColor: (d) => hexColor(d, opts),
      opacity: hexOpacity,
      visible: !bivariate,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 80],
      transitions: reduce ? undefined : { getElevation: 800, getFillColor: 800 },
      updateTriggers: {
        getFillColor: [colorBy, modelView, t, deltasKey],
        getElevation: [elevOn, deltasKey],
      },
      onHover: (info: PickingInfo<Hex>) => {
        setHoveredIfChanged(info.object ? { h3: info.object.h3, nb: info.object.nb } : {})
      },
      onClick: (info: PickingInfo<Hex>) => {
        if (info.object) focusNb(info.object.nb)
      },
      ...before(beforeId),
    })
  }, [active, data, derived, colorBy, modelView, t, deltas, deltasKey, rise, elevOn, hexOpacity, bivariate, reduce, beforeId])

  // ---- Neighborhoods: pick/bivariate fill, outlines, labels ----
  const nbLayers = useMemo(() => {
    if (!active || !data || !derived) return []
    const bivKey = bivariate === 'income' ? 'bivIncome' : 'bivHeat'
    const maxPop = Math.max(1, ...derived.nbList.map((p) => p.pop))
    const labelSize = Math.min(15, Math.max(10.5, 10.5 + (zoom - LABEL_MIN_ZOOM) * 1.6))
    return [
      new GeoJsonLayer<NbProps>({
        id: 'nb-fill',
        data: data.nbs,
        filled: true,
        stroked: false,
        getFillColor: (f) => (bivariate ? [...BIVARIATE[f.properties[bivKey]] ?? BIVARIATE[0], 205] : [0, 0, 0, 0]) as RGBA,
        transitions: reduce ? undefined : { getFillColor: 800 },
        updateTriggers: { getFillColor: [bivariate] },
        pickable: true,
        onHover: (info: PickingInfo<NbFeature>) => {
          setHoveredIfChanged(info.object ? { nb: info.object.properties.name } : {})
        },
        onClick: (info: PickingInfo<NbFeature>) => {
          if (info.object) focusNb(info.object.properties.name)
        },
        ...before(beforeId),
      }),
      new GeoJsonLayer<NbProps>({
        id: 'nb-outline',
        data: data.nbs,
        filled: false,
        stroked: true,
        getLineColor: [255, 255, 255, bivariate ? 90 : 64],
        lineWidthUnits: 'pixels',
        getLineWidth: 1,
        updateTriggers: { getLineColor: [bivariate] },
        pickable: false,
        ...before(beforeId),
      }),
      new TextLayer<NbProps, CollisionFilterExtensionProps<NbProps>>({
        id: 'nb-labels',
        data: derived.nbList,
        visible: zoom >= LABEL_MIN_ZOOM,
        getPosition: (d) => [d.labelLng, d.labelLat],
        getText: (d) => d.name,
        getSize: labelSize,
        sizeUnits: 'pixels',
        getColor: (d) => (d.name === hoveredNb || d.name === selectedNb ? [255, 255, 255, 255] : [225, 235, 230, 190]),
        updateTriggers: { getColor: [hoveredNb, selectedNb] },
        fontFamily: 'Inter Variable, system-ui, sans-serif',
        fontWeight: 600,
        characterSet: 'auto',
        fontSettings: { sdf: true },
        outlineWidth: 4,
        outlineColor: [11, 15, 14, 230],
        maxWidth: 9,
        wordBreak: 'break-word',
        parameters: { depthCompare: 'always' },
        extensions: [COLLISION],
        collisionEnabled: true,
        collisionGroup: 'nb-labels',
        getCollisionPriority: (d) => Math.round((d.pop / maxPop) * 1000),
        collisionTestProps: { sizeScale: 1.3 },
        pickable: false,
      }),
    ]
  }, [active, data, derived, bivariate, zoom, hoveredNb, selectedNb, reduce, beforeId])

  // ---- Hovered / selected neighborhood outline ----
  const highlight = useMemo(() => {
    if (!active || !data) return null
    const feats = [selectedNb, hoveredNb !== selectedNb ? hoveredNb : undefined]
      .map((n) => (n ? data.nbByName.get(n) : undefined))
      .filter((f): f is NbFeature => !!f)
    return new GeoJsonLayer<NbProps>({
      id: 'nb-highlight',
      data: feats,
      filled: false,
      stroked: true,
      getLineColor: (f) => (f.properties.name === selectedNb ? [...BRAND.canopy, 255] : [255, 255, 255, 235]) as RGBA,
      lineWidthUnits: 'pixels',
      getLineWidth: 2.5,
      updateTriggers: { getLineColor: [selectedNb] },
      pickable: false,
      parameters: { depthCompare: 'always' },
    })
  }, [active, data, hoveredNb, selectedNb])

  // ---- Overlays: HOLC, empty sites, live trees, cooling centers ----
  const overlays = useMemo(() => {
    if (!active || !data || !derived) return []
    const holcRgb = (g: HolcGrade | null) => (g ? HOLC_COLORS[g] : ([150, 150, 150] as const))
    const out: Layer[] = [
      new GeoJsonLayer<{ grade: HolcGrade | null }, PathStyleExtensionProps>({
        id: 'holc',
        data: data.holc,
        visible: toggles.holc,
        filled: true,
        getFillColor: (f) => [...holcRgb(f.properties.grade), 30] as RGBA,
        stroked: true,
        getLineColor: (f) => [...holcRgb(f.properties.grade), 230] as RGBA,
        lineWidthUnits: 'pixels',
        getLineWidth: 1.8,
        extensions: [DASH],
        getDashArray: [4, 3],
        dashJustified: true,
        pickable: true,
        ...before(beforeId),
      }),
      new TextLayer<Derived['holcLabels'][number]>({
        id: 'holc-labels',
        data: derived.holcLabels,
        visible: toggles.holc && zoom >= 13.5,
        getPosition: (d) => d.position,
        getText: (d) => d.grade,
        getColor: (d) => [...HOLC_COLORS[d.grade], 255] as RGBA,
        getSize: 16,
        fontWeight: 700,
        fontFamily: 'Inter Variable, system-ui, sans-serif',
        fontSettings: { sdf: true },
        outlineWidth: 4,
        outlineColor: [11, 15, 14, 230],
        parameters: { depthCompare: 'always' },
      }),
      new ScatterplotLayer<Site>({
        id: 'sites',
        data: data.sites,
        visible: toggles.sites && zoom >= SITES_MIN_ZOOM,
        getPosition: (d) => [d.lng, d.lat],
        getRadius: 2.2,
        radiusMinPixels: 2,
        radiusMaxPixels: 6,
        getFillColor: (d) => (d.type === 'pit' ? [250, 204, 21, 230] : [250, 204, 21, 140]),
        stroked: true,
        getLineColor: [11, 15, 14, 200],
        lineWidthMinPixels: 0.5,
        pickable: true,
        ...before(beforeId),
      }),
    ]
    if (trees) {
      out.push(
        new ScatterplotLayer<Tree>({
          id: 'live-trees',
          data: trees,
          visible: toggles.trees && zoom >= TREES_MIN_ZOOM,
          getPosition: (d) => [d[0], d[1]],
          // Rough crown radius from trunk diameter; only for display.
          getRadius: (d) => 1.5 + d[2] * 0.12,
          radiusMinPixels: 1.5,
          getFillColor: [...BRAND.canopy, 150] as RGBA,
          pickable: true,
          ...before(beforeId),
        }),
      )
    }
    out.push(
      new ScatterplotLayer<Feature<Point, CoolingCenterProps>>({
        id: 'cooling-centers',
        data: data.cooling.features,
        visible: toggles.cooling,
        getPosition: (f) => f.geometry.coordinates as [number, number],
        radiusUnits: 'pixels',
        getRadius: 6,
        getFillColor: [...BRAND.cool, 240] as RGBA,
        stroked: true,
        getLineColor: [255, 255, 255, 240],
        lineWidthUnits: 'pixels',
        getLineWidth: 1.5,
        pickable: true,
        parameters: { depthCompare: 'always' },
      }),
    )
    return out
  }, [active, data, derived, toggles, zoom, trees, beforeId])

  return useMemo(() => {
    if (!active || !hexLayer || !derived) return EMPTY_TAB_LAYERS
    const median = derived.cityMedianF
    const getTooltip = (info: PickingInfo): Tooltip => {
      noteViewport(info.viewport)
      const o = info.object as unknown
      if (!o || !info.layer) return null
      switch (info.layer.id) {
        case 'hex-current': {
          const h = o as Hex
          const f = h.heat ?? h.heatPred
          const d = useCurrentUi.getState().deltas?.get(h.h3)
          return tip(
            `<b>${esc(h.nb)}</b><br/>Canopy ${fmtPct(h.canopy)} · ${fmtF(f)} ` +
              `<span style="opacity:.65">(${fmtSignedF(f - median)} vs city median${h.heat == null ? ', modeled' : ''})</span>` +
              (d ? `<br/><span style="color:#4ade80">What-if: ${fmtSignedF(d, 2)}</span>` : ''),
          )
        }
        case 'nb-fill': {
          const p = (o as NbFeature).properties
          return tip(`<b>${esc(p.name)}</b><br/>Canopy ${fmtPct(p.canopy)} · ${fmtF(p.heat)}`)
        }
        case 'holc': {
          const g = (o as Feature<Point, { grade: HolcGrade | null }>).properties.grade
          return tip(`1930s HOLC grade <b>${g ?? '?'}</b>`)
        }
        case 'sites': {
          const s = o as Site
          return tip(
            `<b>Empty planting site</b><br/>${s.type === 'pit' ? 'Existing tree pit' : 'Potential site'}${s.space ? ` · ${esc(s.space)}` : ''}` +
              `<br/>Suggested: ${esc(s.species)}`,
          )
        }
        case 'live-trees':
          return tip(`<b>Street tree</b><br/>Trunk ${(o as Tree)[2].toFixed(1)} in across`)
        case 'cooling-centers': {
          const p = (o as Feature<Point, CoolingCenterProps>).properties
          return tip(`<b>${esc(p.name)}</b><br/>${esc(p.address)}${p.hours ? `<br/><span style="opacity:.65">${esc(p.hours)}</span>` : ''}`)
        }
        default:
          return null
      }
    }
    const layers = [...nbLayers.slice(0, 1), hexLayer, overlays[0], ...nbLayers.slice(1, 2), highlight, ...overlays.slice(2), nbLayers[2], overlays[1]]
    return { layers: layers.filter(Boolean), getTooltip }
  }, [active, hexLayer, nbLayers, highlight, overlays, derived])
}
