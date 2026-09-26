/** A piece of an answer: plain text or a numbered citation like [2]. */
export type Segment = { kind: 'text'; text: string } | { kind: 'cite'; n: number }

// [1], [1, 2], [1,2,3] (a group of 1–2 digit numbers)
const CITE_RE = /\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g

/**
 * Splits answer text into text and citation segments.
 * "[1, 2]" becomes two cite segments; adjacent "[1][2]" too.
 * Anything that isn't a small number list (e.g. "[a]", "[]", "[123]") stays text.
 * A trailing unclosed "[1" (mid-stream) stays text until the bracket closes.
 */
export function parseCitations(text: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of text.matchAll(CITE_RE)) {
    const i = m.index ?? 0
    if (i > last) pushText(out, text.slice(last, i))
    for (const part of m[1].split(',')) out.push({ kind: 'cite', n: Number(part.trim()) })
    last = i + m[0].length
  }
  if (last < text.length) pushText(out, text.slice(last))
  return out
}

function pushText(out: Segment[], text: string) {
  const prev = out[out.length - 1]
  if (prev?.kind === 'text') prev.text += text
  else out.push({ kind: 'text', text })
}

/** Citation numbers used in the text, unique, in first-use order. */
export function citedNumbers(text: string): number[] {
  const seen = new Set<number>()
  for (const s of parseCitations(text)) if (s.kind === 'cite') seen.add(s.n)
  return [...seen]
}
