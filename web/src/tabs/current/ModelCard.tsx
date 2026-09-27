import { useEffect, useRef } from 'react'
import * as Plot from '@observablehq/plot'
import { useStore } from '@/store'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatTile } from '@/components/StatTile'
import { featureLabel, fmtF } from '@/lib/format'
import type { Stats } from '@/lib/types'

const C_TO_F = 1.8

/** Partial dependence of heat on canopy, with the literature range of slopes shaded around it. */
function PdChart({ stats }: { stats: Stats }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    const curve = stats.model.pdCurve
    if (!el || curve.length < 2) return
    // Anchor the literature lines at the curve point closest to today's city canopy.
    const anchor = curve.reduce((b, p) => (Math.abs(p[0] - stats.city.canopy) < Math.abs(b[0] - stats.city.canopy) ? p : b))
    const s1 = stats.literature.meta_C_per10 * C_TO_F, s2 = stats.literature.zaerpour_C_per10 * C_TO_F
    const band = curve.map(([c]) => ({
      c,
      y1: anchor[1] - (Math.min(s1, s2) * (c - anchor[0])) / 0.1,
      y2: anchor[1] - (Math.max(s1, s2) * (c - anchor[0])) / 0.1,
    }))
    const plot = Plot.plot({
      width: 460,
      height: 200,
      marginLeft: 40,
      marginBottom: 32,
      style: { background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '10px' },
      x: { label: 'Hex tree canopy →', tickFormat: (d: number) => `${Math.round(d * 100)}%` },
      y: { label: '↑ Predicted °F', grid: true },
      marks: [
        Plot.areaY(band, { x: 'c', y1: 'y1', y2: 'y2', fill: '#a78bfa', fillOpacity: 0.18 }),
        Plot.lineY(curve, { x: (d: [number, number]) => d[0], y: (d: [number, number]) => d[1], stroke: '#4ade80', strokeWidth: 2.2 }),
        Plot.ruleX([stats.city.canopy], { stroke: 'rgba(255,255,255,0.35)', strokeDasharray: '3,3' }),
      ],
    })
    el.replaceChildren(plot)
    return () => plot.remove()
  }, [stats])
  return <div ref={ref} className="overflow-x-auto" />
}

export function ModelCardContent({ stats }: { stats: Stats }) {
  const m = stats.model
  const maxImp = Math.max(...m.importance.map(([, v]) => v), 1e-9)
  return (
    <div className="space-y-5 text-sm text-white/80">
      <p>
        A gradient-boosted tree model (LightGBM) learns how the {m.target.toLowerCase()} on {m.date} depends on each
        block’s land cover and surroundings, from {m.nTrain.toLocaleString('en-US')} measured hexes. It uses only
        physical features, so it can answer “what if this block had more trees?”.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile label="Spatial-CV R²" value={m.r2Spatial} format={(n) => n.toFixed(2)} hint="held-out areas" accent="#4ade80" />
        <StatTile label="Linear baseline" value={m.baselines.linearR2Spatial} format={(n) => n.toFixed(2)} hint="R², same split" />
        <StatTile
          label="RMSE"
          value={m.rmseSpatial}
          format={(n) => fmtF(n)}
          hint={`held-out areas; least-squares boosted trees (guessing the mean: ${fmtF(m.baselines.meanRmse)})`}
        />
      </div>

      <section>
        <h3 className="mb-2 font-display text-[13px] font-semibold text-white">What drives the prediction (mean |SHAP|)</h3>
        <div className="space-y-1">
          {m.importance.map(([f, v]) => (
            <div key={f} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-2 text-xs">
              <span className="truncate text-white/75">{featureLabel(f)}</span>
              <div className="h-2 rounded-full bg-emerald-400/80" style={{ width: `${(v / maxImp) * 100}%` }} />
              <span className="text-right tabular-nums text-white/60">{fmtF(v, 2)}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1 font-display text-[13px] font-semibold text-white">Heat vs. canopy, all else equal</h3>
        <p className="mb-1 text-xs text-white/55">
          Green: the model’s partial dependence ({fmtF(m.pdFPer10pct)} per +10 points of canopy). Violet: the range of
          published estimates ({stats.literature.meta_C_per10}–{stats.literature.zaerpour_C_per10} °C per 10%). Dashed:
          today’s city canopy.
        </p>
        <PdChart stats={stats} />
      </section>

      <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-100/90">
        Trained in {m.trainSeconds} s on a laptop CPU, using ≈{m.trainWh} Wh.
      </p>

      <section>
        <h3 className="mb-1 font-display text-[13px] font-semibold text-white">Limitations</h3>
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-white/65">
          {m.limitations.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </section>
    </div>
  )
}

export function ModelCardDialog() {
  const open = useStore((s) => s.dialogs.modelCard)
  const setDialog = useStore((s) => s.setDialog)
  const stats = useStore((s) => s.data?.stats)
  if (!stats) return null
  return (
    <Dialog open={open} onOpenChange={(o) => setDialog('modelCard', o)}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto border-white/10 bg-[#0e1412] text-white sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">
            Model card: how we predict heat
            {stats.mock && <span className="ml-2 align-middle text-[11px] font-medium text-amber-200">(mock data)</span>}
          </DialogTitle>
          <DialogDescription className="text-white/55">Built from stats.json, written by the training pipeline.</DialogDescription>
        </DialogHeader>
        <ModelCardContent stats={stats} />
      </DialogContent>
    </Dialog>
  )
}
