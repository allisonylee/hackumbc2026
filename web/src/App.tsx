import { useEffect, useState } from 'react'
import { Map, useControl } from 'react-map-gl/maplibre'
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox'
import { H3HexagonLayer } from '@deck.gl/geo-layers'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibregl from '@/lib/maplibre'

// Hello-map placeholder from repo setup (§2). Replaced by the real app shell in §6.

type Hex = { h3: string; nb: string; canopy: number; heatAnom: number }

const FILES = [
  'hexes.json', 'sites.json', 'neighborhoods.geojson', 'holc.geojson',
  'stats.json', 'species.json', 'footprint.json',
]

function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl(() => new MapboxOverlay(props))
  overlay.setProps(props)
  return null
}

export default function App() {
  const [hexes, setHexes] = useState<Hex[]>([])
  const [status, setStatus] = useState('Loading data…')

  useEffect(() => {
    Promise.all(FILES.map((f) => fetch(`/data/${f}`).then((r) => {
      if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`)
      return r.json()
    })))
      .then(([hx, sites]) => {
        setHexes(hx)
        setStatus(`${hx.length.toLocaleString()} hexes · ${sites.length.toLocaleString()} sites`)
      })
      .catch((e) => setStatus(`Data failed to load: ${e.message}`))
  }, [])

  const layers = [
    new H3HexagonLayer<Hex>({
      id: 'hex', data: hexes, getHexagon: (d) => d.h3, extruded: true, coverage: 0.92,
      elevationScale: 40, getElevation: (d) => Math.max(0, d.heatAnom + 5),
      getFillColor: (d) => [255 * (1 - d.canopy), 80 + 175 * d.canopy, 90, 220],
      pickable: true, autoHighlight: true,
    }),
  ]

  return (
    <div className="fixed inset-0">
      <Map
        initialViewState={{ longitude: -76.615, latitude: 39.3, zoom: 11.3, pitch: 50, bearing: -15 }}
        maxPitch={75}
        mapLib={maplibregl}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
      >
        <DeckGLOverlay layers={layers} interleaved />
      </Map>
      <div className="absolute top-4 left-4 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white backdrop-blur-md">
        <div className="font-semibold">Baltimore Tree Planner</div>
        <div className="text-white/70">{status}</div>
      </div>
    </div>
  )
}
