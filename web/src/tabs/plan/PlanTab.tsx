// Tab 2: Plan (§8). Left: controls. Right: impact. Bottom center: site card + legend. Map layers in layers.ts.
import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { Panel } from '@/components/Panel'
import { ContinuousLegend } from '@/components/Legend'
import { RAMPS } from '@/lib/colors'
import { Controls } from './Controls'
import { ImpactPanel } from './ImpactPanel'
import { ExportMenu } from './ExportMenu'
import { SiteCard } from './SiteCard'
import { usePlanRunner } from './usePlanRunner'
import { usePlanUi } from './planUi'

const wide = (px: number) => typeof window === 'undefined' || window.innerWidth >= px

function MapLegend() {
  const view = usePlanUi((s) => s.view)
  const hasPlan = useStore((s) => !!s.plan.result?.siteIds.length)
  if (view !== 'cooling') return <ContinuousLegend title={view === 'canopyNow' ? 'Tree canopy now' : 'Canopy with the plan'} ramp={RAMPS.canopy} lo="0%" hi="60%+" />
  return (
    <div className="flex flex-wrap items-end gap-4">
      {hasPlan && <ContinuousLegend title="Planned cooling per block" ramp={RAMPS.cooling} lo="less" hi="more" />}
      <ContinuousLegend title={hasPlan ? 'Heat (unplanted blocks)' : 'Afternoon heat'} ramp={RAMPS.heat} lo="cooler" hi="hotter" className="opacity-80" />
      {hasPlan && (
        <div className="flex items-center gap-1.5 text-[11px] text-white/60">
          <span className="size-2.5 rounded-full bg-canopy" aria-hidden /> planned tree
        </div>
      )}
    </div>
  )
}

export default function PlanTab() {
  usePlanRunner()
  const [leftOpen] = useState(() => wide(768))
  const [rightOpen] = useState(() => wide(1024))

  // Close the site card with Escape, and when leaving the tab.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useStore.getState().setSelectedSite(null)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      useStore.getState().setSelectedSite(null)
    }
  }, [])

  return (
    <>
      <Panel
        title="Plan new trees"
        collapsible
        defaultOpen={leftOpen}
        className="absolute top-[72px] left-4 w-[calc(100%-2rem)] md:w-80"
        bodyClassName="pr-2"
      >
        <div className="max-h-[calc(40dvh)] overflow-y-auto pr-2 md:max-h-[calc(100dvh-148px)]">
          <Controls />
        </div>
      </Panel>

      <Panel
        title="Impact"
        actions={<ExportMenu />}
        collapsible
        defaultOpen={rightOpen}
        className="absolute right-4 bottom-4 w-[calc(100%-2rem)] md:top-[72px] md:bottom-auto md:w-[340px]"
        bodyClassName="pr-2"
      >
        <div className="max-h-[calc(40dvh)] overflow-y-auto pr-2 md:max-h-[calc(100dvh-148px)]">
          <ImpactPanel />
        </div>
      </Panel>

      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 px-4 max-md:bottom-20 lg:px-[360px]">
        <SiteCard />
        <div className="glass pointer-events-auto hidden px-3 py-2 md:block">
          <MapLegend />
        </div>
      </div>
    </>
  )
}
