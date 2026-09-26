// MapLibre's default UMD build inlines its worker from function source, which Vite's dep
// prebundling breaks in dev ("Worker failed to load"). The CSP build + explicit worker URL
// works identically in dev and prod. Pass this as <Map mapLib={maplibregl}>.
import maplibregl from 'maplibre-gl/dist/maplibre-gl-csp'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-csp-worker?url'

maplibregl.setWorkerUrl(workerUrl)

export default maplibregl
