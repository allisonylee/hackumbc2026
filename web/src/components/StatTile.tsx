import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { AnimatedNumber } from './AnimatedNumber'

type Props = {
  label: string
  value: number
  format?: (n: number) => string
  /** small line under the value, e.g. "vs. 40% goal" */
  hint?: ReactNode
  delta?: { value: number; format?: (n: number) => string; goodWhen?: 'up' | 'down' }
  accent?: string
  className?: string
  /** quicker number animation */
  fast?: boolean
}

export function StatTile({ label, value, format, hint, delta, accent, className, fast }: Props) {
  const good = delta && (delta.goodWhen === 'down' ? delta.value <= 0 : delta.value >= 0)
  return (
    <div className={cn('rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5', className)}>
      <div className="text-[11px] font-medium uppercase tracking-wider text-white/50">{label}</div>
      <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums" style={accent ? { color: accent } : undefined}>
        <AnimatedNumber value={value} format={format} fast={fast} />
      </div>
      {delta && (
        <div className={cn('text-xs tabular-nums', good ? 'text-emerald-400' : 'text-rose-400')}>
          {(delta.format ?? ((n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`))(delta.value)}
        </div>
      )}
      {hint && <div className="mt-0.5 text-xs text-white/50">{hint}</div>}
    </div>
  )
}
