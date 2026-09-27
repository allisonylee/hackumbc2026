// Plan tab map layers (§8.3): flat hexes (heat → planned cooling / canopy), sprouting planned sites,
// faint unselected sites at high zoom, robust-pick rings, selection ring, excluded/focused neighborhoods.
import { useEffect, useMemo, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers'
import { H3HexagonLayer } from '@deck.gl/geo-layers'
import type { PickingInfo } from '@deck.gl/core'
import { cellArea } from 'h3-js'
import { useStore } from '@/store'
import { BRAND, RAMPS, type RGBA } from '@/lib/colors'
import { fmtF, fmtInt, fmtUsd } from '@/lib/format'
import type { Hex, NbFeature, Site } from '@/lib/types'
import { before, EMPTY_TAB_LAYERS, type TabLayers, type Tooltip } from '@/map/types'
import { MATURITY } from './optimizer'
import { SPROUT_MS, canopyGains, hexCoolingF, sproutScale } from './logic'
import { usePlanUi } from './planUi'

const FAINT_ZOOM = 14.5
const CANOPY_MAX = 0.6

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))]
}

/** requestAnimationFrame clock that runs until `until` (performance.now() timeline). */
function useClock(enabled: boolean, until: number) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!enabled) return
    let raf = 0
    const loop = (t: number) => {
      setNow(t)
      if (t < until) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [enabled, until])
  return now
}

const tooltipStyle = { background: 'rgba(11,15,14,0.9)', color: 'white', fontSize: '12px', borderRadius: '8px', padding: '6px 8px', border: '1px solid rgba(255,255,255,0.1)' }

/** Canopy added per hex by the current plan at the chosen maturity horizon (shared by the map and its legend). */
export function usePlanCanopyGains() {
  const data = useStore((s) => s.data)
  const result = useStore((s) => s.plan.result)
  const years = useStore((s) => s.plan.params.years)
  return useMemo(() => {
    if (!data || !result) return null
    const sites = result.siteIds.map((id) => data.siteById.get(id)).filter((x): x is Site => !!x)
    return canopyGains(sites, (x) => data.speciesByName.get(x.species)?.size ?? 'medium', MATURITY[years], (h3) => cellArea(h3, 'm2'))
  }, [data, result, years])
}

