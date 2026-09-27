/// <reference lib="webworker" />
import type { Params } from '@/lib/types'
import { allocate, baselines, prepare, type OptInput, type Prepared } from './optimizer'

export type WorkerRequest =
  | { id: number; type: 'init'; payload: OptInput }
  | { id: number; type: 'allocate' | 'baselines'; params: Params }
export type WorkerResponse = { id: number; ok: true; result: unknown; ms: number } | { id: number; ok: false; error: string }

let P: Prepared | null = null

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  const t0 = performance.now()
  try {
    let result: unknown = null
    if (msg.type === 'init') {
      P = prepare(msg.payload)
    } else {
      if (!P) throw new Error('optimizer not initialized')
      if (msg.type === 'allocate') result = allocate(P, msg.params)
      else result = baselines(P, msg.params)
    }
    self.postMessage({ id: msg.id, ok: true, result, ms: performance.now() - t0 } satisfies WorkerResponse)
  } catch (err) {
    self.postMessage({ id: msg.id, ok: false, error: String(err) } satisfies WorkerResponse)
  }
}
