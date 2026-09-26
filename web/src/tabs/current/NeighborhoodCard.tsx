import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, RotateCcw, X } from 'lucide-react'
import { useStore } from '@/store'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { Slider } from '@/components/ui/slider'
import { HOLC_COLORS, toCss } from '@/lib/colors'
import { featureLabel, fmtF, fmtInt, fmtPct, fmtSignedF, fmtUsd } from '@/lib/format'
import type { AppData, HolcGrade, NbProps } from '@/lib/types'
import { nbHexSummary, useDerived, type NbHexSummary } from './derived'
import { useCurrentUi } from './ui'
import { useHeatModel, whatIf, type WhatIfResult } from './whatIf'

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wider text-white/45">{label}</div>
      <div className="truncate text-sm tabular-nums text-white/90">{children}</div>
    </div>
  )
}

function HolcShare({ share }: { share: Partial<Record<HolcGrade, number>> }) {
  const grades = (['A', 'B', 'C', 'D'] as const).filter((g) => (share[g] ?? 0) > 0)
  if (!grades.length) return <span className="text-white/50">not graded</span>
  return (
    <span className="flex items-center gap-1.5">
      {grades.map((g) => (
        <span key={g} className="flex items-center gap-0.5 text-xs">
          <span className="inline-block size-2 rounded-sm" style={{ background: toCss(HOLC_COLORS[g]) }} />
          {g} {fmtPct(share[g] ?? 0)}
        </span>
      ))}
    </span>
  )
}

function ShapBars({ shap }: { shap: [string, number][] }) {
  const max = Math.max(...shap.map(([, v]) => Math.abs(v)), 1e-9)
  return (
    <div className="space-y-1">
      {shap.map(([f, v]) => (
        <div key={f} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-2 text-xs">
          <span className="truncate text-white/75">{featureLabel(f)}</span>
          <div className="relative h-2">
            <div
              className="absolute top-0 h-2 rounded-full"
              style={{ width: `${(Math.abs(v) / max) * 100}%`, background: v >= 0 ? '#f97316' : '#2dd4bf' }}
            />
          </div>
          <span className={`text-right tabular-nums ${v >= 0 ? 'text-orange-300' : 'text-teal-300'}`}>{fmtSignedF(v)}</span>
        </div>
      ))}
    </div>
  )
}