export function usePlanLayers(active: boolean): TabLayers {
  const data = useStore((s) => s.data)
  const result = useStore((s) => s.plan.result)
  const excludeNbs = useStore((s) => s.plan.params.excludeNbs)
  const focusNb = useStore((s) => s.plan.focusNb)
  const selectedSite = useStore((s) => s.selectedSite)
  const zoom = useStore((s) => s.map.zoom)
  const beforeId = useStore((s) => s.map.labelLayerId)
  const view = usePlanUi((s) => s.view)
  const births = usePlanUi((s) => s.births)
  const lastBirth = usePlanUi((s) => s.lastBirth)
  const robust = usePlanUi((s) => s.robust)
  const robustSet = usePlanUi((s) => s.robustIds)
  const reduce = useReducedMotion() ?? false
  const gained = usePlanCanopyGains()

  const animating = active && !reduce && !!result
  const now = useClock(animating, lastBirth + SPROUT_MS + 32)
  const t = reduce ? Infinity : now

  // Static per-dataset stuff.
  const heatRange = useMemo(() => {
    if (!data) return [0, 1] as const
    const v = data.hexes.map((h) => h.heatAnom).sort((a, b) => a - b)
    return [quantile(v, 0.05), quantile(v, 0.95)] as const
  }, [data])

  // Planned sites in rank order, with birth times aligned by index.
  const planned = useMemo(() => {
    if (!data || !result) return null
    const sites: Site[] = []
    for (const id of result.siteIds) {
      const s = data.siteById.get(id)
      if (s) sites.push(s)
    }
    return { sites, ids: new Set(result.siteIds) }
  }, [data, result])
  const birthArr = useMemo(() => {
    if (!planned) return new Float64Array(0)
    const a = new Float64Array(planned.sites.length)
    planned.sites.forEach((s, i) => (a[i] = births.get(s.id) ?? 0))
    return a
  }, [planned, births])

  // Per-hex colors for the current view.
  const hexColors = useMemo(() => {
    if (!data) return null
    const [lo, hi] = heatRange
    const perHex = result?.perHex ?? {}
    const colors = new Map<string, RGBA>()
    let maxCool = 0
    if (view === 'cooling' && result) for (const h3 in perHex) maxCool = Math.max(maxCool, hexCoolingF(data.hexById.get(h3)!, perHex[h3]))
    for (const h of data.hexes) {
      let c: RGBA
      if (view === 'canopyNow') {
        c = [...RAMPS.canopy(h.canopy / CANOPY_MAX), 170] as RGBA
      } else if (view === 'canopyAfter') {
        // Only planted blocks are colored, by canopy gained; the rest fade to a faint canopy backdrop.
        const g = gained?.gains.get(h.h3)
        c = g ? ([...RAMPS.gain(Math.min(1, g / gained!.hi)), 235] as RGBA) : ([...RAMPS.canopy(h.canopy / CANOPY_MAX), 35] as RGBA)
      } else if (result && perHex[h.h3]) {
        const f = hexCoolingF(h, perHex[h.h3])
        c = [...RAMPS.cooling(0.15 + 0.85 * Math.sqrt(maxCool > 0 ? f / maxCool : 0)), 215] as RGBA
      } else {
        const heat = RAMPS.heat((h.heatAnom - lo) / (hi - lo || 1))
        c = [...heat, result ? 55 : 102] as RGBA // 40% opacity, dimmer once a plan is drawn on top
      }
      colors.set(h.h3, c)
    }
    return colors
  }, [data, heatRange, result, view, gained])

  const excludedFeatures = useMemo(() => {
    if (!data || !excludeNbs.length) return []
    return excludeNbs.map((n) => data.nbByName.get(n)).filter(Boolean) as NbFeature[]
  }, [data, excludeNbs])
  const focusFeature = focusNb ? data?.nbByName.get(focusNb) : undefined

  const staticLayers = useMemo(() => {
    if (!active || !data || !hexColors) return []
    const setSelectedSite = useStore.getState().setSelectedSite
    const onSiteClick = (info: PickingInfo<Site>) => {
      if (info.object) setSelectedSite(info.object.id)
      return true
    }
    return [
      new H3HexagonLayer<Hex>({
        id: 'hex-plan',
        data: data.hexes,
        getHexagon: (d) => d.h3,
        extruded: false,
        stroked: false,
        coverage: 0.94,
        getFillColor: (d) => hexColors.get(d.h3) ?? [0, 0, 0, 0],
        updateTriggers: { getFillColor: hexColors },
        transitions: reduce ? undefined : { getFillColor: 400 },
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 40],
        ...before(beforeId),
      }),
      new GeoJsonLayer({
        id: 'plan-excluded',
        data: excludedFeatures,
        filled: true,
        stroked: true,
        getFillColor: [0, 0, 0, 120],
        getLineColor: [251, 113, 133, 200],
        lineWidthUnits: 'pixels',
        getLineWidth: 1.5,
        pickable: false,
        ...before(beforeId),
      }),
      new GeoJsonLayer({
        id: 'plan-focus',
        data: focusFeature ? [focusFeature] : [],
        filled: false,
        stroked: true,
        getLineColor: [...BRAND.equity, 255],
        lineWidthUnits: 'pixels',
        getLineWidth: 2.5,
        pickable: false,
        ...before(beforeId),
      }),
      new ScatterplotLayer<Site>({
        id: 'plan-sites-faint',
        data: data.sites,
        visible: zoom >= FAINT_ZOOM,
        getPosition: (d) => [d.lng, d.lat],
        radiusUnits: 'pixels',
        getRadius: 2.5,
        getFillColor: [255, 255, 255, 70],
        pickable: true,
        onClick: onSiteClick,
      }),
    ]
  }, [active, data, hexColors, excludedFeatures, focusFeature, zoom, beforeId, reduce])

  const siteLayers = useMemo(() => {
    if (!active || !data || !planned) return []
    const setSelectedSite = useStore.getState().setSelectedSite
    const base = 1.6 + Math.max(0, zoom - 11) * 1.1
    const radius = (i: number) => base * sproutScale(t - birthArr[i])
    const sel = selectedSite ? data.siteById.get(selectedSite) : undefined
    const robustSites = robust && robustSet ? planned.sites.filter((s) => robustSet.has(s.id)) : []
    return [
      new ScatterplotLayer<Site>({
        id: 'plan-sites',
        data: planned.sites,
        getPosition: (d) => [d.lng, d.lat],
        radiusUnits: 'pixels',
        getRadius: (_d, { index }) => radius(index),
        updateTriggers: { getRadius: [t, birthArr, base] },
        getFillColor: [...BRAND.canopy, 235],
        stroked: true,
        getLineColor: [6, 18, 11, 200],
        lineWidthUnits: 'pixels',
        getLineWidth: 0.75,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 200],
        onClick: (info: PickingInfo<Site>) => {
          if (info.object) setSelectedSite(info.object.id)
          return true
        },
      }),
      new ScatterplotLayer<Site>({
        id: 'plan-robust',
        data: robustSites,
        getPosition: (d) => [d.lng, d.lat],
        radiusUnits: 'pixels',
        getRadius: base + 2.5,
        filled: false,
        stroked: true,
        getLineColor: [...BRAND.equity, 230],
        lineWidthUnits: 'pixels',
        getLineWidth: 1.25,
        pickable: false,
      }),
      new ScatterplotLayer<Site>({
        id: 'plan-selected',
        data: sel ? [sel] : [],
        getPosition: (d) => [d.lng, d.lat],
        radiusUnits: 'pixels',
        getRadius: base + 6,
        filled: false,
        stroked: true,
        getLineColor: [255, 255, 255, 255],
        lineWidthUnits: 'pixels',
        getLineWidth: 2,
        pickable: false,
      }),
    ]
  }, [active, data, planned, birthArr, t, zoom, selectedSite, robust, robustSet])

  const getTooltip = useMemo(() => {
    if (!data) return undefined
    return (info: PickingInfo): Tooltip => {
      if (!info.object || !info.layer) return null
      const id = info.layer.id
      if (id === 'plan-sites' || id === 'plan-sites-faint') {
        const s = info.object as Site
        const rank = id === 'plan-sites' ? `#${fmtInt(info.index + 1)} · ` : 'Not in plan · '
        return { html: `<b>${s.species}</b><br/>${rank}${fmtUsd(s.cost, false)} · ${s.nb}<br/><span style="opacity:.6">Click for details</span>`, style: tooltipStyle }
      }
      if (id === 'hex-plan') {
        const h = info.object as Hex
        const n = result?.perHex[h.h3] ?? 0
        const cool = n ? `<br/>${n} tree${n === 1 ? '' : 's'} · −${fmtF(hexCoolingF(h, n), 2)}` : ''
        const heat = h.heat ?? h.heatPred
        return { html: `<b>${h.nb}</b><br/>${fmtF(heat)} afternoon · ${Math.round(h.canopy * 100)}% canopy${cool}`, style: tooltipStyle }
      }
      return null
    }
  }, [data, result])

  return useMemo(() => {
    if (!active || !data) return EMPTY_TAB_LAYERS
    return { layers: [...staticLayers, ...siteLayers], getTooltip }
  }, [active, data, staticLayers, siteLayers, getTooltip])
}
