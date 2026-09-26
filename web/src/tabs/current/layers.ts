import { useMemo } from 'react'
import { H3HexagonLayer } from '@deck.gl/geo-layers'
import { useStore } from '@/store'
import { RAMPS } from '@/lib/colors'
import type { Hex } from '@/lib/types'
import { before, EMPTY_TAB_LAYERS, type TabLayers } from '@/map/types'

// Placeholder from the foundation step; the Current State lane replaces this (§7.1).
export function useCurrentLayers(active: boolean): TabLayers {
  const hexes = useStore((s) => s.data?.hexes)
  const beforeId = useStore((s) => s.map.labelLayerId)
  return useMemo(() => {
    if (!active || !hexes) return EMPTY_TAB_LAYERS
    return {
      layers: [
        new H3HexagonLayer<Hex>({
          id: 'hex-current', data: hexes, getHexagon: (d) => d.h3, extruded: true, coverage: 0.9,
          elevationScale: 40, getElevation: (d) => Math.max(0, d.heatAnom),
          getFillColor: (d) => [...RAMPS.canopy(d.canopy / 0.6), 190] as [number, number, number, number],
          pickable: true, autoHighlight: true, ...before(beforeId),
        }),
      ],
    }
  }, [active, hexes, beforeId])
}
