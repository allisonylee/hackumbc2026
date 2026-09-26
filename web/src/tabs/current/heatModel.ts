// Evaluator for a LightGBM `booster.dump_model()` JSON (CONTRACTS.md `heat_model.json`, plan §5.6).
// Walks each tree from the root and sums the leaf values. Mirrors LightGBM's NumericalDecision /
// CategoricalDecision rules, including missing-value handling, so predictions match Python.

export type LgbLeaf = { leaf_value: number; leaf_index?: number }
export type LgbSplit = {
  split_feature: number
  /** numeric threshold, or "a||b||c" category list for categorical splits */
  threshold: number | string
  decision_type: '<=' | '=='
  default_left: boolean
  missing_type: 'None' | 'Zero' | 'NaN'
  left_child: LgbNode
  right_child: LgbNode
}
export type LgbNode = LgbLeaf | LgbSplit
export type LgbDump = {
  feature_names: string[]
  tree_info: { tree_structure: LgbNode }[]
  average_output?: boolean
  objective?: string
}

const ZERO_THRESHOLD = 1e-35
const isLeaf = (n: LgbNode): n is LgbLeaf => (n as LgbSplit).split_feature === undefined

/** Which child a feature value goes to at one split. */
function goLeft(node: LgbSplit, raw: number | undefined): boolean {
  let v = raw === undefined || raw === null ? NaN : raw
  if (node.decision_type === '==') {
    // Categorical: NaN or negative → right; category in the list → left.
    if (Number.isNaN(v)) return false
    const c = Math.trunc(v)
    if (c < 0) return false
    return String(node.threshold).split('||').some((s) => Number(s) === c)
  }
  if (Number.isNaN(v) && node.missing_type !== 'NaN') v = 0
  if ((node.missing_type === 'Zero' && Math.abs(v) <= ZERO_THRESHOLD) || (node.missing_type === 'NaN' && Number.isNaN(v))) {
    return node.default_left
  }
  return v <= (node.threshold as number)
}

export function predictTree(root: LgbNode, x: ArrayLike<number>): number {
  let n = root
  while (!isLeaf(n)) n = goLeft(n, x[n.split_feature]) ? n.left_child : n.right_child
  return n.leaf_value
}

/** Raw score (identity link: the regression objective predicts °F directly). */
export function predict(model: LgbDump, x: ArrayLike<number>): number {
  let s = 0
  for (const t of model.tree_info) s += predictTree(t.tree_structure, x)
  return model.average_output && model.tree_info.length ? s / model.tree_info.length : s
}

/** Loose runtime check for the loaded JSON. */
export function isLgbDump(x: unknown): x is LgbDump {
  const m = x as LgbDump | null
  return !!m && Array.isArray(m.feature_names) && Array.isArray(m.tree_info) && m.tree_info.length > 0
}
