import type { ChatEvent } from '@/lib/types'

/**
 * Incremental NDJSON decoder for the chat stream (CONTRACTS.md, Chat API).
 * Feed it text chunks as they arrive; it returns the complete events so far and
 * keeps any partial trailing line for the next chunk. Call `flush()` at end of
 * stream to parse a final line that had no trailing newline.
 * Blank, malformed and unknown lines are skipped (counted in `skipped`).
 */
export class NdjsonDecoder {
  private buf = ''
  skipped = 0

  push(chunk: string): ChatEvent[] {
    this.buf += chunk
    const lines = this.buf.split('\n')
    this.buf = lines.pop() ?? ''
    return this.parseLines(lines)
  }

  flush(): ChatEvent[] {
    const rest = this.buf
    this.buf = ''
    return this.parseLines([rest])
  }

  private parseLines(lines: string[]): ChatEvent[] {
    const out: ChatEvent[] = []
    for (const raw of lines) {
      const line = raw.trim()
      if (!line) continue
      const ev = toEvent(line)
      if (ev) out.push(ev)
      else this.skipped++
    }
    return out
  }
}

/** Parses one line into a validated ChatEvent, or null if it isn't one. */
export function toEvent(line: string): ChatEvent | null {
  let o: unknown
  try {
    o = JSON.parse(line)
  } catch {
    return null
  }
  if (!o || typeof o !== 'object') return null
  const e = o as Record<string, unknown>
  switch (e.type) {
    case 'sources': {
      if (!Array.isArray(e.items)) return null
      const items = e.items
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .map((s) => ({ n: Number(s.n), title: String(s.title ?? ''), url: String(s.url ?? '') }))
        .filter((s) => Number.isFinite(s.n))
      return { type: 'sources', items }
    }
    case 'token':
      return typeof e.text === 'string' ? { type: 'token', text: e.text } : null
    case 'done':
      return {
        type: 'done',
        tokens: Number(e.tokens) || 0,
        energyWh: Number(e.energyWh) || 0,
        measured: e.measured === true,
        cached: e.cached === true,
      }
    case 'error':
      return { type: 'error', message: String(e.message ?? 'Unknown error') }
    default:
      return null
  }
}

/** Reads a byte stream of NDJSON and yields events as they complete. */
export async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = body.getReader()
  const text = new TextDecoder()
  const dec = new NdjsonDecoder()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      yield* dec.push(text.decode(value, { stream: true }))
    }
    yield* dec.push(text.decode())
    yield* dec.flush()
  } finally {
    reader.releaseLock()
  }
}
