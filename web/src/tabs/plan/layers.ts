import { EMPTY_TAB_LAYERS, type TabLayers } from '@/map/types'

// Placeholder; the Plan lane builds this (§8.3).
export function usePlanLayers(active: boolean): TabLayers {
  void active
  return EMPTY_TAB_LAYERS
}
