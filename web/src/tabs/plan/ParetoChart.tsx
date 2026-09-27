// Cooling vs. low-income share trade-off curve (§8.4), Observable Plot.
import { useEffect, useMemo, useRef } from 'react'
import * as Plot from '@observablehq/plot'
import { useStore } from '@/store'
import { fmtCompact } from '@/lib/format'
import { paretoNote, paretoNoteText } from './logic'

type Pt = { x: number; y: number; label: string; kind: 'curve' | 'plan' | 'baseline'; quota?: number }

const WIDTH = 300
const HEIGHT = 190

export function ParetoChart() {
  const pareto = useStore((s) => s.plan.pareto)
  const result = useStore((s) => s.plan.result)
  const baselines = useStore((s) => s.plan.baselines)
  const ref = useRef<HTMLDivElement>(null)

  const points = useMemo(() => {
    if (!pareto?.length) return null
    const curve: Pt[] = [...pareto]
      .sort((a, b) => a.quota - b.quota)
      .map((p) => ({ x: p.shareLowIncome * 100, y: p.cooling, label: `Guarantee ${Math.round(p.quota * 100)}%`, kind: 'curve', quota: p.quota }))
    const marks: Pt[] = []
    if (baselines) {
      marks.push({ x: baselines.random.impact.shareLowIncome * 100, y: baselines.random.impact.coolingPersonF, label: 'Random', kind: 'baseline' })
      marks.push({ x: baselines.lowestCanopy.impact.shareLowIncome * 100, y: baselines.lowestCanopy.impact.coolingPersonF, label: 'Lowest canopy', kind: 'baseline' })
      if (baselines.tes) marks.push({ x: baselines.tes.impact.shareLowIncome * 100, y: baselines.tes.impact.coolingPersonF, label: 'Tree Equity gap', kind: 'baseline' })
    }
    const plan: Pt | null = result ? { x: result.impact.shareLowIncome * 100, y: result.impact.coolingPersonF, label: 'Your plan', kind: 'plan' } : null
    return { curve, marks, plan }
  }, [pareto, result, baselines])

  const note = useMemo(() => (pareto ? paretoNote(pareto) : null), [pareto])

  useEffect(() => {
    const el = ref.current
    if (!el || !points) return
    const all = [...points.curve, ...points.marks, ...(points.plan ? [points.plan] : [])]
    const chart = Plot.plot({
      width: WIDTH,
      height: HEIGHT,
      marginLeft: 44,
      marginRight: 12,
      marginTop: 12,
      marginBottom: 32,
      style: { background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '10px', fontFamily: 'inherit' },
      x: { label: 'Benefit to low-income blocks (%) →', labelAnchor: 'right', nice: true, grid: true },
      y: { label: '↑ Cooling (people × °F)', labelAnchor: 'top', nice: true, grid: true, tickFormat: (d: number) => fmtCompact(d), zero: false },
      marks: [
        Plot.line(points.curve, { x: 'x', y: 'y', stroke: 'rgba(255,255,255,0.55)', strokeWidth: 2, curve: 'monotone-x' }),
        Plot.dot(points.curve, { x: 'x', y: 'y', r: 2, fill: 'rgba(255,255,255,0.55)' }),
        Plot.dot(points.marks, { x: 'x', y: 'y', r: 4.5, stroke: 'rgba(255,255,255,0.85)', strokeWidth: 1.5, fill: '#0b0f0e' }),
        Plot.text(points.marks, { x: 'x', y: 'y', text: 'label', dy: -9, fill: 'rgba(255,255,255,0.75)', fontSize: 10 }),
        ...(points.plan
          ? [
              Plot.dot([points.plan], { x: 'x', y: 'y', r: 6, fill: '#4ade80', stroke: '#0b0f0e', strokeWidth: 2 }),
              Plot.text([points.plan], { x: 'x', y: 'y', text: 'label', dx: 9, textAnchor: 'start', fill: 'white', fontWeight: 600, fontSize: 10 }),
            ]
          : []),
        Plot.tip(
          all,
          Plot.pointer({
            x: 'x',
            y: 'y',
            title: (d: Pt) => `${d.label}\nCooling ${fmtCompact(d.y)} people × °F\nLow-income share ${d.x.toFixed(0)}%`,
            fill: '#121816',
            stroke: 'rgba(255,255,255,0.15)',
          }),
        ),
      ],
    })
    el.replaceChildren(chart)
    return () => chart.remove()
  }, [points])

  if (!points) return <div className="flex h-[190px] items-center justify-center text-xs text-white/40">Computing trade-off curve…</div>
  return (
    <figure className="space-y-1.5">
      <div ref={ref} className="[&_svg]:overflow-visible" role="img" aria-label="Cooling versus share of benefit to low-income blocks, for equity guarantees from 0 to 100%" />
      {note && <figcaption className="text-xs leading-snug text-white/75">{paretoNoteText(note)}</figcaption>}
      <p className="text-[10px] text-white/40">Line: equity guarantee from 0% to 100% at this budget. Filled dot: your plan. Hollow dots: simple strategies.</p>
    </figure>
  )
}
