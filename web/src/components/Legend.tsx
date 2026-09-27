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

/** 3×3 bivariate key. Rows: canopy tercile (inverted, low canopy at top); columns: x variable, increasing to the right. */
export function BivariateLegend({ xLabel, yLabel, className }: BivariateProps) {
  return (
    <div className={cn('flex items-stretch gap-1.5 text-[11px] text-white/70', className)}>
      <div className="flex w-4 items-center justify-center">
        <span className="-rotate-90 whitespace-nowrap">{yLabel} →</span>
      </div>
      <div>
        <div className="grid size-20 grid-cols-3 grid-rows-3 gap-px">
          {[2, 1, 0].flatMap((row) =>
            [0, 1, 2].map((col) => (
              <div key={`${row}${col}`} style={{ background: toCss(BIVARIATE[row * 3 + col]) }} />
            )),
          )}
        </div>
        <div className="mt-1 text-center">{xLabel} →</div>
      </div>
    </div>
  )
}
