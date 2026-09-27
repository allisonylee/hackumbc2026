import { useStore } from '@/store'
import { useCurrentLayers } from '@/tabs/current/layers'
import { useLearnLayers } from '@/tabs/learn/layers'
import { usePlanLayers } from '@/tabs/plan/layers'
import { useBaseLayers } from './baseLayers'
import type { TabLayers } from './types'

/** Base layers + the active tab's layers. Each tab hook receives `active` and should return quickly when false. */
export function useLayers(): TabLayers {
  const store = useStore((s) => s.tab)
  const home = useStore((s) => s.home)
  // Behind the homepage no tab is active, so the map is ready but the layers (and their rise) wait.
  const tab = home ? null : store
  const base = useBaseLayers()
  const current = useCurrentLayers(tab === 'current')
  const plan = usePlanLayers(tab === 'plan')
  const learn = useLearnLayers(tab === 'learn')
  const active = tab === 'current' ? current : tab === 'plan' ? plan : learn
  return { layers: [...base, ...active.layers], getTooltip: active.getTooltip }
}
