import { useEffect } from 'react'
import { useStore } from '@/store'
import { ControlBar } from './ControlBar'
import { MapLegend } from './MapLegend'
import { ModelCardDialog } from './ModelCard'
import { NeighborhoodCard } from './NeighborhoodCard'
import { StatsPanel } from './StatsPanel'
import { Timelapse } from './Timelapse'
import { loadHeatModel } from './whatIf'

/** Tab 1 (plan §7): controls + neighborhood card on the left, legend bottom-left, stats on the right. */
export default function CurrentTab() {
  useEffect(() => {
    // Warm the optional model file so the what-if slider is ready when a card opens.
    loadHeatModel()
    return () => {
      // Leaving the tab: stop the time-lapse so the Plan/Learn tabs start clean.
      const s = useStore.getState()
      if (s.current.timelapse) s.setCurrent({ timelapse: null })
    }
  }, [])

  return (
    <>
      <div className="pointer-events-none absolute top-16 bottom-4 left-4 flex w-[calc(100%-2rem)] max-w-[23rem] flex-col gap-3">
        <ControlBar />
        <div className="flex min-h-0 flex-1 flex-col">
          <NeighborhoodCard />
        </div>
        <div className="shrink-0">
          <MapLegend />
        </div>
      </div>
      <StatsPanel />
      <Timelapse />
      <ModelCardDialog />
    </>
  )
}
