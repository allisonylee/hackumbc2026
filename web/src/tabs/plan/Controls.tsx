// Left panel (§8.2): budget, presets, weights, equity guarantee, exclusions, maturity, map view.
import { useEffect, useMemo, useRef } from 'react'
import { animate, useReducedMotion } from 'motion/react'
import { Info, Loader2 } from 'lucide-react'
import { useStore } from '@/store'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { fmtCompact, fmtInt, fmtUsd } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Params, Site, Weights } from '@/lib/types'
import { avgSiteCost } from './optimizerClient'
import { lowIncomeThreshold } from './optimizer'
import {
  BUDGET_MAX, BUDGET_MIN, PRESETS, SLIDER_STEPS, WEIGHT_KEYS, budgetToSlider, lerpWeights, matchPreset, niceBudget, sliderToBudget,
} from './logic'
import { NbExclude } from './NbExclude'
import { FocusChip } from './FocusChip'
import { usePlanUi } from './planUi'

const WEIGHT_META: Record<keyof Weights, { label: string; hint: string; range: string }> = {
  heat: { label: 'Heat', hint: 'Cooling × residents reached per dollar', range: '[&_[data-slot=slider-range]]:bg-heat' },
  equity: { label: 'Equity', hint: 'Boost for low-income, high-poverty blocks', range: '[&_[data-slot=slider-range]]:bg-equity' },
  health: { label: 'Health', hint: 'Boost for blocks with more asthma and social vulnerability', range: '[&_[data-slot=slider-range]]:bg-rose-400' },
  eco: { label: 'Other benefits (CO₂ stored, stormwater absorption, etc.)', hint: 'Flat credit per tree, wherever it is planted', range: '[&_[data-slot=slider-range]]:bg-canopy' },
}

const TREE_PACE = 10_000

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="space-y-2 border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium tracking-wider text-white/50 uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[11px] transition-colors',
        active ? 'border-canopy/60 bg-canopy/15 text-canopy' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white',
      )}
    >
      {children}
    </button>
  )
}

