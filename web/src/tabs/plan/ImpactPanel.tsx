// Right panel (§8.4): impact tiles, plan vs. random, evaluation link.
import { ClipboardCheck } from 'lucide-react'
import { useStore } from '@/store'
import { StatTile } from '@/components/StatTile'
import { fmtCompact, fmtInt, fmtUsd } from '@/lib/format'
import { BaselinesTable } from './BaselinesTable'

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-1 text-[11px] font-medium tracking-wider text-white/50 uppercase">{children}</h3>
}

export function ImpactTiles() {
  const result = useStore((s) => s.plan.result)
  const budget = useStore((s) => s.plan.params.budget)
  const years = useStore((s) => s.plan.params.years)
  if (!result) return <div className="py-6 text-center text-xs text-white/40">Optimizing…</div>
  const i = result.impact
  const blocks = Object.keys(result.perHex).length
  const horizon = years === 0 ? 'in the planting year' : `at ${years} years`
  return (
    <div className="grid grid-cols-2 gap-2">
      <StatTile fast label="Trees" value={i.trees} accent="#4ade80" hint={`on ${fmtInt(blocks)} blocks`} />
      <StatTile fast label="Spent" value={i.spent} format={(n) => fmtUsd(n)} hint={`of ${fmtUsd(budget)}`} />
      <StatTile fast label="Expected to survive" value={i.expectedSurviving} format={fmtInt} hint={`of ${fmtInt(i.trees)} planted`} />
      <StatTile fast label="CO₂ stored" value={i.co2LbYr} format={(n) => `${fmtCompact(n)} lb`} hint={`per year ${horizon}`} />
      <StatTile fast label="Stormwater" value={i.stormGalYr} format={(n) => `${fmtCompact(n)} gal`} hint={`per year ${horizon}`} />
      <StatTile fast label="Benefits" value={i.benefitUsdYr} format={(n) => fmtUsd(n)} hint={`per year ${horizon}`} />
      <StatTile fast label="Cooling delivered" value={i.coolingPersonF} format={fmtCompact} hint="people × °F" className="col-span-2" />
    </div>
  )
}

export function ImpactPanel() {
  const setDialog = useStore((s) => s.setDialog)
  return (
    <div className="space-y-3">
      <ImpactTiles />
      <H>Compared with random planting</H>
      <BaselinesTable />
      <button
        type="button"
        onClick={() => setDialog('evaluation', true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/85 hover:bg-white/10"
      >
        <ClipboardCheck className="size-4 text-canopy" aria-hidden /> Impact &amp; Evaluation
      </button>
    </div>
  )
}
