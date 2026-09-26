import { useEffect, useMemo, useRef } from 'react'
import * as Plot from '@observablehq/plot'
import { useStore } from '@/store'
import type { NbProps } from '@/lib/types'
import { fmtF, fmtPct } from '@/lib/format'
import { useDerived } from './derived'
import { focusNb, setHoveredIfChanged } from './ui'

const W = 300
const H = 190
const AXIS = 'rgba(255,255,255,0.55)'

type Pt = { p: NbProps; x: number; y: number }

/** Canopy vs heat per neighborhood, linked to the map through store.hovered.nb (both ways). */
export function CanopyHeatScatter() {
  const derived = useDerived()
  const regression = useStore((s) => s.data?.stats.regression)
  const hoveredNb = useStore((s) => s.hovered.nb)
  const selectedNb = useStore((s) => s.selectedNb)
  const box = useRef<HTMLDivElement>(null)
  const nbs = useMemo(() => derived?.nbList.filter((p) => Number.isFinite(p.canopy) && Number.isFinite(p.heat)) ?? [], [derived])

  const plot = useMemo(() => {
    if (!nbs.length) return null
    return Plot.plot({
      width: W,
      height: H,
      marginLeft: 34,
      marginBottom: 30,
      marginTop: 8,
      marginRight: 8,
      style: { background: 'transparent', color: AXIS, fontSize: '10px', overflow: 'visible' },
      x: { label: 'Tree canopy →', tickFormat: (d: number) => `${Math.round(d * 100)}%`, ticks: 5 },
      y: { label: '↑ °F', grid: true, ticks: 5 },
      marks: [
        Plot.dot(nbs, { x: 'canopy', y: 'heat', r: 2.4, fill: 'rgba(255,255,255,0.55)', stroke: 'none' }),
        Plot.linearRegressionY(nbs, { x: 'canopy', y: 'heat', stroke: '#4ade80', strokeWidth: 1.8, fill: '#4ade80', fillOpacity: 0.12 }),
      ],
    })
  }, [nbs])

  // Pixel position of every dot, for hit-testing and the highlight rings.
  const pts = useMemo<Pt[]>(() => {
    const sx = plot?.scale('x'), sy = plot?.scale('y')
    if (!sx || !sy) return []
    return nbs.map((p) => ({ p, x: sx.apply(p.canopy) as number, y: sy.apply(p.heat) as number }))
  }, [plot, nbs])

  useEffect(() => {
    const el = box.current
    if (!el || !plot) return
    el.replaceChildren(plot)
    return () => plot.remove()
  }, [plot])

  const nearest = (e: { clientX: number; clientY: number }) => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return null
    const mx = e.clientX - r.left, my = e.clientY - r.top
    let best: Pt | null = null, bd = 144 // 12 px radius
    for (const q of pts) {
      const d = (q.x - mx) ** 2 + (q.y - my) ** 2
      if (d < bd) { bd = d; best = q }
    }
    return best
  }

  const hovered = pts.find((q) => q.p.name === hoveredNb)
  const selected = pts.find((q) => q.p.name === selectedNb)

  return (
    <div>
      <div
        className="relative cursor-crosshair"
        style={{ width: W, height: H }}
        onPointerMove={(e) => {
          const q = nearest(e)
          setHoveredIfChanged(q ? { nb: q.p.name } : {})
        }}
        onPointerLeave={() => setHoveredIfChanged({})}
        onClick={(e) => {
          const q = nearest(e)
          if (q) focusNb(q.p.name)
        }}
        role="img"
        aria-label="Scatter plot of tree canopy versus afternoon temperature by neighborhood"
      >
        <div ref={box} className="absolute inset-0" />
        {selected && (
          <span
            className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-400"
            style={{ left: selected.x, top: selected.y }}
          />
        )}
        {hovered && (
          <>
            <span
              className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/30"
              style={{ left: hovered.x, top: hovered.y }}
            />
            <span
              className="pointer-events-none absolute z-10 -translate-y-full rounded-md bg-black/85 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-white"
              style={{ left: Math.min(hovered.x + 6, W - 150), top: hovered.y - 6 }}
            >
              {hovered.p.name} · {fmtPct(hovered.p.canopy)} · {fmtF(hovered.p.heat)}
            </span>
          </>
        )}
      </div>
      {regression && (
        <p className="mt-1 text-xs text-white/60">
          Each dot is a neighborhood. Every +10 points of canopy ≈{' '}
          <b className="text-white">{fmtF(Math.abs(regression.slopeFPer10pct))} {regression.slopeFPer10pct <= 0 ? 'cooler' : 'warmer'}</b>
          {' '}(r² = {regression.r2.toFixed(2)}, n = {regression.n}).
        </p>
      )}
    </div>
  )
}
