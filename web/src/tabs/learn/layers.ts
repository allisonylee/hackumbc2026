import { EMPTY_TAB_LAYERS, type TabLayers } from '@/map/types'

// Placeholder; the Learn lane builds this (§9.1).
export function useLearnLayers(active: boolean): TabLayers {
  void active
  return EMPTY_TAB_LAYERS
}
