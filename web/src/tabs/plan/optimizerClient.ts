// Main-thread client for the optimizer worker. One shared worker for the whole app (Plan tab + story).
import { useStore } from '@/store'
import type { Baselines, Params, Result } from '@/lib/types'
import type { WorkerRequest, WorkerResponse } from './optimizer.worker'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type Pending = { resolve: (v: { result: unknown; ms: number }) => void; reject: (e: Error) => void }

let worker: Worker | null = null
let ready: Promise<unknown> | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function send(msg: DistributiveOmit<WorkerRequest, 'id'>): Promise<{ result: unknown; ms: number }> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker!.postMessage({ ...msg, id })
  })
}

function ensureWorker() {
  if (ready) return ready
  const data = useStore.getState().data
  if (!data) return Promise.reject(new Error('data not loaded'))
  worker = new Worker(new URL('./optimizer.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const p = pending.get(e.data.id)
    if (!p) return
    pending.delete(e.data.id)
    if (e.data.ok) p.resolve({ result: e.data.result, ms: e.data.ms })
    else p.reject(new Error(e.data.error))
  }
  const nbTes: Record<string, number> = {}
  for (const f of data.nbs.features) if (f.properties.tes != null) nbTes[f.properties.name] = f.properties.tes
  ready = send({
    type: 'init',
    payload: {
      hexes: data.hexes,
      sites: data.sites,
      treeBenefits: data.stats.treeBenefits,
      nbTes,
    },
  })
  return ready
}

async function run<T>(type: 'allocate' | 'baselines', params: Params) {
  await ensureWorker()
  const r = await send({ type, params })
  return { result: r.result as T, ms: r.ms }
}

export const optimizer = {
  allocate: (p: Params) => run<Result>('allocate', p),
  baselines: (p: Params) => run<Baselines>('baselines', p),
}

/**
 * Wraps an async function so only the latest call's result is delivered; results of calls that were
 * superseded while in flight resolve to null. Use for slider-driven requests.
 */
export function latestOnly<A, R>(fn: (a: A) => Promise<R>): (a: A) => Promise<R | null> {
  let seq = 0
  return async (a: A) => {
    const mine = ++seq
    const r = await fn(a)
    return mine === seq ? r : null
  }
}

/** Average site cost, for converting a tree count into a budget. */
export function avgSiteCost() {
  const d = useStore.getState().data
  if (!d || !d.sites.length) return 1500
  return d.sites.reduce((s, x) => s + x.cost, 0) / d.sites.length
}
