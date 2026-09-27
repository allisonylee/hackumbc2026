// State local to the Learn tab, shared between the story UI and its map layers.
import { create } from 'zustand'
import type { Params, Result } from '@/lib/types'
import type { LngLat } from './helpers'

export type TurnRuns = { params: Params; random: Result; optimized: Result; ms: number }

type LearnState = {
  /** Beat 7: random baseline vs. optimized, same budget. */
  turn: TurnRuns | null
  turnPhase: 'random' | 'optimized'
  error: string | null
  /** How to help: highlighted sites and where the search started. */
  help: { siteIds: string[]; origin: LngLat | null; nb: string | null }
  set: (s: Partial<Omit<LearnState, 'set'>>) => void
}

export const useLearn = create<LearnState>()((set) => ({
  turn: null,
  turnPhase: 'random',
  error: null,
  help: { siteIds: [], origin: null, nb: null },
  set: (s) => set(s),
}))
