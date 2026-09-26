import { create } from 'zustand'
import type { AppData, Baselines, Params, ParetoPoint, Result } from '@/lib/types'
import type { CameraView } from '@/lib/views'

export type Tab = 'current' | 'plan' | 'learn'
export type ColorBy = 'canopy' | 'heat' | 'income' | 'asthma' | 'model'

/** Extra facts the chat can send to the backend (see CONTRACTS.md Chat API / router). */
export type ChatContext = {
  nb?: string
  site?: { id: string; nb: string; species: string; cost: number; space: string | null; rank?: number; shap?: [string, number][] }
}

export const DEFAULT_PARAMS: Params = {
  budget: 1_000_000,
  weights: { heat: 0.6, equity: 0.6, health: 0.6, eco: 0.3 },
  equityQuota: 0,
  excludeNbs: [],
  avoidUtilities: false,
  years: 20,
}

type State = {
  data: AppData | null
  setData: (d: AppData) => void

  tab: Tab
  setTab: (t: Tab) => void

  /** Map-wide display state */
  map: {
    mode3d: boolean
    buildings: boolean
    satellite: boolean
    zoom: number
    /** first symbol layer of the basemap; deck layers use it as beforeId so labels stay on top */
    labelLayerId?: string
  }
  setMap: (m: Partial<State['map']>) => void

  hovered: { h3?: string; nb?: string }
  setHovered: (h: State['hovered']) => void
  selectedNb: string | null
  setSelectedNb: (nb: string | null) => void
  selectedSite: string | null
  setSelectedSite: (id: string | null) => void

  current: {
    colorBy: ColorBy
    modelView: 'pred' | 'resid'
    heightByHeat: boolean
    bivariate: null | 'heat' | 'income'
    layers: { holc: boolean; sites: boolean; cooling: boolean; trees: boolean }
    whatIf: { nb: string; canopy: number } | null
    timelapse: { playing: boolean; t: number } | null
  }
  setCurrent: (c: Partial<State['current']>) => void
  setCurrentLayers: (l: Partial<State['current']['layers']>) => void

  plan: {
    params: Params
    budgetMode: 'usd' | 'trees'
    result: Result | null
    pareto: ParetoPoint[] | null
    baselines: Baselines | null
    computing: boolean
    focusNb: string | null
    /** performance.now() of the last result; drives the sprout animation */
    resultAt: number
    lastRunMs: number | null
  }
  setPlan: (p: Partial<State['plan']>) => void
  setParams: (p: Partial<Params>) => void

  story: { step: number; progress: number }
  setStory: (s: Partial<State['story']>) => void

  chat: { open: boolean; prefill: string | null; context: ChatContext | null }
  openChat: (prefill?: string, context?: ChatContext) => void
  closeChat: () => void
  /** energy of the most recent chat answer, for the footprint dialog */
  lastChatEnergy: { wh: number; measured: boolean; cached: boolean; tokens: number } | null
  setLastChatEnergy: (e: State['lastChatEnergy']) => void

  dialogs: { footprint: boolean; evaluation: boolean; modelCard: boolean }
  setDialog: (d: keyof State['dialogs'], open: boolean) => void

  /** Registered by MapCanvas. A call made before the map exists is queued and replayed on registration. */
  flyTo: (v: CameraView) => void
  fitBounds: (b: [[number, number], [number, number]], opts?: { pitch?: number; padding?: number; duration?: number }) => void
  registerCamera: (fns: { flyTo: State['flyTo']; fitBounds: State['fitBounds'] }) => void
}

let pendingCamera: (() => void) | null = null

export const useStore = create<State>()((set) => ({
  data: null,
  setData: (data) => set({ data }),

  tab: 'current',
  setTab: (tab) => set({ tab }),

  map: { mode3d: true, buildings: false, satellite: false, zoom: 11.3 },
  setMap: (m) => set((s) => ({ map: { ...s.map, ...m } })),

  hovered: {},
  setHovered: (hovered) => set({ hovered }),
  selectedNb: null,
  setSelectedNb: (selectedNb) => set({ selectedNb }),
  selectedSite: null,
  setSelectedSite: (selectedSite) => set({ selectedSite }),

  current: {
    colorBy: 'canopy',
    modelView: 'pred',
    heightByHeat: true,
    bivariate: null,
    layers: { holc: false, sites: true, cooling: false, trees: true },
    whatIf: null,
    timelapse: null,
  },
  setCurrent: (c) => set((s) => ({ current: { ...s.current, ...c } })),
  setCurrentLayers: (l) => set((s) => ({ current: { ...s.current, layers: { ...s.current.layers, ...l } } })),

  plan: {
    params: DEFAULT_PARAMS,
    budgetMode: 'usd',
    result: null,
    pareto: null,
    baselines: null,
    computing: false,
    focusNb: null,
    resultAt: 0,
    lastRunMs: null,
  },
  setPlan: (p) => set((s) => ({ plan: { ...s.plan, ...p } })),
  setParams: (p) => set((s) => ({ plan: { ...s.plan, params: { ...s.plan.params, ...p } } })),

  story: { step: 0, progress: 0 },
  setStory: (st) => set((s) => ({ story: { ...s.story, ...st } })),

  chat: { open: false, prefill: null, context: null },
  openChat: (prefill, context) => set({ chat: { open: true, prefill: prefill ?? null, context: context ?? null } }),
  closeChat: () => set((s) => ({ chat: { ...s.chat, open: false } })),
  lastChatEnergy: null,
  setLastChatEnergy: (lastChatEnergy) => set({ lastChatEnergy }),

  dialogs: { footprint: false, evaluation: false, modelCard: false },
  setDialog: (d, open) => set((s) => ({ dialogs: { ...s.dialogs, [d]: open } })),

  flyTo: (v) => { pendingCamera = () => useStore.getState().flyTo(v) },
  fitBounds: (b, opts) => { pendingCamera = () => useStore.getState().fitBounds(b, opts) },
  registerCamera: ({ flyTo, fitBounds }) => {
    set({ flyTo, fitBounds })
    const p = pendingCamera
    pendingCamera = null
    p?.()
  },
}))
