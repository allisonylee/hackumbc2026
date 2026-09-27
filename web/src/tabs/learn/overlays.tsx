// Per-beat overlays rendered inside the story cards. Numbers come from stats.json, neighborhood props or
// the optimizer runs held in learnStore.
import { useEffect, useMemo, useRef } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowDown, MessageCircle, RotateCcw } from 'lucide-react'
import { useStore } from '@/store'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { ContinuousLegend } from '@/components/Legend'
import { Button } from '@/components/ui/button'
import { BRAND, HOLC_COLORS, RAMPS, toCss } from '@/lib/colors'
import { fmtCompact, fmtF, fmtInt, fmtPct, fmtSignedF, fmtUsd } from '@/lib/format'
import type { HolcGrade, Impact } from '@/lib/types'
import { cn } from '@/lib/utils'
import { hottestCoolest } from './helpers'
import { useLearn } from './learnStore'
import { scrollToHelp } from './nav'

type OverlayProps = { active: boolean }


const Label = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('text-[11px] font-medium uppercase tracking-wider text-white/50', className)}>{children}</div>
)

// ---- 1. Hook ----
export function HookCounter({ active }: OverlayProps) {
  const spread = useStore((s) => s.data?.stats.city.heatSpreadF ?? 0)
  const digits = spread >= 10 ? 0 : 1
  return (
    <div className="space-y-3">
      <div className="font-display text-6xl font-semibold tabular-nums text-orange-400">
        <AnimatedNumber value={active ? spread : 0} format={(n) => `${n.toFixed(digits)}°F`} />
      </div>
      <ContinuousLegend title="Afternoon heat vs. city median" ramp={RAMPS.heat} lo="cooler" hi="hotter" />
    </div>
  )
}

// ---- 2. History ----
const HOLC_LABELS: Record<HolcGrade, string> = { A: 'Best', B: 'Still desirable', C: 'Declining', D: 'Hazardous' }
export function HolcKey() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-white/75">
      {(Object.keys(HOLC_LABELS) as HolcGrade[]).map((g) => (
        <div key={g} className="flex items-center gap-2">
          <span className="size-3 rounded-sm" style={{ background: toCss(HOLC_COLORS[g]) }} aria-hidden />
          <span className="font-semibold text-white">{g}</span> {HOLC_LABELS[g]}
        </div>
      ))}
    </div>
  )
}

// ---- 3. Echo: heat by HOLC grade, relative to A ----
export function EchoChart({ active }: OverlayProps) {
  const byHolc = useStore((s) => s.data?.stats.byHolc)
  const reduce = useReducedMotion()
  const rows = useMemo(() => {
    if (!byHolc?.length) return []
    const base = byHolc.find((r) => r.grade === 'A')?.heat ?? Math.min(...byHolc.map((r) => r.heat))
    const deltas = byHolc.map((r) => ({ ...r, delta: r.heat - base }))
    const max = Math.max(0.1, ...deltas.map((r) => Math.abs(r.delta)))
    return deltas.map((r) => ({ ...r, frac: Math.abs(r.delta) / max }))
  }, [byHolc])
  if (!rows.length) return null
  return (
    <figure className="space-y-2">
      <Label>Afternoon heat compared with A-graded areas</Label>
      <div className="space-y-1.5" role="list">
        {rows.map((r, i) => (
          <div
            key={r.grade}
            role="listitem"
            className="grid grid-cols-[1.25rem_1fr_3.5rem] items-center gap-2 text-xs"
            title={`Grade ${r.grade}: ${fmtF(r.heat)} average, ${r.n} areas`}
          >
            <span className="font-semibold">{r.grade}</span>
            <div className="h-3.5 rounded-sm bg-white/5">
              <motion.div
                className="h-full rounded-r-[4px]"
                style={{ background: toCss(HOLC_COLORS[r.grade]), originX: 0 }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: active ? r.frac : 0 }}
                transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : i * 0.12, ease: 'easeOut' }}
              />
            </div>
            <span className="text-right tabular-nums text-white/80">{r.grade === 'A' ? 'base' : fmtSignedF(r.delta)}</span>
          </div>
        ))}
      </div>
      <figcaption className="sr-only">
        {rows.map((r) => `Grade ${r.grade}: ${fmtF(r.heat)}`).join('; ')}
      </figcaption>
    </figure>
  )
}

