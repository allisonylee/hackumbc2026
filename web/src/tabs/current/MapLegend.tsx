import { useStore } from '@/store'
import { BivariateLegend, ContinuousLegend } from '@/components/Legend'
import { RAMPS } from '@/lib/colors'
import { fmtF, fmtPct, fmtSignedF, fmtUsd } from '@/lib/format'
import { useDerived } from './derived'

export function MapLegend() {
  const { colorBy, modelView, bivariate, heightByHeat } = useStore((s) => s.current)
  const mode3d = useStore((s) => s.map.mode3d)
  const derived = useDerived()
  if (!derived) return null
  const { domains: d, cityMedianF } = derived

  let body
  if (bivariate) {
    body = (
      <div>
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-white/60">
          Canopy × {bivariate === 'heat' ? 'heat' : 'income'} (terciles)
        </div>
        <BivariateLegend xLabel={bivariate === 'heat' ? 'heat' : 'low income'} yLabel="canopy" />
      </div>
    )
  } else {
    const props = {
      canopy: { title: 'Tree canopy', ramp: RAMPS.canopy, lo: fmtPct(d.canopy[0]), hi: `${fmtPct(d.canopy[1])}+` },
      heat: { title: 'Afternoon air temperature', ramp: RAMPS.heat, lo: fmtF(d.heat[0]), hi: fmtF(d.heat[1]) },
      income: { title: 'Median household income', ramp: RAMPS.income, lo: fmtUsd(d.income[0]), hi: fmtUsd(d.income[1]) },
      asthma: { title: 'Adults with asthma', ramp: RAMPS.asthma, lo: `${d.asthma[0].toFixed(1)}%`, hi: `${d.asthma[1].toFixed(1)}%` },
      model:
        modelView === 'pred'
          ? { title: 'Model-predicted temperature', ramp: RAMPS.heat, lo: fmtF(d.heat[0]), hi: fmtF(d.heat[1]) }
          : { title: 'Measured − predicted', ramp: RAMPS.residual, lo: fmtSignedF(d.resid[0]), mid: '0', hi: fmtSignedF(d.resid[1]) },
    }[colorBy]
    body = (
      <>
        <ContinuousLegend {...props} />
        {colorBy === 'model' && modelView === 'resid' && (
          <div className="mt-1 flex justify-between text-[10px] text-white/45">
            <span>cooler than predicted</span>
            <span>hotter than predicted</span>
          </div>
        )}
        {(colorBy === 'income' || colorBy === 'asthma' || (colorBy === 'model' && modelView === 'resid')) && (
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-white/45">
            <span className="inline-block size-2 rounded-sm bg-[#787878]" /> no data
          </div>
        )}
      </>
    )
  }

  return (
    <section className="glass pointer-events-auto w-fit p-3 text-white" aria-label="Legend">
      {body}
      {mode3d && heightByHeat && !bivariate && (
        <div className="mt-2 max-w-52 text-[11px] leading-snug text-white/50">
          Height: °F above the city median ({fmtF(cityMedianF)})
        </div>
      )}
    </section>
  )
}
