/**
 * Small fuzzy matcher for neighborhood names: 1 for a prefix match, high for a word-start or
 * substring match, lower for an in-order subsequence, 0 when the query letters don't all appear in order.
 */
export function fuzzyScore(name: string, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 1
  const n = name.toLowerCase()
  if (n.startsWith(q)) return 1
  const idx = n.indexOf(q)
  if (idx > 0) return /[\s\-/'.]/.test(n[idx - 1]) ? 0.9 : 0.75
  // subsequence, rewarding consecutive letters and word starts
  let qi = 0, score = 0, run = 0
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] === q[qi]) {
      run++
      score += run + (i === 0 || /[\s\-/'.]/.test(n[i - 1]) ? 2 : 0)
      qi++
    } else run = 0
  }
  if (qi < q.length) return 0
  return Math.min(0.7, 0.1 + score / (q.length * 6))
}
