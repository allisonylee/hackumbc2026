// Camera framing for the Learn tab: keep targets in the part of the map not covered by the text column.
import { useEffect, useState } from 'react'
import type { CameraView } from '@/lib/views'
import { fitView, offsetCamera, type LngLat } from './helpers'

export const NAV_H = 64

export type CameraSpec =
  | { kind: 'point'; center: LngLat; zoom: number; pitch: number; bearing: number }
  | { kind: 'fit'; bounds: [[number, number], [number, number]]; pitch: number; bearing: number; zoomDelta?: number; maxZoom?: number }

export type Viewport = { w: number; h: number; desktop: boolean; column: number }

/** Window size, and the width of the text column on desktop (0 on mobile, where cards sit at the bottom). */
export function useViewport(): Viewport {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const desktop = vp.w >= 768
  const column = desktop ? Math.round(Math.min(460, vp.w * 0.4)) + 32 : 0
  return { ...vp, desktop, column }
}

/** Resolve a camera spec to a view centered in the free map area (right of the column, or above the cards). */
export function resolveCamera(spec: CameraSpec, vp: Viewport): CameraView {
  const freeW = vp.w - vp.column
  const freeH = vp.desktop ? vp.h - NAV_H : vp.h * 0.5 - NAV_H
  let view: CameraView
  if (spec.kind === 'point') {
    view = { longitude: spec.center[0], latitude: spec.center[1], zoom: spec.zoom, pitch: spec.pitch, bearing: spec.bearing }
  } else {
    const f = fitView(spec.bounds, freeW * 0.9, freeH * 0.9, spec.maxZoom ?? 16)
    // Pitched views show more ground toward the horizon, so zoom in a little.
    view = { ...f, zoom: f.zoom + (spec.zoomDelta ?? 0) + spec.pitch / 150, pitch: spec.pitch, bearing: spec.bearing }
  }
  return vp.desktop ? offsetCamera(view, vp.column / 2, NAV_H / 2) : offsetCamera(view, 0, -(vp.h * 0.25) + NAV_H / 2)
}
