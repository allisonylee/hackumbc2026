// Plan-tab-only UI state (kept out of the shared store on purpose).
import { create } from 'zustand'

type PlanUi = {
  /** Sprout birth time per planned site id (performance.now() timeline). */
  births: Map<string, number>
  lastBirth: number
  setBirths: (b: Map<string, number>, lastBirth: number) => void
  robust: boolean
  setRobust: (on: boolean) => void
  robustIds: Set<string> | null
  robustComputing: boolean
  setRobustIds: (ids: Set<string> | null, computing?: boolean) => void
}

export const usePlanUi = create<PlanUi>()((set) => ({
  births: new Map(),
  lastBirth: 0,
  setBirths: (births, lastBirth) => set({ births, lastBirth }),
  robust: false,
  setRobust: (robust) => set({ robust }),
  robustIds: null,
  robustComputing: false,
  setRobustIds: (robustIds, robustComputing = false) => set({ robustIds, robustComputing }),
}))
