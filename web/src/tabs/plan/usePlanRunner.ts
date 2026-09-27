// Runs the optimizer when plan params change and writes results into store.plan (§8.1 worker protocol).
import { useEffect, useMemo, useRef } from 'react'
import { useStore } from '@/store'
import type { Params } from '@/lib/types'
import { latestOnly, optimizer } from './optimizerClient'
import { computeBirths, perturbedWeights, robustIds } from './logic'
import { usePlanUi } from './planUi'

const ALLOC_THROTTLE_MS = 100
const SECONDARY_DEBOUNCE_MS = 400
const ROBUST_DEBOUNCE_MS = 700

// Survive tab switches: don't recompute (and re-sprout) when returning with unchanged params.
let lastAllocParams: Params | null = null
let lastBaselinesKey = ''
let lastRobustKey = ''

const baselinesKey = (p: Params) => JSON.stringify({ b: p.budget, x: p.excludeNbs, u: p.avoidUtilities, y: p.years })

export function usePlanRunner() {
  const data = useStore((s) => s.data)
  const params = useStore((s) => s.plan.params)
  const robust = usePlanUi((s) => s.robust)

  const allocLatest = useMemo(() => latestOnly(optimizer.allocate), [])
  const baselinesLatest = useMemo(() => latestOnly(optimizer.baselines), [])
  const robustLatest = useMemo(
    () =>
      latestOnly(async (p: Params) => {
        const runs = await Promise.all(perturbedWeights(p.weights).map((weights) => optimizer.allocate({ ...p, weights })))
        return robustIds(runs.map((r) => r.result.siteIds))
      }),
    [],
  )

  const paramsRef = useRef(params)
  const timer = useRef<number | null>(null)
  const lastFire = useRef(0)

  // Allocate: throttled with a trailing call, so the map keeps updating while a slider is dragged.
  useEffect(() => {
    paramsRef.current = params
    if (!data) return
    if (params === lastAllocParams && useStore.getState().plan.result) return
    if (timer.current != null) return
    const fire = async () => {
      timer.current = null
      lastFire.current = performance.now()
      const p = paramsRef.current
      useStore.getState().setPlan({ computing: true })
      try {
        const r = await allocLatest(p)
        if (!r) return
        lastAllocParams = p
        const t0 = performance.now()
        const ui = usePlanUi.getState()
        const { births, lastBirth } = computeBirths(ui.births, r.result.siteIds, t0)
        ui.setBirths(births, Math.max(lastBirth, ui.lastBirth))
        useStore.getState().setPlan({ result: r.result, lastRunMs: r.ms, resultAt: t0, computing: paramsRef.current !== p })
      } catch (e) {
        console.error('optimizer', e)
        useStore.getState().setPlan({ computing: false })
      }
    }
    const wait = Math.max(16, ALLOC_THROTTLE_MS - (performance.now() - lastFire.current))
    timer.current = window.setTimeout(fire, wait)
  }, [params, data, allocLatest])

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current)
      timer.current = null
    },
    [],
  )

  // Baselines: debounced; skipped when only params they ignore changed.
  useEffect(() => {
    if (!data) return
    const bk = baselinesKey(params)
    if (bk === lastBaselinesKey && useStore.getState().plan.baselines) return
    const t = window.setTimeout(async () => {
      try {
        const br = await baselinesLatest(params)
        if (br) {
          lastBaselinesKey = bk
          useStore.getState().setPlan({ baselines: br.result })
        }
      } catch (e) {
        console.error('optimizer', e)
      }
    }, SECONDARY_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [params, data, baselinesLatest])

  // Robust picks (§8.5): 20 perturbed-weight allocations, only while the toggle is on.
  useEffect(() => {
    if (!data || !robust) return
    const key = JSON.stringify(params)
    if (key === lastRobustKey && usePlanUi.getState().robustIds) return
    usePlanUi.getState().setRobustIds(usePlanUi.getState().robustIds, true)
    const t = window.setTimeout(async () => {
      try {
        const ids = await robustLatest(params)
        if (!ids) return
        lastRobustKey = key
        usePlanUi.getState().setRobustIds(ids, false)
      } catch (e) {
        console.error('optimizer', e)
        usePlanUi.getState().setRobustIds(null, false)
      }
    }, ROBUST_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [params, data, robust, robustLatest])
}
