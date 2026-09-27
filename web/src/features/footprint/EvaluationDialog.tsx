import type { ReactNode } from 'react'
import { ClipboardCheck, FlaskConical, Gauge, ShieldAlert, Sprout, Target } from 'lucide-react'
import { useStore } from '@/store'
import type { Stats } from '@/lib/types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatTile } from '@/components/StatTile'
import { featureLabel, fmtInt, fmtPct, fmtUsd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Bullets, DIALOG_CLASS, MockNote, Section, SourceLink, TABLE_CELL, TABLE_HEAD } from './parts'

/** Outcome metrics and how to measure them (research.md §7). */
const METRICS: { metric: string; source: ReactNode; cadence: string }[] = [
  {
    metric: 'Canopy % change per neighborhood',
    source: 'Chesapeake Conservancy 1 m land cover (next edition); city tree-canopy assessments',
    cadence: 'every 3–5 years',
  },
  { metric: 'Street-level heat', source: 'Repeat NOAA / CAPA Heat Watch campaign; Baltimore heat sensors', cadence: 'each summer' },
  { metric: 'Trees planted and surviving', source: 'Baltimore Forestry tree inventory (live): species and condition changes', cadence: 'quarterly' },
  { metric: 'Equity share', source: 'Share of new trees and cooling in low-income and HOLC C/D blocks', cadence: 'quarterly' },
  { metric: 'Health proxies', source: 'CDC PLACES asthma; heat-related ER visits (Maryland Dept. of Health)', cadence: 'yearly (long lag)' },
  { metric: 'Community engagement', source: 'Tree requests and volunteer sign-ups through the app’s referral links', cadence: 'monthly' },
]

const LIT = {
  zaerpour: { label: 'Zaerpour et al. 2025', url: 'https://www.nature.com/articles/s42949-025-00277-x' },
  meta: { label: 'meta-analysis, Environ. Res. Lett. 2021', url: '' },
}
/** A temperature *difference* in °C → °F (no offset). */
const dC2F = (c: number) => c * 1.8

export default function EvaluationDialog() {
  const open = useStore((s) => s.dialogs.evaluation)
  const setDialog = useStore((s) => s.setDialog)
  return (
    <Dialog open={open} onOpenChange={(o) => setDialog('evaluation', o)}>
      <DialogContent className={DIALOG_CLASS}>
        <DialogHeader className="border-b border-white/10 px-5 pt-4 pb-3">
          <DialogTitle className="flex items-center gap-2 font-display text-lg font-semibold text-white">
            <ClipboardCheck className="size-5 text-emerald-400" aria-hidden /> Impact &amp; evaluation
          </DialogTitle>
          <DialogDescription className="text-white/55">
            How we'd know this works: what to measure, how well the heat model holds up, and a realistic pilot.
          </DialogDescription>
        </DialogHeader>
        {open && <Body />}
      </DialogContent>
    </Dialog>
  )
}

