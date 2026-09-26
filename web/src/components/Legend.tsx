import { BIVARIATE, toCss, type Ramp } from '@/lib/colors'
import { cn } from '@/lib/utils'

type ContinuousProps = { title: string; ramp: Ramp; lo: string; hi: string; mid?: string; className?: string }

export function ContinuousLegend({ title, ramp, lo, hi, mid, className }: ContinuousProps) {
  const gradient = `linear-gradient(to right, ${ramp.stops.join(', ')})`
  return (
    <div className={cn('w-52', className)}>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-white/60">{title}</div>
      <div className="h-2.5 rounded-full" style={{ background: gradient }} />
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-white/60">
        <span>{lo}</span>
        {mid && <span>{mid}</span>}
        <span>{hi}</span>
      </div>
    </div>
  )
}

type BivariateProps = { xLabel: string; yLabel: string; className?: string }

/** 3×3 bivariate key rotated 45°. Rows: canopy tercile (inverted, low canopy at top); columns: x variable. */
export function BivariateLegend({ xLabel, yLabel, className }: BivariateProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="relative size-24">
        <div className="absolute inset-3 grid rotate-45 grid-cols-3 grid-rows-3 gap-px">
          {[2, 1, 0].flatMap((row) =>
            [0, 1, 2].map((col) => (
              <div key={`${row}${col}`} style={{ background: toCss(BIVARIATE[row * 3 + col]) }} />
            )),
          )}
        </div>
      </div>
      <div className="space-y-1 text-[11px] text-white/70">
        <div>↗ more {xLabel}</div>
        <div>↖ less {yLabel}</div>
      </div>
    </div>
  )
}
