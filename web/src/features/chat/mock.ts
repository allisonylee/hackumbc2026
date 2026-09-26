import { loadCorpusChunks } from '@/lib/data'
import type { ChatEvent, ChatMessage, ChatSource, CorpusChunk } from '@/lib/types'

/**
 * Mock chat provider (`?llm=mock`), for building and demoing the UI before the
 * backend exists. It does keyword retrieval over corpus_chunks.json (or a small
 * built-in set) and streams a canned, cited answer. No model runs, so the energy
 * in `done` is an estimate (measured: false).
 */

/**
 * Rough estimate: ~124 J for a ~250-token answer from a local 3B model on a Mac
 * (ML.ENERGY, see research.md §3) ≈ 0.5 J/token.
 */
export const MOCK_J_PER_TOKEN = 0.5

// Built-in placeholder corpus, used when corpus_chunks.json is missing. Paraphrased.
const BUILTIN: CorpusChunk[] = [
  {
    id: 'b1', title: "Baltimore's canopy goal", source: 'TreeBaltimore',
    url: 'https://www.baltimorecity.gov/bcrp/forestry/treebaltimore/canopy',
    text: 'Baltimore aims to cover 40% of the city with tree canopy by 2037. Canopy has hovered near 28% for years, so the city needs to plant and keep alive far more trees each year than it does now.',
  },
  {
    id: 'b2', title: 'How trees cool city blocks', source: 'Ziter et al. 2019, PNAS',
    url: 'https://www.pnas.org/doi/10.1073/pnas.1817561116',
    text: 'Trees cool streets by shading pavement and by releasing water vapor from their leaves. Cooling is strongest where canopy cover on a block passes about 40%, so clustering trees helps more than scattering them.',
  },
  {
    id: 'b3', title: 'Redlining and heat', source: 'Hoffman et al. 2020, Climate',
    url: 'https://www.mdpi.com/2225-1154/8/1/12',
    text: 'Neighborhoods graded "hazardous" by 1930s redlining maps are hotter today in many US cities, including Baltimore. They tend to have more pavement and fewer trees, which traps heat on summer afternoons.',
  },
  {
    id: 'b4', title: 'Request a free street tree', source: 'TreeBaltimore',
    url: 'https://www.treebaltimore.org/street-tree-request-form',
    text: 'Baltimore residents can request a free street tree for the planting strip in front of their home. You can also volunteer with groups like Baltimore Tree Trust or Blue Water Baltimore to plant and water trees.',
  },
  {
    id: 'b5', title: 'Trees for narrow sidewalks', source: 'USFS Northeast Community Tree Guide',
    url: 'https://www.itreetools.org/documents/443/PSW_GTR202_Northeast_CTG.pdf',
    text: 'Narrow tree lawns and spots under power lines call for small trees such as Eastern Redbud, Serviceberry or American Hornbeam. Large shade trees need wide planting strips and no overhead wires.',
  },
]

let corpus: Promise<CorpusChunk[]> | null = null
const getCorpus = () => (corpus ??= loadCorpusChunks().then((c) => (c && c.length ? c : BUILTIN)))

const STOP = new Set('the a an and or of to in is are why how what which do does can my i for on it be with this that'.split(' '))
const terms = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) ?? []

export function retrieve(chunks: CorpusChunk[], q: string, k = 2): CorpusChunk[] {
  const qt = terms(q)
  const scored = chunks.map((c, i) => {
    const title = c.title.toLowerCase()
    const text = c.text.toLowerCase()
    let score = 0
    for (const t of qt) {
      if (title.includes(t)) score += 3
      if (text.includes(t)) score += 1
    }
    return { c, score, i }
  })
  scored.sort((a, b) => b.score - a.score || a.i - b.i)
  return scored.slice(0, k).map((s) => s.c)
}

const firstSentences = (t: string, n: number) => (t.match(/[^.!?]+[.!?]+/g) ?? [t]).slice(0, n).join(' ').trim()

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
  })

export async function* mockChat(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<ChatEvent> {
  const q = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  const hits = retrieve(await getCorpus(), q)
  await sleep(350, signal)
  const sources: ChatSource[] = hits.map((c, i) => ({ n: i + 1, title: c.title, url: c.url }))
  yield { type: 'sources', items: sources }

  const body = hits.map((c, i) => `${firstSentences(c.text, 2)} [${i + 1}]`).join(' ')
  const answer = `(Mock answer: the real guide isn't connected yet.) ${body}`
  const words = answer.split(/(?<=\s)/)
  for (const w of words) {
    await sleep(22, signal)
    yield { type: 'token', text: w }
  }
  const tokens = Math.round(words.length * 1.3)
  yield { type: 'done', tokens, energyWh: (tokens * MOCK_J_PER_TOKEN) / 3600, measured: false, cached: false }
}
