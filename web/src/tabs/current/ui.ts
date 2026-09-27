// Tab-local UI state and camera helpers for the Current State tab.
import { create } from 'zustand'
import { useStore } from '@/store'
import { CITY_VIEW } from '@/lib/views'
import { getDerived } from './derived'

type CurrentUi = {
  /** h3 → °F change from the what-if slider (null when inactive); `deltasKey` bumps on every change */
  deltas: Map<string, number> | null
  deltasKey: number
  setDeltas: (d: Map<string, number> | null) => void
  statsOpen: boolean
  setStatsOpen: (o: boolean) => void
}

export const useCurrentUi = create<CurrentUi>()((set) => ({
  deltas: null,
  deltasKey: 0,
  setDeltas: (deltas) => set((s) => ({ deltas, deltasKey: s.deltasKey + 1 })),
  // Closed by default so the map gets the full width; the "City stats" button opens it.
  statsOpen: false,
  setStatsOpen: (statsOpen) => set({ statsOpen }),
}))

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Hover setter that skips no-op updates (hover fires on every pointer move). */
export function setHoveredIfChanged(h: { h3?: string; nb?: string }) {
  const cur = useStore.getState().hovered
  if (cur.h3 !== h.h3 || cur.nb !== h.nb) useStore.getState().setHovered(h)
}

/** Fly to a neighborhood's bounds (pitch 55 in 3D) and open its card. */
export function focusNb(name: string) {
  const s = useStore.getState()
  if (!s.data) return
  const b = getDerived(s.data).nbBounds.get(name)
  if (b) s.fitBounds(b, { pitch: s.map.mode3d ? 55 : 0, padding: 90 })
  s.setSelectedNb(name)
}

// Last camera seen by deck's picking (updated on every pointer move over the map). The store only
// exposes flyTo, which needs a center, so the 2D/3D toggle re-uses this to change only the pitch.
let lastView: { longitude: number; latitude: number; zoom: number } | null = null
export function noteViewport(viewport: unknown) {
  const v = viewport as { longitude?: number; latitude?: number; zoom?: number } | undefined
  if (v && typeof v.longitude === 'number' && typeof v.latitude === 'number' && typeof v.zoom === 'number') {
    lastView = { longitude: v.longitude, latitude: v.latitude, zoom: v.zoom }
  }
}

export function setMode3d(mode3d: boolean) {
  const s = useStore.getState()
  s.setMap({ mode3d })
  const v = lastView ?? { longitude: CITY_VIEW.longitude, latitude: CITY_VIEW.latitude, zoom: s.map.zoom }
  s.flyTo({ ...v, pitch: mode3d ? CITY_VIEW.pitch : 0, duration: 900 })
}
