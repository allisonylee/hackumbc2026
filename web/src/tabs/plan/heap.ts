/** Minimal binary max-heap keyed by (score desc, id asc) so ties resolve deterministically. */
export class MaxHeap {
  private scores: number[] = []
  private ids: number[] = []

  get size() {
    return this.ids.length
  }

  private better(i: number, j: number) {
    const a = this.scores[i], b = this.scores[j]
    return a > b || (a === b && this.ids[i] < this.ids[j])
  }

  private swap(i: number, j: number) {
    ;[this.scores[i], this.scores[j]] = [this.scores[j], this.scores[i]]
    ;[this.ids[i], this.ids[j]] = [this.ids[j], this.ids[i]]
  }

  push(score: number, id: number) {
    this.scores.push(score)
    this.ids.push(id)
    let i = this.ids.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (!this.better(i, p)) break
      this.swap(i, p)
      i = p
    }
  }

  /** Removes and returns the id with the highest score, or -1 when empty. */
  pop(): number {
    const n = this.ids.length
    if (n === 0) return -1
    const top = this.ids[0]
    const lastS = this.scores.pop()!, lastI = this.ids.pop()!
    if (n > 1) {
      this.scores[0] = lastS
      this.ids[0] = lastI
      let i = 0
      for (;;) {
        const l = 2 * i + 1, r = l + 1
        let m = i
        if (l < n - 1 && this.better(l, m)) m = l
        if (r < n - 1 && this.better(r, m)) m = r
        if (m === i) break
        this.swap(i, m)
        i = m
      }
    }
    return top
  }
}