// ---- 4. Canopy A vs D ----
export function CanopyAvsD({ active }: OverlayProps) {
  const byHolc = useStore((s) => s.data?.stats.byHolc)
  const a = byHolc?.find((r) => r.grade === 'A')
  const d = byHolc?.find((r) => r.grade === 'D')
  if (!a || !d) return null
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {[a, d].map((r) => (
          <div key={r.grade} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <Label className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: toCss(HOLC_COLORS[r.grade]) }} aria-hidden />
              Grade {r.grade} canopy
            </Label>
            <div className="font-display text-3xl font-semibold tabular-nums">
              <AnimatedNumber value={active ? r.canopy : 0} format={(n) => fmtPct(n)} />
            </div>
          </div>
        ))}
      </div>
      <ContinuousLegend title="Tree canopy" ramp={RAMPS.canopy} lo="0%" hi="60%+" />
    </div>
  )
}

// ---- 5. Human cost ----
export function HumanCostTiles() {
  const nbs = useStore((s) => s.data?.nbs)
  const hc = useMemo(() => (nbs ? hottestCoolest(nbs.features.map((f) => f.properties)) : null), [nbs])
  if (!hc) return null
  const rows: { label: string; hot: string; cool: string }[] = [
    { label: 'Afternoon heat', hot: fmtF(hc.hot.heat), cool: fmtF(hc.cool.heat) },
    { label: 'Adults with asthma', hot: `${hc.hot.asthma.toFixed(1)}%`, cool: `${hc.cool.asthma.toFixed(1)}%` },
    { label: 'Below poverty line', hot: fmtPct(hc.hot.poverty), cool: fmtPct(hc.cool.poverty) },
    { label: 'Tree canopy', hot: fmtPct(hc.hot.canopy), cool: fmtPct(hc.cool.canopy) },
  ]
  return (
    <div className="overflow-hidden rounded-lg border border-white/10">
      <div className="grid grid-cols-[1fr_5.5rem_5.5rem] bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-white/55">
        <span />
        <span className="flex items-center justify-end gap-1.5">
          <span className="size-2 rounded-full" style={{ background: toCss(BRAND.heat) }} aria-hidden />
          {hc.hot.names.length} hottest
        </span>
        <span className="flex items-center justify-end gap-1.5">
          <span className="size-2 rounded-full" style={{ background: toCss(BRAND.cool) }} aria-hidden />
          {hc.cool.names.length} coolest
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[1fr_5.5rem_5.5rem] items-baseline border-t border-white/5 px-3 py-1.5">
          <span className="text-xs text-white/65">{r.label}</span>
          <span className="text-right font-display text-lg font-semibold tabular-nums">{r.hot}</span>
          <span className="text-right font-display text-lg font-semibold tabular-nums text-white/80">{r.cool}</span>
        </div>
      ))}
      <div className="border-t border-white/5 px-3 py-1.5 text-[11px] text-white/45">Population-weighted averages</div>
    </div>
  )
}

