// What-if canopy slider (plan §5.6): re-predict every hex in a neighborhood with more (or less) canopy.
// Uses the exported LightGBM model when `heat_model.json` exists; otherwise the model's linear slope
// `stats.model.pdFPer10pct`.
import { useEffect, useState } from 'react'
import { cellToLatLng, gridDisk } from 'h3-js'
import { loadOptional } from '@/lib/data'
import type { AppData, Hex } from '@/lib/types'
import { isLgbDump, predict, type LgbDump } from './heatModel'
import { getDerived } from './derived'

let modelPromise: Promise<LgbDump | null> | null = null
export function loadHeatModel() {
  modelPromise ??= loadOptional<unknown>('heat_model.json').then((m) => (isLgbDump(m) ? m : null))
  return modelPromise
}

/** undefined while loading, null when the file is missing. */
export function useHeatModel(): LgbDump | null | undefined {
  const [m, setM] = useState<LgbDump | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    loadHeatModel().then((x) => alive && setM(x))
    return () => { alive = false }
  }, [])
  return m
}

// Inner Harbor reference point used by the pipeline's `distHarborKm` feature (plan §5.1).
const HARBOR: [number, number] = [39.2856, -76.6081]
function distKm([lat, lng]: number[]) {
  const R = 6371, rad = Math.PI / 180
  const dLat = (lat - HARBOR[0]) * rad, dLng = (lng - HARBOR[1]) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(HARBOR[0] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

type Ctx = {
  nbHexes: Hex[]
  /** hexes whose prediction can change: the neighborhood plus a 3-ring (lag features) */
  affected: Hex[]
  disk1: Map<string, string[]>
  disk3: Map<string, string[]>
  base: Map<string, number>
}
const ctxCache = new WeakMap<AppData, Map<string, Ctx>>()

function featureRow(model: LgbDump, h: Hex, ctx: Ctx, canopyOf: (id: string) => number, byId: Map<string, Hex>) {
  const lag = (ids: string[], f: (id: string) => number) => {
    let s = 0
    for (const id of ids) s += f(id)
    return ids.length ? s / ids.length : NaN
  }
  const imperv = (id: string) => byId.get(id)?.imperv ?? 0
  const d1 = ctx.disk1.get(h.h3) ?? [h.h3]
  const d3 = ctx.disk3.get(h.h3) ?? [h.h3]
  return model.feature_names.map((f) => {
    switch (f) {
      case 'canopy': return canopyOf(h.h3)
      case 'canopyLag1': return lag(d1, canopyOf)
      case 'canopyLag3': return lag(d3, canopyOf)
      case 'impervLag1': return lag(d1, imperv)
      case 'impervLag3': return lag(d3, imperv)
      case 'distHarborKm': return distKm(cellToLatLng(h.h3))
      default: {
        // Any other feature the hex carries (imperv, bldg, road, ...); missing ones go down LightGBM's
        // default branch.
        const v = (h as unknown as Record<string, unknown>)[f]
        return typeof v === 'number' ? v : NaN
      }
    }
  })
}

function getCtx(d: AppData, model: LgbDump, nb: string): Ctx {
  let m = ctxCache.get(d)
  if (!m) ctxCache.set(d, (m = new Map()))
  const hit = m.get(nb)
  if (hit) return hit
  const nbHexes = getDerived(d).hexesByNb.get(nb) ?? []
  const affectedIds = new Set<string>()
  for (const h of nbHexes) for (const id of gridDisk(h.h3, 3)) if (d.hexById.has(id)) affectedIds.add(id)
  const affected = [...affectedIds].map((id) => d.hexById.get(id)!)
  const inData = (ids: string[]) => ids.filter((id) => d.hexById.has(id))
  const ctx: Ctx = {
    nbHexes,
    affected,
    disk1: new Map(affected.map((h) => [h.h3, inData(gridDisk(h.h3, 1))])),
    disk3: new Map(affected.map((h) => [h.h3, inData(gridDisk(h.h3, 3))])),
    base: new Map(),
  }
  const canopy0 = (id: string) => d.hexById.get(id)?.canopy ?? 0
  for (const h of affected) ctx.base.set(h.h3, predict(model, featureRow(model, h, ctx, canopy0, d.hexById)))
  m.set(nb, ctx)
  return ctx
}

export type WhatIfResult = {
  method: 'model' | 'linear'
  /** h3 → °F change (neighborhood hexes, plus spill-over hexes for the model) */
  deltas: Map<string, number>
  /** mean °F change over the neighborhood's hexes */
  meanDelta: number
}

/**
 * Shift every hex in `nb` by the same number of canopy points so the neighborhood's mean hex canopy
 * becomes `target` (clamped to 0–1 per hex), then re-predict.
 */
export function whatIf(d: AppData, model: LgbDump | null, nb: string, target: number): WhatIfResult | null {
  const nbHexes = getDerived(d).hexesByNb.get(nb)
  if (!nbHexes?.length) return null
  const mean0 = nbHexes.reduce((a, h) => a + h.canopy, 0) / nbHexes.length
  const shift = target - mean0
  const newCanopy = new Map(nbHexes.map((h) => [h.h3, Math.min(1, Math.max(0, h.canopy + shift))]))
  const deltas = new Map<string, number>()

  if (!model) {
    const slope = d.stats.model.pdFPer10pct // °F per +10 points canopy
    for (const h of nbHexes) deltas.set(h.h3, (slope * ((newCanopy.get(h.h3) as number) - h.canopy)) / 0.1)
    const meanDelta = nbHexes.reduce((a, h) => a + (deltas.get(h.h3) as number), 0) / nbHexes.length
    return { method: 'linear', deltas, meanDelta }
  }

  const ctx = getCtx(d, model, nb)
  const canopy1 = (id: string) => newCanopy.get(id) ?? d.hexById.get(id)?.canopy ?? 0
  for (const h of ctx.affected) {
    const p = predict(model, featureRow(model, h, ctx, canopy1, d.hexById))
    deltas.set(h.h3, p - (ctx.base.get(h.h3) as number))
  }
  const meanDelta = nbHexes.reduce((a, h) => a + (deltas.get(h.h3) ?? 0), 0) / nbHexes.length
  return { method: 'model', deltas, meanDelta }
}