function WhatIf({ data, nb, summary }: { data: AppData; nb: string; summary: NbHexSummary }) {
  const model = useHeatModel()
  const setCurrent = useStore((s) => s.setCurrent)
  const setDeltas = useCurrentUi((s) => s.setDeltas)
  const [target, setTarget] = useState(summary.canopy)
  const [res, setRes] = useState<WhatIfResult | null>(null)

  // Clear the what-if when the neighborhood changes or the card closes.
  useEffect(() => {
    return () => {
      useCurrentUi.getState().setDeltas(null)
      useStore.getState().setCurrent({ whatIf: null })
    }
  }, [nb])

  const base = summary.measured ?? summary.pred
  const max = Math.min(1, Math.max(0.6, Math.ceil((summary.canopy + 0.3) * 10) / 10))
  const onChange = (v: number) => {
    setTarget(v)
    if (model === undefined) return
    const r = whatIf(data, model, nb, v)
    setRes(r)
    setDeltas(r?.deltas ?? null)
    const cur = useStore.getState().current
    setCurrent({ whatIf: { nb, canopy: v }, ...(cur.colorBy === 'heat' || cur.colorBy === 'model' ? {} : { colorBy: 'heat', bivariate: null }) })
  }
  const reset = () => {
    setTarget(summary.canopy)
    setRes(null)
    setDeltas(null)
    setCurrent({ whatIf: null })
  }
  const delta = res?.meanDelta ?? 0

  return (
    <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] p-3">
      <div className="flex items-center gap-2">
        <div className="text-xs font-medium text-emerald-200">What if {nb} had</div>
        <div className="font-display text-lg font-semibold tabular-nums text-emerald-300">{fmtPct(target)}</div>
        <div className="text-xs text-emerald-200">canopy?</div>
        {res && (
          <button type="button" onClick={reset} aria-label="Reset what-if" className="ml-auto rounded p-1 text-white/50 hover:bg-white/10 hover:text-white">
            <RotateCcw className="size-3.5" />
          </button>
        )}
      </div>
      <Slider
        className="my-3"
        min={0}
        max={max}
        step={0.01}
        value={[target]}
        disabled={model === undefined}
        onValueChange={([v]) => onChange(v)}
        aria-label="What-if canopy"
      />
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-white/55">Average afternoon</span>
        <span className="font-display text-xl font-semibold tabular-nums">
          <AnimatedNumber value={base + delta} format={(n) => fmtF(n)} />
        </span>
        {res && Math.abs(delta) >= 0.005 && (
          <span className={`text-sm tabular-nums ${delta < 0 ? 'text-teal-300' : 'text-orange-300'}`}>{fmtSignedF(delta, 2)}</span>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-white/45">
        {model === undefined
          ? 'Loading the heat model…'
          : model
            ? `LightGBM heat model, re-predicted live in your browser for ${fmtInt(res?.deltas.size ?? summary.n)} hexes (neighbors included).`
            : `Linear estimate (model file not available): ${fmtSignedF(data.stats.model.pdFPer10pct)} per +10 points of canopy.`}
      </p>
    </div>
  )
}

export function NeighborhoodCard() {
  const data = useStore((s) => s.data)
  const nbName = useStore((s) => s.selectedNb)
  const setSelectedNb = useStore((s) => s.setSelectedNb)
  const setPlan = useStore((s) => s.setPlan)
  const derived = useDerived()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const feature = nbName ? data?.nbByName.get(nbName) : undefined
  if (!data || !derived || !feature) return null
  const p: NbProps = feature.properties
  const goal = data.stats.city.canopyGoal
  const summary = nbHexSummary(data, p.name)
  const vsMedian = p.heat - derived.cityMedianF
  const n = derived.nbList.length

  return (
    <motion.section
      key={p.name}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="glass pointer-events-auto flex min-h-0 w-full flex-col text-sm text-white"
      aria-label={`${p.name} details`}
    >
      <header className="flex items-start gap-2 px-4 pt-3 pb-1">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wider text-white/45">Neighborhood</div>
          <h2 className="font-display text-lg leading-tight font-semibold tracking-tight">{p.name}</h2>
        </div>
        <button
          type="button"
          aria-label="Close neighborhood card"
          onClick={() => setSelectedNb(null)}
          className="ml-auto rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4 [scrollbar-width:thin]">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-white/45">Tree canopy</div>
            <div className="font-display text-2xl font-semibold tabular-nums text-emerald-300">{fmtPct(p.canopy)}</div>
            <div className="text-xs text-white/55">
              {p.canopyGap > 0 ? `${Math.round(p.canopyGap * 100)} pts below the ${fmtPct(goal)} goal` : `meets the ${fmtPct(goal)} goal`}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-white/45">Afternoon heat</div>
            <div className="font-display text-2xl font-semibold tabular-nums text-orange-300">{fmtF(p.heat)}</div>
            <div className="text-xs text-white/55">{fmtSignedF(vsMedian)} vs. city median</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-x-3 gap-y-2">
          <Fact label="Income">{fmtUsd(p.income)}</Fact>
          <Fact label="Asthma">{p.asthma.toFixed(1)}%</Fact>
          <Fact label="Empty sites">{fmtInt(p.sites)}</Fact>
          <Fact label="Heat rank">#{p.rankHeat} of {n}</Fact>
          <Fact label="Canopy rank">#{p.rankCanopy} of {n}</Fact>
          <Fact label="Residents">{fmtInt(p.pop)}</Fact>
          <div className="col-span-3">
            <Fact label="1930s HOLC grade (share of area)">
              {summary ? <HolcShare share={summary.holcShare} /> : <span className="text-white/50">—</span>}
            </Fact>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setPlan({ focusNb: p.name })
            navigate('/plan')
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-300"
        >
          Plan trees here <ArrowRight className="size-4" />
        </button>

        <section className="space-y-2 border-t border-white/10 pt-3">
          <h3 className="font-display text-[13px] font-semibold">What the model sees</h3>
          {summary ? (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Fact label="Measured">{summary.measured != null ? fmtF(summary.measured) : 'no sensor data'}</Fact>
                <Fact label="Model predicts">{fmtF(summary.predMeasured ?? summary.pred)}</Fact>
              </div>
              {summary.shap.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-white/45">Top drivers vs. city average</div>
                  <ShapBars shap={summary.shap} />
                </div>
              )}
              <WhatIf key={p.name} data={data} nb={p.name} summary={summary} />
            </>
          ) : (
            <p className="text-xs text-white/50">No hex-level model data for this neighborhood.</p>
          )}
        </section>
      </div>
    </motion.section>
  )
}
