import { describe, expect, it } from 'vitest'
import type { ChatEvent, ChatMessage } from '@/lib/types'
import { NdjsonDecoder, readNdjson, toEvent } from './ndjson'
import { citedNumbers, parseCitations } from './citations'
import { MAX_CHARS, MAX_MESSAGES, prepareMessages, resolveProvider } from './llm'
import { retrieve } from './mock'

const SRC = '{"type":"sources","items":[{"n":1,"title":"A","url":"https://a"}]}'
const TOK = (t: string) => JSON.stringify({ type: 'token', text: t })
const DONE = '{"type":"done","tokens":212,"energyWh":0.021,"measured":true,"cached":false}'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch))
      c.close()
    },
  })
}
async function collect(g: AsyncGenerator<ChatEvent>) {
  const out: ChatEvent[] = []
  for await (const e of g) out.push(e)
  return out
}

describe('NdjsonDecoder', () => {
  it('parses whole lines', () => {
    const d = new NdjsonDecoder()
    const evs = d.push(`${SRC}\n${TOK('Trees ')}\n${DONE}\n`)
    expect(evs.map((e) => e.type)).toEqual(['sources', 'token', 'done'])
    expect(evs[2]).toEqual({ type: 'done', tokens: 212, energyWh: 0.021, measured: true, cached: false })
  })

  it('handles lines split across chunks', () => {
    const d = new NdjsonDecoder()
    const all = `${TOK('Trees ')}\n${TOK('cool')}\n`
    const out: ChatEvent[] = []
    for (let i = 0; i < all.length; i += 7) out.push(...d.push(all.slice(i, i + 7)))
    expect(out).toEqual([{ type: 'token', text: 'Trees ' }, { type: 'token', text: 'cool' }])
  })

  it('keeps a partial line until it completes and flushes a trailing line without newline', () => {
    const d = new NdjsonDecoder()
    expect(d.push('{"type":"token","te')).toEqual([])
    expect(d.push('xt":"hi"}\n{"type":"to')).toEqual([{ type: 'token', text: 'hi' }])
    expect(d.push('ken","text":"!"}')).toEqual([])
    expect(d.flush()).toEqual([{ type: 'token', text: '!' }])
  })

  it('skips malformed, blank and unknown lines', () => {
    const d = new NdjsonDecoder()
    const evs = d.push(`not json\n\n  \n{"type":"weird"}\n${TOK('ok')}\r\n{"type":"token"}\n`)
    expect(evs).toEqual([{ type: 'token', text: 'ok' }])
    expect(d.skipped).toBe(3)
  })

  it('handles CRLF and multibyte text split across byte chunks', async () => {
    const bytes = new TextEncoder().encode(`${TOK('°F ')}\r\n${DONE}`)
    const cut = bytes.indexOf(0xb0) // split inside the 2-byte "°"
    const s = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut))
        c.enqueue(bytes.slice(cut))
        c.close()
      },
    })
    const evs = await collect(readNdjson(s))
    expect(evs[0]).toEqual({ type: 'token', text: '°F ' })
    expect(evs[1].type).toBe('done')
  })

  it('readNdjson yields events from a stream with a trailing line', async () => {
    const evs = await collect(readNdjson(streamOf([SRC + '\n' + TOK('a'), '\n', DONE])))
    expect(evs.map((e) => e.type)).toEqual(['sources', 'token', 'done'])
  })

  it('toEvent coerces done fields and validates sources', () => {
    expect(toEvent('{"type":"done"}')).toEqual({ type: 'done', tokens: 0, energyWh: 0, measured: false, cached: false })
    expect(toEvent('{"type":"sources","items":[{"n":"2","title":"T","url":"u"},{"n":"x"},null]}')).toEqual({
      type: 'sources', items: [{ n: 2, title: 'T', url: 'u' }],
    })
    expect(toEvent('[1,2]')).toBeNull()
  })
})

describe('parseCitations', () => {
  it('splits text and citations', () => {
    expect(parseCitations('Trees cool [1]. Shade helps [2].')).toEqual([
      { kind: 'text', text: 'Trees cool ' },
      { kind: 'cite', n: 1 },
      { kind: 'text', text: '. Shade helps ' },
      { kind: 'cite', n: 2 },
      { kind: 'text', text: '.' },
    ])
  })

  it('expands groups and adjacent citations', () => {
    expect(parseCitations('A [1, 3][2]')).toEqual([
      { kind: 'text', text: 'A ' },
      { kind: 'cite', n: 1 },
      { kind: 'cite', n: 3 },
      { kind: 'cite', n: 2 },
    ])
  })

  it('leaves non-citations and unclosed brackets as text', () => {
    expect(parseCitations('see [a] and [] and [123] and [1')).toEqual([
      { kind: 'text', text: 'see [a] and [] and [123] and [1' },
    ])
    expect(parseCitations('')).toEqual([])
  })

  it('citedNumbers is unique in first-use order', () => {
    expect(citedNumbers('x [2] y [1,2] z [3]')).toEqual([2, 1, 3])
  })
})

describe('llm helpers', () => {
  it('resolveProvider picks mock, local, server', () => {
    expect(resolveProvider({ hostname: 'x.org', search: '?llm=mock' }, 'https://api').kind).toBe('mock')
    expect(resolveProvider({ hostname: 'localhost', search: '' }, 'https://api').url).toBe('http://localhost:8000/api/chat')
    expect(resolveProvider({ hostname: 'x.org', search: '?llm=local' }, undefined).kind).toBe('local')
    expect(resolveProvider({ hostname: 'x.org', search: '' }, 'https://api.x.org/').url).toBe('https://api.x.org/api/chat')
    expect(resolveProvider({ hostname: 'x.org', search: '' }, undefined).url).toBeNull()
  })

  it('prepareMessages caps length and count and starts with a user turn', () => {
    const msgs: ChatMessage[] = Array.from({ length: 13 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: i === 12 ? 'x'.repeat(MAX_CHARS + 50) : ` m${i} `,
    }))
    const out = prepareMessages(msgs)
    expect(out.length).toBeLessThanOrEqual(MAX_MESSAGES)
    expect(out[0].role).toBe('user')
    expect(out[out.length - 1].content.length).toBe(MAX_CHARS)
    expect(out[0].content).toBe(out[0].content.trim())
  })

  it('mock retrieval ranks by keyword overlap', () => {
    const chunks = [
      { id: '1', title: 'Volunteering', url: '', source: '', text: 'help plant' },
      { id: '2', title: 'Narrow sidewalk trees', url: '', source: '', text: 'small trees' },
    ]
    expect(retrieve(chunks, 'Which tree fits a narrow sidewalk?', 1)[0].id).toBe('2')
  })
})
