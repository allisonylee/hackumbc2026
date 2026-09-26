import { describe, expect, it } from 'vitest'
import { isLgbDump, predict, predictTree, type LgbDump, type LgbSplit } from './heatModel'

// Hand-made 2-tree dump in LightGBM's dump_model() shape.
// Tree 0: f0 <= 0.5 (NaN → left) ? 1 : (f1 <= 10 (missing None) ? 2 : 3)
// Tree 1: a single leaf 0.5
const model: LgbDump = {
  feature_names: ['canopy', 'imperv'],
  objective: 'regression',
  tree_info: [
    {
      tree_structure: {
        split_feature: 0, threshold: 0.5, decision_type: '<=', default_left: true, missing_type: 'NaN',
        left_child: { leaf_index: 0, leaf_value: 1 },
        right_child: {
          split_feature: 1, threshold: 10, decision_type: '<=', default_left: false, missing_type: 'None',
          left_child: { leaf_index: 1, leaf_value: 2 },
          right_child: { leaf_index: 2, leaf_value: 3 },
        },
      },
    },
    { tree_structure: { leaf_value: 0.5 } },
  ],
}

describe('heatModel.predict', () => {
  it('sums leaf values across trees', () => {
    expect(predict(model, [0.2, 0])).toBeCloseTo(1.5, 12)
    expect(predict(model, [0.7, 5])).toBeCloseTo(2.5, 12)
    expect(predict(model, [0.7, 20])).toBeCloseTo(3.5, 12)
  })

  it('treats the threshold as inclusive (<=)', () => {
    expect(predict(model, [0.5, 10])).toBeCloseTo(1.5, 12)
    expect(predict(model, [0.6, 10])).toBeCloseTo(2.5, 12)
  })

  it('handles missing values like LightGBM', () => {
    // missing_type NaN → default direction (left)
    expect(predict(model, [NaN, 20])).toBeCloseTo(1.5, 12)
    // missing_type None → NaN is treated as 0 (0 <= 10 → left)
    expect(predict(model, [0.7, NaN])).toBeCloseTo(2.5, 12)
    // undefined (feature not provided) behaves like NaN
    expect(predict(model, [0.7])).toBeCloseTo(2.5, 12)
  })

  it('handles missing_type Zero and categorical splits', () => {
    const zero: LgbSplit = {
      split_feature: 0, threshold: -1, decision_type: '<=', default_left: false, missing_type: 'Zero',
      left_child: { leaf_value: -1 }, right_child: { leaf_value: 1 },
    }
    expect(predictTree(zero, [0])).toBe(1) // zero → default (right), although 0 > -1 would also go right
    expect(predictTree({ ...zero, default_left: true }, [0])).toBe(-1)
    expect(predictTree({ ...zero, default_left: true }, [-2])).toBe(-1)
    const cat: LgbSplit = {
      split_feature: 0, threshold: '1||3', decision_type: '==', default_left: false, missing_type: 'NaN',
      left_child: { leaf_value: 10 }, right_child: { leaf_value: 20 },
    }
    expect(predictTree(cat, [3])).toBe(10)
    expect(predictTree(cat, [2])).toBe(20)
    expect(predictTree(cat, [NaN])).toBe(20)
  })

  it('averages when average_output is set (random-forest mode)', () => {
    expect(predict({ ...model, average_output: true }, [0.7, 20])).toBeCloseTo(1.75, 12)
  })

  it('validates the dump shape', () => {
    expect(isLgbDump(model)).toBe(true)
    expect(isLgbDump(null)).toBe(false)
    expect(isLgbDump({ feature_names: [], tree_info: [] })).toBe(false)
  })
})
