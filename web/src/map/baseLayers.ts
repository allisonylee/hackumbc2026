import { useMemo } from 'react'
import { GeoJsonLayer } from '@deck.gl/layers'
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson'
import { useStore } from '@/store'
import { before } from './types'

// World-sized ring; the city polygons are cut out of it as holes.
const WORLD: Position[] = [[-80, 36], [-72, 36], [-72, 42], [-80, 42], [-80, 36]]

/** Layers shown on every tab: the dim mask outside the city boundary. */
export function useBaseLayers() {
  const city = useStore((s) => s.data?.city)
  const beforeId = useStore((s) => s.map.labelLayerId)
  return useMemo(() => {
    if (!city) return []
    const holes: Position[][] = []
    for (const f of city.features) {
      const g = f.geometry
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
      for (const p of polys) holes.push([...p[0]].reverse())
    }
    const mask: Feature<Polygon | MultiPolygon> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [WORLD, ...holes] },
    }
    return [
      new GeoJsonLayer({
        id: 'city-mask',
        data: [mask],
        filled: true,
        stroked: false,
        getFillColor: [0, 0, 0, 140],
        pickable: false,
        ...before(beforeId),
      }),
      new GeoJsonLayer({
        id: 'city-outline',
        data: city,
        filled: false,
        stroked: true,
        getLineColor: [255, 255, 255, 110],
        lineWidthUnits: 'pixels',
        getLineWidth: 1.5,
        pickable: false,
        ...before(beforeId),
      }),
    ]
  }, [city, beforeId])
}
