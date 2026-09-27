import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { BarChart3, BrainCircuit, ChevronRight, FlaskConical } from 'lucide-react'
import { useStore } from '@/store'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { StatTile } from '@/components/StatTile'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HOLC_COLORS, RAMPS, toCss } from '@/lib/colors'
import { fmtF, fmtInt, fmtPct } from '@/lib/format'
import type { NbProps, Stats } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useDerived } from './derived'
import { CanopyHeatScatter } from './Scatter'
import { focusNb, setHoveredIfChanged, useCurrentUi } from './ui'

function Section({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('border-t border-white/10 pt-3', className)}>
      <h3 className="mb-2 font-display text-[13px] font-semibold tracking-tight text-white/90">{title}</h3>
      {children}
    </section>
  )
}

export function ProgressRing({ value, goal, size = 64 }: { value: number; goal: number; size?: number }) {
  const r = size / 2 - 5
  const c = 2 * Math.PI * r
  const frac = Math.min(1, value / goal)
  const reduce = useReducedMotion()
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.1)" strokeWidth={6} fill="none" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} stroke="#4ade80" strokeWidth={6} fill="none" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c * (1 - frac) : c }}
          animate={{ strokeDashoffset: c * (1 - frac) }}
          transition={{ duration: reduce ? 0 : 1.2, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-display text-sm font-semibold tabular-nums">
        <AnimatedNumber value={value * 100} format={(n) => `${Math.round(n)}%`} />
      </div>
    </div>
  )
}

function Kpis({ stats }: { stats: Stats }) {
  const c = stats.city
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="col-span-2 flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <ProgressRing value={c.canopy} goal={c.canopyGoal} />
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-white/50">City tree canopy</div>
          <div className="text-sm text-white/80">
            {fmtPct(c.canopy)} today vs. the <b className="text-emerald-300">{fmtPct(c.canopyGoal)}</b> goal
          </div>
          <div className="text-xs text-white/50">{Math.round(Math.max(0, c.canopyGoal - c.canopy) * 100)} percentage points to go</div>
        </div>
      </div>
      <StatTile label="Heat spread" value={c.heatSpreadF} format={(n) => fmtF(n)} hint="hottest vs. coolest blocks" accent="#fb923c" />
      <StatTile label="Empty sites" value={c.emptySites} format={fmtInt} hint="ready for a tree" accent="#facc15" />
      <StatTile label="Under 20% canopy" value={c.nbBelow20} format={fmtInt} hint="neighborhoods" className="col-span-2" accent="#a78bfa" />
    </div>
  )
}

