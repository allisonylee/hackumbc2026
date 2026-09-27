// Plan tab map layers (§8.3): flat heat hexes, sprouting planned sites,
// faint unselected sites at high zoom, robust-pick rings, selection ring, excluded/focused neighborhoods.
import { useEffect, useMemo, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers'
import { H3HexagonLayer } from '@deck.gl/geo-layers'
import type { PickingInfo } from '@deck.gl/core'
import { useStore } from '@/store'
import { BRAND, RAMPS, type RGBA } from '@/lib/colors'
import { fmtF, fmtInt, fmtUsd } from '@/lib/format'
import type { Hex, NbFeature, Site } from '@/lib/types'
import { before, EMPTY_TAB_LAYERS, type TabLayers, type Tooltip } from '@/map/types'
import { SPROUT_MS, hexCoolingF, sproutScale } from './logic'
import { usePlanUi } from './planUi'

const FAINT_ZOOM = 14.5

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

export function usePlanLayers(active: boolean): TabLayers {
  const data = useStore((s) => s.data)
  const result = useStore((s) => s.plan.result)
  const excludeNbs = useStore((s) => s.plan.params.excludeNbs)
  const focusNb = useStore((s) => s.plan.focusNb)
  const selectedSite = useStore((s) => s.selectedSite)
  const zoom = useStore((s) => s.map.zoom)
  const beforeId = useStore((s) => s.map.labelLayerId)
  const births = usePlanUi((s) => s.births)
  const lastBirth = usePlanUi((s) => s.lastBirth)
  const robust = usePlanUi((s) => s.robust)
  const robustSet = usePlanUi((s) => s.robustIds)
  const reduce = useReducedMotion() ?? false

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

  // Heat backdrop; planned trees are drawn on top as sprouting dots.
  const hexColors = useMemo(() => {
    if (!data) return null
    const [lo, hi] = heatRange
    const colors = new Map<string, RGBA>()
    for (const h of data.hexes) colors.set(h.h3, [...RAMPS.heat((h.heatAnom - lo) / (hi - lo || 1)), 102] as RGBA)
    return colors
  }, [data, heatRange])

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