function Body() {
  const stats = useStore((s) => s.data?.stats)
  const impact = useStore((s) => s.plan.result?.impact)
  if (!stats) return null
  return (
    <Tabs defaultValue="metrics" className="min-h-0 flex-1 gap-0">
      <div className="border-b border-white/10 px-5 py-2">
        <TabsList className="bg-white/[0.06]">
          <TabsTrigger value="metrics">Impact metrics</TabsTrigger>
          <TabsTrigger value="model">Model validation</TabsTrigger>
          <TabsTrigger value="pilot">Pilot &amp; risks</TabsTrigger>
        </TabsList>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {stats.mock && <div className="mb-4"><MockNote show /></div>}
        <TabsContent value="metrics" className="space-y-6">
          <Section title="Outputs of the current plan" icon={<Sprout className="size-4 text-emerald-400" aria-hidden />}>
            {impact ? (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <StatTile label="Trees planned" value={impact.trees} accent="#4ade80" />
                <StatTile label="Cost" value={impact.spent} format={(n) => fmtUsd(n)} />
                <StatTile label="In low-income areas" value={impact.shareLowIncome} format={(n) => fmtPct(n)} accent="#a78bfa" />
                <StatTile label="In HOLC C/D areas" value={impact.shareHolcCD} format={(n) => fmtPct(n)} accent="#a78bfa" />
              </div>
            ) : (
              <p className="text-sm text-white/50">Run a plan on the Plan tab to see its trees, cost and equity share here.</p>
            )}
          </Section>
          <Section title="Outcomes to track" icon={<Target className="size-4 text-emerald-400" aria-hidden />}>
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className={TABLE_HEAD}>Metric</TableHead>
                  <TableHead className={TABLE_HEAD}>Data source</TableHead>
                  <TableHead className={TABLE_HEAD}>Cadence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {METRICS.map((m) => (
                  <TableRow key={m.metric} className="border-white/10 hover:bg-white/[0.03]">
                    <TableCell className={cn(TABLE_CELL, 'font-medium text-white')}>{m.metric}</TableCell>
                    <TableCell className={cn(TABLE_CELL, 'text-xs')}>{m.source}</TableCell>
                    <TableCell className={cn(TABLE_CELL, 'text-xs whitespace-nowrap')}>{m.cadence}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        </TabsContent>

        <TabsContent value="model" className="space-y-6">
          <ModelValidation stats={stats} />
        </TabsContent>

        <TabsContent value="pilot" className="space-y-6">
          <Section title="Pilot plan" icon={<FlaskConical className="size-4 text-emerald-400" aria-hidden />}>
            <Bullets
              items={[
                'Share the plan with TreeBaltimore and Baltimore Tree Trust, and pilot one planting season: about 100 tree wells in 2–3 neighborhoods chosen with a partner organization.',
                'Compare against business-as-usual siting on tree survival, street-level heat (sensors on pilot and comparison blocks) and resident engagement.',
                'Close the loop with residents: they can flag pits or request trees, and neighborhood associations get a printable plan for their area.',
              ]}
            />
          </Section>
          <Section title="Risks we take seriously" icon={<ShieldAlert className="size-4 text-amber-300" aria-hidden />}>
            <Bullets
              items={[
                <><b className="font-medium text-white">Green gentrification.</b> New trees can raise rents; pair planting with anti-displacement partners.</>,
                <><b className="font-medium text-white">Resident consent.</b> Some residents refuse street trees over upkeep or sidewalk damage, and Baltimore has a history of refusals. Plant with people, not at them.</>,
                <><b className="font-medium text-white">Maintenance.</b> Young trees need about two years of watering; a planted tree that dies helps no one.</>,
                <><b className="font-medium text-white">Data limits.</b> The heat model learns from a single afternoon of air temperature (not surface temperature), so it shows the pattern on one hot day, not every day.</>,
              ]}
            />
          </Section>
        </TabsContent>
      </div>
    </Tabs>
  )
}

function R2Bar({ label, value, color, note }: { label: string; value: number; color: string; note: string }) {
  const w = Math.max(0, Math.min(1, value))
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-white/75">{label}</span>
        <span className="font-display text-base font-semibold tabular-nums" style={{ color }}>{value.toFixed(2)}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${label}: R² ${value.toFixed(2)}`}>
        <div className="h-full rounded-full" style={{ width: `${w * 100}%`, background: color }} />
      </div>
      <div className="mt-0.5 text-[11px] text-white/40">{note}</div>
    </div>
  )
}

/** Cooling per +10% canopy (°F, shown as positive cooling) on a shared scale with the literature band. */
function CoolingScale({ ours, observed, linear, litLow, litHigh }: { ours: number; observed: number; linear: number; litLow: number; litHigh: number }) {
  const max = Math.max(litHigh, ours, observed, linear) * 1.15 || 1
  const x = (v: number) => `${(Math.max(0, v) / max) * 100}%`
  const marks = [
    { v: ours, label: 'Our model (partial dependence)', color: '#4ade80' },
    { v: linear, label: 'Linear baseline', color: '#94a3b8' },
    { v: observed, label: 'Neighborhood regression (raw)', color: '#a78bfa' },
  ]
  return (
    <div>
      <div className="relative mt-2 h-8" role="img" aria-label={`Literature range ${litLow.toFixed(2)} to ${litHigh.toFixed(2)} °F; our model ${ours.toFixed(2)} °F`}>
        <div className="absolute inset-x-0 top-3.5 h-1 rounded-full bg-white/10" />
        <div className="absolute top-2 h-4 rounded bg-emerald-400/15 ring-1 ring-emerald-400/30" style={{ left: x(litLow), width: `calc(${x(litHigh)} - ${x(litLow)})` }} />
        {marks.map((m) => (
          <div key={m.label} className="absolute top-0.5 h-7 w-1 -translate-x-1/2 rounded-full" style={{ left: x(m.v), background: m.color }} title={`${m.label}: ${m.v.toFixed(2)} °F`} />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-white/35 tabular-nums">
        <span>0 °F</span>
        <span>{max.toFixed(1)} °F cooler per +10% canopy</span>
      </div>
      <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
        <li className="flex items-center gap-2 text-white/70">
          <span className="h-3 w-4 rounded-sm bg-emerald-400/15 ring-1 ring-emerald-400/30" aria-hidden />
          Literature: {litLow.toFixed(2)}–{litHigh.toFixed(2)} °F
        </li>
        {marks.map((m) => (
          <li key={m.label} className="flex items-center gap-2 text-white/70">
            <span className="h-3 w-1 rounded-full" style={{ background: m.color }} aria-hidden />
            {m.label}: <b className="font-medium tabular-nums text-white">{m.v.toFixed(2)} °F</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ModelValidation({ stats }: { stats: Stats }) {
  const { model: m, literature: lit, regression } = stats
  const litLow = dC2F(Math.min(lit.meta_C_per10, lit.zaerpour_C_per10))
  const litHigh = dC2F(Math.max(lit.meta_C_per10, lit.zaerpour_C_per10))
  const ours = -m.pdFPer10pct
  const inRange = ours >= litLow && ours <= litHigh
  const rmseGain = 1 - m.rmseSpatial / m.baselines.meanRmse
  return (
    <>
      <p className="text-xs text-white/50">
        Target: {m.target} ({m.date}). {fmtInt(m.nTrain)} hexes, {m.features.length} features (
        {m.features.slice(0, 4).map(featureLabel).join(', ')}
        {m.features.length > 4 ? ', …' : ''}). Training used {m.trainWh.toPrecision(3)} Wh.
      </p>

      <Section title="Does it predict places it hasn't seen?" icon={<Gauge className="size-4 text-emerald-400" aria-hidden />}>
        <div className="grid gap-3 md:grid-cols-2">
          <R2Bar label="Spatial cross-validation R²" value={m.r2Spatial} color="#4ade80" note="Held-out blocks of the city: the honest number." />
          <R2Bar label="Random cross-validation R²" value={m.r2Random} color="#64748b" note="Random splits leak nearby cells, so this is optimistic." />
          <R2Bar label="Linear model, spatial CV R²" value={m.baselines.linearR2Spatial} color="#94a3b8" note="Baseline: straight-line fit on the same features." />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Error (RMSE)" value={m.rmseSpatial} format={(n) => `${n.toFixed(2)}°F`} hint="spatial CV" accent="#4ade80" />
          <StatTile label="Mean abs. error" value={m.maeSpatial} format={(n) => `${n.toFixed(2)}°F`} hint="spatial CV" />
          <StatTile label="Guess-the-mean" value={m.baselines.meanRmse} format={(n) => `${n.toFixed(2)}°F`} hint={`RMSE; ours is ${fmtPct(rmseGain)} lower`} />
        </div>
      </Section>

      <Section title="Is the cooling effect physically plausible?" icon={<Sprout className="size-4 text-emerald-400" aria-hidden />}>
        <p className="text-sm text-white/70">
          Afternoon cooling from +10 percentage points of tree canopy. Our model gives{' '}
          <b className="text-emerald-300">{ours.toFixed(2)} °F</b>, {inRange ? 'inside' : 'outside'} the published range for air temperature (
          <SourceLink href={LIT.meta.url}>{LIT.meta.label}</SourceLink>: {lit.meta_C_per10} °C;{' '}
          <SourceLink href={LIT.zaerpour.url}>{LIT.zaerpour.label}</SourceLink>: {lit.zaerpour_C_per10} °C; converted to °F).
        </p>
        <CoolingScale ours={ours} observed={-regression.slopeFPer10pct} linear={-m.baselines.linearSlopeFPer10pct} litLow={litLow} litHigh={litHigh} />
      </Section>

      <Section title="Known limits">
        <Bullets
          items={[
            ...m.limitations,
            'Not yet shown: sensitivity of the plan to crown size, and a 2013→2021 backtest of canopy change vs. temperature change.',
          ]}
        />
      </Section>
    </>
  )
}
