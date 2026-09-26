import type { LayersList, PickingInfo } from '@deck.gl/core'

export type Tooltip = null | string | { html?: string; text?: string; className?: string; style?: Partial<CSSStyleDeclaration> }

/** What each tab contributes to the shared map. */
export type TabLayers = {
  layers: LayersList
  getTooltip?: (info: PickingInfo) => Tooltip
}

export const EMPTY_TAB_LAYERS: TabLayers = { layers: [] }

/**
 * Interleaved-mode placement: spread into deck layer props (`...before(beforeId)`) to draw the layer below
 * the basemap's labels. deck.gl's MapboxOverlay reads `beforeId` at runtime, but the prop isn't typed.
 */
export const before = (beforeId: string | undefined) => ({ beforeId }) as object