function HolcBars({ stats }: { stats: Stats }) {
  const rows = [...stats.byHolc].sort((a, b) => a.grade.localeCompare(b.grade))
  if (!rows.length) return null
  const maxCanopy = Math.max(...rows.map((r) => r.canopy))
  const a = rows.find((r) => r.grade === 'A'), d = rows.find((r) => r.grade === 'D')
  const heatLo = Math.min(...rows.map((r) => r.heat)), heatHi = Math.max(...rows.map((r) => r.heat))
  return (
    <div>
      <div className="mb-1 grid grid-cols-[1.25rem_1fr_1fr] gap-x-2 text-[10px] uppercase tracking-wider text-white/40">
        <span />
        <span>Canopy</span>
        <span>Afternoon °F</span>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.grade} className="grid grid-cols-[1.25rem_1fr_1fr] items-center gap-x-2 text-xs">
            <span className="flex size-5 items-center justify-center rounded text-[11px] font-bold text-black" style={{ background: toCss(HOLC_COLORS[r.grade]) }}>
              {r.grade}
            </span>
            <div className="flex items-center gap-1.5">
              <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${(r.canopy / maxCanopy) * 70}%` }} />
              <span className="tabular-nums text-white/75">{fmtPct(r.canopy)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Heat bars start at the coolest grade so differences are visible; the value is labeled. */}
              <div
                className="h-2 rounded-full"
                style={{ width: `${10 + ((r.heat - heatLo) / Math.max(0.01, heatHi - heatLo)) * 60}%`, background: toCss(RAMPS.heat((r.heat - heatLo) / Math.max(0.01, heatHi - heatLo))) }}
              />
              <span className="tabular-nums text-white/75">{fmtF(r.heat)}</span>
            </div>
          </div>
        ))}
      </div>
      {a && d && (
        <p className="mt-2 text-xs text-white/60">
          Areas redlined “D” in the 1930s have {fmtPct(d.canopy)} canopy vs. {fmtPct(a.canopy)} in “A” areas, and run{' '}
          <b className="text-white">{fmtF(Math.abs(d.heat - a.heat))}</b> {d.heat >= a.heat ? 'hotter' : 'cooler'}.
        </p>
      )}
      <p className="mt-1 text-[10px] text-white/40">Heat bars start at the coolest grade.</p>
    </div>
  )
}

const VAR_LABELS: Record<string, string> = {
  canopy: 'Canopy', heat: 'Heat', income: 'Income', poverty: 'Poverty', poc: 'People of color',
  asthma: 'Asthma', imperv: 'Pavement', holc: 'HOLC grade', svi: 'Vulnerability', pop: 'Population',
}
const varLabel = (v: string) => VAR_LABELS[v] ?? v

/** Variables left out of the correlation grid. */
const CORR_HIDDEN = new Set(['poverty'])

function CorrHeatmap({ stats }: { stats: Stats }) {
  const { vars, matrix } = useMemo(() => {
    const keep = stats.corr.vars.flatMap((v, i) => (CORR_HIDDEN.has(v) ? [] : [i]))
    return { vars: keep.map((i) => stats.corr.vars[i]), matrix: keep.map((i) => keep.map((j) => stats.corr.matrix[i][j])) }
  }, [stats.corr])
  const [hover, setHover] = useState<[number, number] | null>(null)
  const takeaway = useMemo(() => {
    const hi = vars.indexOf('heat')
    if (hi < 0) return null
    let best = -1, bv = 0
    vars.forEach((_, j) => {
      if (j !== hi && Math.abs(matrix[hi][j]) > Math.abs(bv)) { best = j; bv = matrix[hi][j] }
    })
    return best >= 0 ? { v: vars[best], r: bv } : null
  }, [vars, matrix])
  if (!vars.length) return null
  const n = vars.length
  const cell = Math.min(26, Math.floor(210 / n))
  const shown = hover ?? null
  return (
    <div>
      <div className="mb-2 text-[11px] text-white/70">
        Correlation between neighborhood measures <span className="text-white/45">(r, −1 to +1)</span>
      </div>
      <div className="flex gap-2">
        <div>
          <div className="grid items-end" style={{ gridTemplateColumns: `repeat(${n}, ${cell}px)` }} aria-hidden>
            {vars.map((v, j) => (
              <span
                key={v}
                className={cn('mb-1 justify-self-center whitespace-nowrap text-[10px] leading-none text-white/55', shown?.[1] === j && 'text-white')}
                style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >
                {varLabel(v)}
              </span>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${n}, ${cell}px)`, gridAutoRows: `${cell}px` }} onPointerLeave={() => setHover(null)}>
            {matrix.flatMap((row, i) =>
              row.map((r, j) => (
                <div
                  key={`${i}-${j}`}
                  title={`${varLabel(vars[i])} × ${varLabel(vars[j])}: r = ${r.toFixed(2)}`}
                  onPointerEnter={() => setHover([i, j])}
                  className={cn('border border-black/40', shown && (shown[0] === i || shown[1] === j) && 'border-white/60')}
                  style={{ background: toCss(RAMPS.residual((r + 1) / 2)) }}
                />
              )),
            )}
          </div>
        </div>
        <div className="flex flex-col self-end text-[10px] text-white/55" style={{ gap: 0 }}>
          {vars.map((v, i) => (
            <span key={v} className={cn('truncate leading-none', shown?.[0] === i && 'text-white')} style={{ height: cell, lineHeight: `${cell}px` }}>
              {varLabel(v)}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-2 min-h-8 text-xs text-white/60">
        {shown ? (
          <>
            {varLabel(vars[shown[0]])} × {varLabel(vars[shown[1]])}: <b className="text-white tabular-nums">r = {matrix[shown[0]][shown[1]].toFixed(2)}</b>
          </>
        ) : takeaway ? (
          <>
            Neighborhood heat tracks <b className="text-white">{varLabel(takeaway.v).toLowerCase()}</b> most closely (r = {takeaway.r.toFixed(2)}).
            Red = move together, blue = opposite.
          </>
        ) : null}
      </p>
    </div>
  )
}

function RankList({ items, value }: { items: NbProps[]; value: (p: NbProps) => string }) {
  return (
    <ol className="space-y-0.5">
      {items.map((p, i) => (
        <li key={p.name}>
          <button
            type="button"
            onClick={() => focusNb(p.name)}
            onPointerEnter={() => setHoveredIfChanged({ nb: p.name })}
            onPointerLeave={() => setHoveredIfChanged({})}
            className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-white/10"
          >
            <span className="w-4 text-right tabular-nums text-white/40">{i + 1}</span>
            <span className="flex-1 truncate">{p.name}</span>
            <span className="tabular-nums text-white/70">{value(p)}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

function ModelCardButton() {
  const setDialog = useStore((s) => s.setDialog)
  return (
    <button
      type="button"
      onClick={() => setDialog('modelCard', true)}
      className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-white/80 hover:bg-white/10"
    >
      <BrainCircuit className="size-4 text-emerald-300" /> How the heat model works
      <ChevronRight className="ml-auto size-4 text-white/40" />
    </button>
  )
}

export function StatsPanel() {
  const stats = useStore((s) => s.data?.stats)
  const derived = useDerived()
  const open = useCurrentUi((s) => s.statsOpen)
  const setOpen = useCurrentUi((s) => s.setStatsOpen)
  const reduce = useReducedMotion()

  const lists = useMemo(() => {
    const l = derived?.nbList ?? []
    return {
      hottest: [...l].sort((a, b) => b.heat - a.heat).slice(0, 10),
      leastCanopy: [...l].sort((a, b) => a.canopy - b.canopy).slice(0, 10),
    }
  }, [derived])

  if (!stats) return null
  return (
    <>
      <AnimatePresence initial={false}>
        {!open && (
          <motion.button
            key="stats-toggle"
            type="button"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            onClick={() => setOpen(true)}
            className="glass pointer-events-auto absolute top-16 right-4 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white/85 hover:text-white"
          >
            <BarChart3 className="size-4 text-emerald-300" /> City stats
            {stats.mock && <span className="rounded-full bg-amber-300/15 px-1.5 text-[10px] text-amber-200">mock</span>}
          </motion.button>
        )}
        {open && (
          <motion.aside
            key="stats-panel"
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="glass pointer-events-auto absolute top-16 right-4 bottom-4 flex w-[calc(100%-2rem)] max-w-[21.5rem] flex-col text-sm text-white"
            aria-label="City statistics"
          >
            <header className="flex items-center gap-2 px-4 pt-3 pb-2">
              <h2 className="font-display text-sm font-semibold tracking-tight">Baltimore today</h2>
              {stats.mock && (
                <span className="flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                  <FlaskConical className="size-3" /> mock data
                </span>
              )}
              <button
                type="button"
                aria-label="Collapse stats panel"
                onClick={() => setOpen(false)}
                className="ml-auto rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <ChevronRight className="size-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 [scrollbar-width:thin]">
              <Kpis stats={stats} />
              <Section title="More trees, cooler streets">
                <CanopyHeatScatter />
              </Section>
              <Section title="Redlining’s legacy">
                <HolcBars stats={stats} />
              </Section>
              <Section title="What goes with heat?">
                <CorrHeatmap stats={stats} />
              </Section>
              <Section title="Neighborhoods to watch">
                <Tabs defaultValue="hot">
                  <TabsList className="mb-1 w-full">
                    <TabsTrigger value="hot" className="text-xs">Hottest</TabsTrigger>
                    <TabsTrigger value="canopy" className="text-xs">Least canopy</TabsTrigger>
                  </TabsList>
                  <TabsContent value="hot">
                    <RankList items={lists.hottest} value={(p) => fmtF(p.heat)} />
                  </TabsContent>
                  <TabsContent value="canopy">
                    <RankList items={lists.leastCanopy} value={(p) => fmtPct(p.canopy)} />
                  </TabsContent>
                </Tabs>
              </Section>
              <Section title="The heat model">
                <ModelCardButton />
              </Section>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
