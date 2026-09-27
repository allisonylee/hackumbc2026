import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AppData, Hex, Stats } from '@/lib/types'
import type { LgbDump } from './heatModel'
import { getDerived, nbHexSummary } from './derived'
import { whatIf } from './whatIf'

// Runs against the committed data files (mock or real) in web/public/data.
const dir = resolve(import.meta.dirname, '../../../public/data')
const read = <T,>(f: string) => JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as T
const hexes = read<Hex[]>('hexes.json')
const data = {
  hexes,
  hexById: new Map(hexes.map((h) => [h.h3, h])),
  stats: read<Stats>('stats.json'),
  nbs: read<AppData['nbs']>('neighborhoods.geojson'),
  holc: read<AppData['holc']>('holc.geojson'),
} as unknown as AppData

// Heat drops 1°F when canopy passes 0.3 (monotone like the real model).
const stepModel: LgbDump = {
  feature_names: ['canopy', 'imperv', 'canopyLag1', 'waterNear'],
  tree_info: [{
    tree_structure: {
      split_feature: 0, threshold: 0.3, decision_type: '<=', default_left: true, missing_type: 'None',
      left_child: { leaf_value: 95 }, right_child: { leaf_value: 94 },
    },
  }],
}

describe('what-if', () => {
  const nb = [...getDerived(data).hexesByNb.entries()].sort((a, b) => b[1].length - a[1].length)[0][0]
  const s = nbHexSummary(data, nb)!

  it('summarizes the neighborhood hexes', () => {
    expect(s.n).toBeGreaterThan(0)
    expect(getDerived(data).cityMedianF).toBeGreaterThan(50)
  })

  it('linear fallback: more canopy → cooler, no change at the current canopy', () => {
    const same = whatIf(data, null, nb, s.canopy)!
    expect(same.method).toBe('linear')
    expect(Math.abs(same.meanDelta)).toBeLessThan(1e-9)
    const more = whatIf(data, null, nb, Math.min(1, s.canopy + 0.2))!
    if (data.stats.model.pdFPer10pct < 0) expect(more.meanDelta).toBeLessThan(0)
  })

  it('model path: re-predicts neighborhood and spill-over hexes', () => {
    const same = whatIf(data, stepModel, nb, s.canopy)!
    expect(same.method).toBe('model')
    for (const v of same.deltas.values()) expect(v).toBeCloseTo(0, 12)
    const all = whatIf(data, stepModel, nb, 1)!
    expect(all.meanDelta).toBeLessThanOrEqual(0)
    expect(all.deltas.size).toBeGreaterThanOrEqual(s.n)
  })
})