function BudgetControl() {
  const data = useStore((s) => s.data)
  const budget = useStore((s) => s.plan.params.budget)
  const mode = useStore((s) => s.plan.budgetMode)
  const setPlan = useStore((s) => s.setPlan)
  const setParams = useStore((s) => s.setParams)
  // avgSiteCost reads the loaded data; recompute when it changes.
  const avg = useMemo(() => (data ? avgSiteCost() : 1), [data])
  // Typical cost per site type (existing pit vs. new sidewalk cut), for the citation line.
  const typeCost = useMemo(() => {
    const out: Partial<Record<Site['type'], number>> = {}
    for (const s of data?.siteById.values() ?? []) out[s.type] ??= s.cost
    return out
  }, [data])
  const trees = budget / avg
  const pace = TREE_PACE * avg

  const onSlide = ([v]: number[]) => {
    const raw = sliderToBudget(v)
    setParams({ budget: mode === 'trees' ? Math.max(1, niceBudget(raw / avg)) * avg : niceBudget(raw) })
  }

  return (
    <Section
      title="Budget"
      action={
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          spacing={0}
          value={mode}
          onValueChange={(v) => v && setPlan({ budgetMode: v as 'usd' | 'trees' })}
          aria-label="Budget unit"
        >
          <ToggleGroupItem value="usd" className="h-6 px-2 text-[11px]">$</ToggleGroupItem>
          <ToggleGroupItem value="trees" className="h-6 px-2 text-[11px]"># trees</ToggleGroupItem>
        </ToggleGroup>
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-2xl font-semibold tabular-nums text-white">
          {mode === 'usd' ? fmtUsd(budget) : `${fmtInt(trees)} trees`}
        </span>
        <span className="text-xs text-white/50 tabular-nums">
          {mode === 'usd' ? `≈ ${fmtInt(trees)} trees` : `≈ ${fmtUsd(budget)}`}
        </span>
      </div>
      <Slider
        min={0}
        max={SLIDER_STEPS}
        step={1}
        value={[budgetToSlider(budget)]}
        onValueChange={onSlide}
        aria-label="Budget"
      />
      <div className="flex justify-between text-[10px] text-white/40 tabular-nums">
        <span>{mode === 'usd' ? fmtUsd(BUDGET_MIN) : fmtCompact(BUDGET_MIN / avg)}</span>
        <span>{mode === 'usd' ? fmtUsd(BUDGET_MAX) : fmtCompact(BUDGET_MAX / avg)}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip active={budget === 250_000} onClick={() => setParams({ budget: 250_000 })}>$250k</Chip>
        <Chip active={budget === 1_000_000} onClick={() => setParams({ budget: 1_000_000 })}>$1M</Chip>
        <Chip active={Math.abs(budget - pace) < 1} onClick={() => setParams({ budget: pace })}>
          City's yearly pace (~{fmtCompact(TREE_PACE)} trees)
        </Chip>
      </div>
      <p className="text-[10px] leading-snug text-white/40">
        Average site cost {fmtUsd(avg, false)}
        {typeCost.pit != null && typeCost.potential != null && (
          <>
            : about {fmtUsd(typeCost.pit, false)} at an existing pit, {fmtUsd(typeCost.potential, false)} if concrete must be cut
          </>
        )}
        {' '}(planting + 2 years’ care; Baltimore Tree Trust, via WYPR, 2026).
      </p>
    </Section>
  )
}

function WeightsControl() {
  const weights = useStore((s) => s.plan.params.weights)
  const setParams = useStore((s) => s.setParams)
  const reduce = useReducedMotion()
  const anim = useRef<{ stop: () => void } | null>(null)
  useEffect(() => () => anim.current?.stop(), [])

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    anim.current?.stop()
    const from = useStore.getState().plan.params.weights
    if (reduce) {
      setParams({ weights: p.weights })
      return
    }
    anim.current = animate(0, 1, {
      duration: 0.6,
      ease: 'easeOut',
      onUpdate: (t) => setParams({ weights: t >= 1 ? p.weights : lerpWeights(from, p.weights, t) }),
      onComplete: () => setParams({ weights: p.weights }),
    })
  }
  const setWeight = (k: keyof Weights, v: number) => {
    anim.current?.stop()
    setParams({ weights: { ...useStore.getState().plan.params.weights, [k]: v } })
  }

  return (
    <Section
      title="Optimize based on:"
      action={
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label="How the weights work" className="rounded p-0.5 text-white/50 hover:text-white">
              <Info className="size-3.5" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-80 space-y-1.5 text-xs leading-relaxed">
            <p><b>Yes, these move the trees.</b> Each block's value is its predicted cooling × residents, multiplied by Heat + Equity × need + Health × need.</p>
            <p>Equity and Health <b>scale</b> cooling; they never place a tree that cools no one.</p>
            <p>Only the ratios matter. Eco is a flat per-tree credit, so raising it favors cheap sites anywhere.</p>
            <p>The effect is biggest at small and medium budgets; at large budgets plans converge.</p>
            <p>The <b>equity guarantee</b> below is a hard rule, not a preference.</p>
          </PopoverContent>
        </Popover>
      }
    >
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        spacing={0}
        value={matchPreset(weights)}
        onValueChange={(v) => v && applyPreset(v)}
        className="grid w-full grid-cols-4"
        aria-label="Presets"
      >
        {PRESETS.map((p) => (
          <ToggleGroupItem key={p.id} value={p.id} className="h-9 px-1 py-1 text-[11px] leading-tight whitespace-normal data-[state=on]:bg-canopy/15 data-[state=on]:text-canopy">
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="space-y-2.5 pt-1">
        {WEIGHT_KEYS.map((k) => (
          <div key={k} className="space-y-1" title={WEIGHT_META[k].hint}>
            <div className="flex justify-between text-xs">
              <span className="text-white/80">{WEIGHT_META[k].label}</span>
              <span className="text-white/50 tabular-nums">{weights[k].toFixed(2)}</span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[weights[k]]}
              onValueChange={([v]) => setWeight(k, v)}
              aria-label={`${WEIGHT_META[k].label} weight`}
              className={WEIGHT_META[k].range}
            />
          </div>
        ))}
      </div>
    </Section>
  )
}

function RulesControl() {
  const p = useStore((s) => s.plan.params)
  const setParams = useStore((s) => s.setParams)
  const data = useStore((s) => s.data)
  const incomeCut = useMemo(() => (data ? lowIncomeThreshold(data.hexes) : null), [data])
  return (
    <>
      <Section title="Equity guarantee">
        <div className="flex justify-between text-xs">
          <span className="text-white/80">
            At least <b className="text-equity tabular-nums">{Math.round(p.equityQuota * 100)}%</b> of the budget in low-income blocks
          </span>
        </div>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[p.equityQuota]}
          onValueChange={([v]) => setParams({ equityQuota: v })}
          aria-label="Equity guarantee"
          className="[&_[data-slot=slider-range]]:bg-equity"
        />
        <p className="text-[10px] leading-snug text-white/40">
          {p.equityQuota > 0 ? 'Hard rule: filled first, whatever the cooling cost.' : 'Off. Drag to require a minimum share.'}
          {incomeCut ? ` Low-income = tract median household income below ${fmtUsd(incomeCut)}, the city median by residents.` : ''}
        </p>
      </Section>
      <Section title="Where">
        <NbExclude />
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="avoid-util" className="text-xs font-normal text-white/80">Avoid sites under power lines</Label>
          <Switch id="avoid-util" size="sm" checked={p.avoidUtilities} onCheckedChange={(v) => setParams({ avoidUtilities: v })} />
        </div>
      </Section>
      <Section title="Benefits at maturity">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          spacing={0}
          value={String(p.years)}
          onValueChange={(v) => v && setParams({ years: Number(v) as Params['years'] })}
          className="grid w-full grid-cols-3"
          aria-label="Maturity horizon"
        >
          {[0, 10, 20].map((y) => (
            <ToggleGroupItem key={y} value={String(y)} className="h-7 text-[11px]">
              {y === 0 ? 'Planting year' : `${y} years`}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>
    </>
  )
}

function ViewControl() {
  const robust = usePlanUi((s) => s.robust)
  const setRobust = usePlanUi((s) => s.setRobust)
  const robustComputing = usePlanUi((s) => s.robustComputing)
  const robustIds = usePlanUi((s) => s.robustIds)
  const trees = useStore((s) => s.plan.result?.impact.trees ?? 0)
  return (
    <Section title="Map">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="robust" className="text-xs font-normal text-white/80">
          Robust picks
          <span className="ml-1 text-white/40">(chosen in ≥80% of 20 weight tweaks)</span>
        </Label>
        <Switch id="robust" size="sm" checked={robust} onCheckedChange={setRobust} />
      </div>
      {robust && (
        <p className="flex items-center gap-1 text-[10px] text-equity">
          {robustComputing && <Loader2 className="size-3 animate-spin" aria-hidden />}
          {robustIds ? `${fmtInt(robustIds.size)} of ${fmtInt(trees)} sites are robust (violet rings)` : 'Computing…'}
        </p>
      )}
    </Section>
  )
}

function RunStatus() {
  const computing = useStore((s) => s.plan.computing)
  const ms = useStore((s) => s.plan.lastRunMs)
  const n = useStore((s) => s.data?.sites.length ?? 0)
  return (
    <div className="flex items-center gap-1.5 border-t border-white/10 pt-2 text-[10px] text-white/40 tabular-nums">
      {computing ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <span className="size-1.5 rounded-full bg-canopy" aria-hidden />}
      {ms != null ? `Optimized ${fmtInt(n)} candidate sites in ${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms` : 'Optimizing…'}
    </div>
  )
}

export function Controls() {
  return (
    <div className="space-y-3">
      <FocusChip />
      <BudgetControl />
      <WeightsControl />
      <RulesControl />
      <ViewControl />
      <RunStatus />
    </div>
  )
}
