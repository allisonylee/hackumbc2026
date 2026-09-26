// Right panel (§8.4): impact tiles, Pareto chart, baselines, export, evaluation link.
import { ClipboardCheck } from 'lucide-react'
import { useStore } from '@/store'
import { StatTile } from '@/components/StatTile'
import { fmtCompact, fmtInt, fmtPct, fmtUsd } from '@/lib/format'
import { ParetoChart } from './ParetoChart'
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
      <StatTile label="Trees" value={i.trees} accent="#4ade80" hint={`on ${fmtInt(blocks)} blocks`} />
      <StatTile label="Spent" value={i.spent} format={(n) => fmtUsd(n)} hint={`of ${fmtUsd(budget)}`} />
      <StatTile label="Avg cooling" value={i.avgFTargeted} format={(n) => `−${n.toFixed(2)}°F`} accent="#2dd4bf" hint="in targeted blocks" />
      <StatTile label="Expected to survive" value={i.expectedSurviving} format={fmtInt} hint={`of ${fmtInt(i.trees)} planted`} />
      <StatTile label="Residents reached" value={i.residents} format={fmtCompact} hint="live in targeted blocks" />
      <StatTile label="To low-income" value={i.shareLowIncome} format={(n) => fmtPct(n)} accent="#a78bfa" hint="share of cooling" />
      <StatTile label="In HOLC C/D" value={i.shareHolcCD} format={(n) => fmtPct(n)} hint="share of trees, redlined areas" />
      <StatTile label="CO₂ stored" value={i.co2LbYr} format={(n) => `${fmtCompact(n)} lb`} hint={`per year ${horizon}`} />
      <StatTile label="Stormwater" value={i.stormGalYr} format={(n) => `${fmtCompact(n)} gal`} hint={`per year ${horizon}`} />
      <StatTile label="Benefits" value={i.benefitUsdYr} format={(n) => fmtUsd(n)} hint={`per year ${horizon}`} />
      <StatTile label="Cooling delivered" value={i.coolingPersonF} format={fmtCompact} hint="person-°F" />
    </div>
  )
}

export function ImpactPanel() {
  const setDialog = useStore((s) => s.setDialog)
  return (
    <div className="space-y-3">
      <ImpactTiles />
      <H>Equity vs. cooling</H>
      <ParetoChart />
      <H>Compared with simple strategies</H>
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
