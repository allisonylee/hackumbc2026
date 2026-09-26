import { useEffect, useMemo } from 'react'
import { MapPin, X } from 'lucide-react'
import { useStore } from '@/store'
import { fmtInt, fmtUsd } from '@/lib/format'
import { bboxOf } from './logic'

/**
 * Shown when the Plan tab is opened from Current State's "Plan trees here" (store.plan.focusNb):
 * flies to the neighborhood (outlined in violet by the map layer), shows how many planned trees land there,
 * and offers to restrict the plan to it.
 */
export function FocusChip() {
  const focusNb = useStore((s) => s.plan.focusNb)
  const data = useStore((s) => s.data)
  const result = useStore((s) => s.plan.result)
  const excluded = useStore((s) => s.plan.params.excludeNbs)
  const setPlan = useStore((s) => s.setPlan)
  const setParams = useStore((s) => s.setParams)
  const feature = focusNb ? data?.nbByName.get(focusNb) : undefined

  // Fly there on entry (after the tab's own camera move has started, so this one wins).
  useEffect(() => {
    if (!feature) return
    const t = window.setTimeout(() => useStore.getState().fitBounds(bboxOf(feature.geometry), { pitch: 0, padding: 140, duration: 1400 }), 450)
    return () => window.clearTimeout(t)
  }, [feature])

  const here = useMemo(() => {
    if (!data || !result || !focusNb) return null
    let n = 0, cost = 0
    for (const id of result.siteIds) {
      const s = data.siteById.get(id)
      if (s?.nb === focusNb) {
        n++
        cost += s.cost
      }
    }
    return { n, cost }
  }, [data, result, focusNb])

  if (!focusNb || !feature || !data) return null
  const onlyHere = excluded.length === data.nbs.features.length - 1 && !excluded.includes(focusNb)
  const onlyHereNbs = data.nbs.features.map((f) => f.properties.name).filter((n) => n !== focusNb)

  return (
    <div className="rounded-lg border border-equity/40 bg-equity/10 px-3 py-2 text-xs">
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 size-3.5 shrink-0 text-equity" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-white">{focusNb}</div>
          {here && (
            <div className="text-white/70">
              {here.n ? `${fmtInt(here.n)} planned tree${here.n === 1 ? '' : 's'} here (${fmtUsd(here.cost)})` : 'No planned trees here at this budget'}
            </div>
          )}
          <button
            type="button"
            onClick={() => setParams({ excludeNbs: onlyHere ? [] : onlyHereNbs })}
            className="mt-1 text-equity underline-offset-2 hover:underline"
          >
            {onlyHere ? 'Plan citywide again' : 'Plan only in this neighborhood'}
          </button>
        </div>
        <button
          type="button"
          aria-label="Dismiss neighborhood focus"
          onClick={() => {
            if (onlyHere) setParams({ excludeNbs: [] })
            setPlan({ focusNb: null })
          }}
          className="rounded p-0.5 text-white/60 hover:bg-white/10 hover:text-white"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  )
}
