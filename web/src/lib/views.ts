export type CameraView = {
  longitude: number
  latitude: number
  zoom: number
  pitch?: number
  bearing?: number
  duration?: number
}

export const CITY_VIEW: CameraView = { longitude: -76.615, latitude: 39.3, zoom: 11.3, pitch: 50, bearing: -15 }

/** Default camera per tab; switching tabs animates to these. */
export const TAB_VIEWS = {
  current: CITY_VIEW,
  plan: { longitude: -76.62, latitude: 39.305, zoom: 11.6, pitch: 0, bearing: 0 },
  learn: { longitude: -76.615, latitude: 39.3, zoom: 11.1, pitch: 45, bearing: -10 },
} satisfies Record<string, CameraView>

export const BALTIMORE_BOUNDS: [[number, number], [number, number]] = [[-76.9, 39.1], [-76.35, 39.47]]
