import { useCallback, useEffect, useRef } from 'react'
import { Map, useControl, type MapRef } from 'react-map-gl/maplibre'
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox'
import type { Map as MLMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibregl from '@/lib/maplibre'
import { useStore } from '@/store'
import { CITY_VIEW, TAB_VIEWS, type CameraView } from '@/lib/views'
import { useLayers } from './useLayers'

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

function DeckGLOverlay(props: MapboxOverlayProps) {
  const overlay = useControl(() => new MapboxOverlay(props))
  overlay.setProps(props)
  return null
}

/** Satellite basemap (Esri World Imagery) and OpenFreeMap 3D buildings, toggled from the store. */
function addExtraSources(map: MLMap, labelLayerId: string | undefined) {
  if (!map.getSource('esri-imagery')) {
    map.addSource('esri-imagery', {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    })
    // Insert right above the background so all vector layers draw on top.
    const firstNonBg = map.getStyle().layers.find((l) => l.type !== 'background')?.id
    map.addLayer({ id: 'esri-imagery', type: 'raster', source: 'esri-imagery', layout: { visibility: 'none' } }, firstNonBg)
  }
  if (!map.getSource('openfreemap')) {
    map.addSource('openfreemap', {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a>',
    })
    map.addLayer(
      {
        id: '3d-buildings',
        type: 'fill-extrusion',
        source: 'openfreemap',
        'source-layer': 'building',
        minzoom: 14,
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': '#1f2a27',
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, ['coalesce', ['get', 'render_height'], 8]],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.8,
        },
      },
      labelLayerId,
    )
  }
}

export function MapCanvas() {
  const mapRef = useRef<MapRef>(null)
  const tab = useStore((s) => s.tab)
  const { buildings, satellite, labelLayerId } = useStore((s) => s.map)
  const setMap = useStore((s) => s.setMap)
  const registerCamera = useStore((s) => s.registerCamera)
  const { layers, getTooltip } = useLayers()

  const onLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    if (!map) return
    const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
    addExtraSources(map, firstSymbol)
    setMap({ labelLayerId: firstSymbol })
    registerCamera({
      flyTo: (v: CameraView) =>
        map.flyTo({
          center: [v.longitude, v.latitude],
          zoom: v.zoom,
          pitch: v.pitch ?? map.getPitch(),
          bearing: v.bearing ?? map.getBearing(),
          duration: v.duration ?? 1800,
          essential: true,
        }),
      fitBounds: (b, opts) =>
        map.fitBounds(b, { padding: opts?.padding ?? 80, pitch: opts?.pitch ?? map.getPitch(), duration: opts?.duration ?? 1600 }),
    })
    // Debug/inspection hook (read-only use from the browser console).
    ;(window as unknown as { __map?: MLMap }).__map = map
  }, [registerCamera, setMap])

  // Toggle basemap extras.
  useEffect(() => {
    const map = mapRef.current?.getMap()
    if (!map || !labelLayerId || !map.getLayer('3d-buildings')) return
    map.setLayoutProperty('3d-buildings', 'visibility', buildings ? 'visible' : 'none')
    map.setLayoutProperty('esri-imagery', 'visibility', satellite ? 'visible' : 'none')
  }, [buildings, satellite, labelLayerId])

  // Animate the camera to the tab's default view when the tab changes (skip the first render).
  const firstTab = useRef(true)
  useEffect(() => {
    if (firstTab.current) {
      firstTab.current = false
      return
    }
    useStore.getState().flyTo({ ...TAB_VIEWS[tab], duration: 1400 })
  }, [tab])

  const onMove = useCallback(
    (e: { viewState: { zoom: number } }) => {
      const z = Math.round(e.viewState.zoom * 4) / 4
      if (z !== useStore.getState().map.zoom) setMap({ zoom: z })
    },
    [setMap],
  )

  const initial = TAB_VIEWS[useStore.getState().tab] ?? CITY_VIEW

  return (
    <div className="absolute inset-0">
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        initialViewState={initial}
        maxPitch={75}
        minZoom={9.5}
        mapStyle={STYLE}
        onLoad={onLoad}
        onMove={onMove}
        attributionControl={{ compact: true }}
      >
        <DeckGLOverlay layers={layers} interleaved getTooltip={getTooltip} />
      </Map>
    </div>
  )
}
