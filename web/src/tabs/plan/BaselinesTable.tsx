import { useMemo } from 'react'
import { useStore } from '@/store'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fmtCompact, fmtF, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BASELINE_COLS, bestPerColumn, type BaselineCol, type BaselineRow } from './logic'

const COLS: Record<BaselineCol, { label: string; fmt: (n: number) => string; title: string }> = {
  coolingPersonF: { label: 'Cooling', fmt: fmtCompact, title: 'Person-°F of cooling (°F × residents)' },
  avgFTargeted: { label: 'Avg °F', fmt: (n) => fmtF(n, 2), title: 'Average cooling in targeted blocks' },
  shareLowIncome: { label: 'Low-inc.', fmt: (n) => fmtPct(n), title: 'Share of cooling in low-income blocks' },
  shareHolcCD: { label: 'HOLC C/D', fmt: (n) => fmtPct(n), title: 'Share of trees in redlined (C/D) areas' },
}

/** Your plan vs. simple strategies at the same budget; best value per column highlighted. */
export function BaselinesTable() {
  const result = useStore((s) => s.plan.result)
  const baselines = useStore((s) => s.plan.baselines)
  const rows = useMemo<BaselineRow[] | null>(() => {
    if (!result || !baselines) return null
    const r: BaselineRow[] = [
      { id: 'plan', label: 'Your plan', impact: result.impact },
      { id: 'random', label: 'Random', impact: baselines.random.impact },
      { id: 'lowestCanopy', label: 'Lowest canopy', impact: baselines.lowestCanopy.impact },
    ]
    if (baselines.tes) r.push({ id: 'tes', label: 'Tree Equity gap', impact: baselines.tes.impact })
    return r
  }, [result, baselines])
  const best = useMemo(() => (rows ? bestPerColumn(rows) : null), [rows])
  if (!rows || !best) return <div className="text-xs text-white/40">Computing baselines…</div>

  const random = rows[1].impact.coolingPersonF
  const ratio = random > 0 ? rows[0].impact.coolingPersonF / random : null

  return (
    <div className="space-y-1.5">
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="border-white/10 hover:bg-transparent">
            <TableHead className="h-7 px-1.5 text-[10px] text-white/50">Strategy</TableHead>
            {BASELINE_COLS.map((c) => (
              <TableHead key={c} title={COLS[c].title} className="h-7 px-1.5 text-right text-[10px] text-white/50">{COLS[c].label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className={cn('border-white/5 hover:bg-white/5', r.id === 'plan' && 'font-medium text-white')}>
              <TableCell className="px-1.5 py-1.5 text-white/80">{r.label}</TableCell>
              {BASELINE_COLS.map((c) => (
                <TableCell
                  key={c}
                  className={cn('px-1.5 py-1.5 text-right tabular-nums text-white/70', best[c] === r.id && 'font-semibold text-canopy')}
                >
                  {COLS[c].fmt(r.impact[c])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {ratio != null && ratio > 1 && (
        <p className="text-xs text-white/70">
          Same budget, <b className="text-canopy">{ratio.toFixed(1)}×</b> the cooling of planting at random.
        </p>
      )}
    </div>
  )
}