// ---- 6. The gap ----
/** Planting pace, cited text (Howard Center, Code Red, 2019): about 10k/yr today vs about 25k/yr needed. */
const PACE = { now: 10_000, needed: 25_000 }
export function GapBar({ active }: OverlayProps) {
  const city = useStore((s) => s.data?.stats.city)
  const reduce = useReducedMotion()
  if (!city) return null
  const scale = Math.max(city.canopyGoal * 1.2, city.canopy)
  const t = { duration: reduce ? 0 : 1, ease: 'easeOut' as const }
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex justify-between text-xs">
          <span className="text-white/70">
            Today <span className="font-display text-base font-semibold text-white">{fmtPct(city.canopy)}</span>
          </span>
          <span className="text-white/70">
            Goal <span className="font-display text-base font-semibold text-emerald-300">{fmtPct(city.canopyGoal)}</span> by 2037
          </span>
        </div>
        <div className="relative h-3 rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-emerald-400"
            style={{ originX: 0, width: `${(city.canopy / scale) * 100}%` }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: active ? 1 : 0 }}
            transition={t}
          />
          <div
            className="absolute -top-1 h-5 w-0.5 rounded bg-white"
            style={{ left: `${(city.canopyGoal / scale) * 100}%` }}
            aria-hidden
          />
        </div>
      </div>
      <div className="space-y-1.5 text-xs">
        <Label>Trees planted per year</Label>
        {[
          { label: 'Today (about)', v: PACE.now, cls: 'bg-white/50' },
          { label: 'Needed (about)', v: PACE.needed, cls: 'bg-emerald-400' },
        ].map((r) => (
          <div key={r.label} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2">
            <span className="text-white/65">{r.label}</span>
            <div className="h-2.5 rounded-sm bg-white/5">
              <motion.div
                className={cn('h-full rounded-r-[4px]', r.cls)}
                style={{ originX: 0, width: `${(r.v / PACE.needed) * 100}%` }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: active ? 1 : 0 }}
                transition={t}
              />
            </div>
            <span className="text-right tabular-nums">{fmtCompact(r.v)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-white/75">
        <span
          className="size-3 rounded-sm border-2"
          style={{ borderColor: toCss(BRAND.lowCanopy), background: toCss(BRAND.lowCanopy, 0.15) }}
          aria-hidden
        />
        Neighborhoods under 20% canopy
      </div>
    </div>
  )
}

// ---- 7. The turn ----
const TURN_DELAY_MS = 2200

function ImpactCard({ title, color, impact, reveal = true, dim }: {
  title: string; color: string; impact: Impact | null; reveal?: boolean; dim?: boolean
}) {
  const v = (x: number | undefined) => (reveal ? (x ?? 0) : 0)
  const rows = [
    { label: 'Cooling (people × °F)', v: v(impact?.coolingPersonF), f: fmtCompact },
    { label: 'Residents reached', v: v(impact?.residents), f: fmtCompact },
    { label: 'To low-income blocks', v: v(impact?.shareLowIncome), f: (n: number) => fmtPct(n) },
  ]
  return (
    <div className={cn('rounded-lg border bg-white/[0.03] px-3 py-2.5 transition-opacity duration-500', dim ? 'opacity-45' : 'opacity-100')}
      style={{ borderColor: `${color}55` }}>
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />
        {title}
      </div>
      <div className="mt-0.5 text-[11px] text-white/50 tabular-nums">
        {impact && reveal ? `${fmtInt(impact.trees)} trees · ${fmtUsd(impact.spent)}` : '…'}
      </div>
      <div className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <div key={r.label}>
            <Label className="text-[10px]">{r.label}</Label>
            <div className="font-display text-xl font-semibold tabular-nums leading-tight">
              {impact ? <AnimatedNumber value={r.v} format={r.f} fast /> : <span className="text-white/30">—</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TurnCards({ active }: OverlayProps) {
  const turn = useLearn((s) => s.turn)
  const phase = useLearn((s) => s.turnPhase)
  const error = useLearn((s) => s.error)
  const set = useLearn((s) => s.set)
  const timer = useRef<number | undefined>(undefined)

  const play = () => {
    window.clearTimeout(timer.current)
    set({ turnPhase: 'random' })
    timer.current = window.setTimeout(() => set({ turnPhase: 'optimized' }), TURN_DELAY_MS)
  }
  // Start the random → optimized sequence each time the beat becomes active (and once results arrive).
  useEffect(() => {
    if (!active || !turn) return
    window.clearTimeout(timer.current)
    set({ turnPhase: 'random' })
    timer.current = window.setTimeout(() => set({ turnPhase: 'optimized' }), TURN_DELAY_MS)
    return () => window.clearTimeout(timer.current)
  }, [active, turn, set])

  if (error) return <p className="text-xs text-rose-300">Optimizer error: {error}</p>
  const shown = phase === 'optimized'
  const r = turn?.random.impact
  const o = turn?.optimized.impact
  const ratio = r && o && r.coolingPersonF > 0 ? o.coolingPersonF / r.coolingPersonF : null
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <ImpactCard title="Random sites" color={toCss(BRAND.random)} impact={r ?? null} dim={shown} />
        <ImpactCard title="Optimized sites" color={toCss(BRAND.canopy)} impact={o ?? null} reveal={shown} dim={!shown} />
      </div>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <p className="text-sm text-white/85">
          {!turn ? (
            <span className="text-white/50">Running the optimizer…</span>
          ) : shown && ratio ? (
            <>
              <span className="font-display text-lg font-semibold text-emerald-300">{ratio.toFixed(1)}×</span> the cooling from the same number of trees
              {turn.ms > 0 && <span className="text-white/45"> · solved in {Math.max(1, Math.round(turn.ms))} ms</span>}
            </>
          ) : (
            <span className="text-white/60">Random picks first…</span>
          )}
        </p>
        {turn && shown && (
          <Button size="xs" variant="ghost" onClick={play} className="text-white/60">
            <RotateCcw /> Replay
          </Button>
        )}
      </div>
    </div>
  )
}

// ---- 8. Call to action ----
export function CtaButtons() {
  const openChat = useStore((s) => s.openChat)
  const reduce = useReducedMotion()
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="lg" onClick={() => scrollToHelp(reduce)}>
        How to help <ArrowDown />
      </Button>
      <Button size="lg" variant="outline" onClick={() => openChat('How can I help plant trees in my neighborhood?')}>
        <MessageCircle /> Ask the guide
      </Button>
    </div>
  )
}
