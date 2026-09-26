"""Stage 2: counterfactual cooling curves, spillover and SHAP from the LightGBM model (plan §5.4–5.6).

All on 2021 land cover. A new tree's crown is canopy growing over pavement: planting Δ canopy in hex h sets
canopy += Δ and imperv −= Δ (as far as there is pavement), and updates every lag feature that includes h, using
each cell's real neighbor count (lags are means over raster-covered cells, as in features.py).

- gains: own-hex °F cooling per crown unit (25 m²). The model's cumulative curve is made non-decreasing, then
  replaced by its least concave majorant, so marginals are non-increasing (diminishing returns) and tree-model
  step functions are spread evenly instead of zeroed out. Total cooling at capacity is unchanged.
- spill: neighbor cooling at the hex's full capacity, Σ over the 36 hexes within 3 rings of pop × °F, divided by
  the hex's crown units → °F·people per crown unit (the optimizer multiplies by each tree's crown).
- shap: TreeExplainer on 2021 features; top 3 per hex and mean |SHAP| per feature.
- sensitivity: crown sizes × 0.5 and × 1.5; Spearman rank correlation and top-500 overlap of per-unit hex value.

Run: python -m pipeline.model.curves   (after train_heat)
"""
import json

import h3
import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from pipeline.config import CROWN_UNIT_M2, NMAX, NMAX_UNITS
from pipeline.io import read_interim, write_interim
from pipeline.model.train_heat import FEATS, MODEL_DIR, design

AREA = h3.average_hexagon_area(10, unit="m^2")


def concave_majorant(cum):
    """Least concave majorant of points (0, 0), (1, cum[0]), …; returns its values at 1..n."""
    y = np.concatenate([[0.0], cum])
    x = np.arange(len(y))
    hull = [0]
    for i in range(1, len(y)):
        while len(hull) >= 2:
            a, b = hull[-2], hull[-1]
            if (y[b] - y[a]) * (x[i] - x[a]) <= (y[i] - y[a]) * (x[b] - x[a]):
                hull.pop()
            else:
                break
        hull.append(i)
    return np.interp(x, x[hull], y[hull])[1:]


class Counterfactual:
    def __init__(self, model):
        self.model = model
        self.h, X = design("21")
        self.X = X.set_index(pd.Index(self.h))
        lc = read_interim("landcover")
        covered = set(lc.h3[lc.valid_m2 > 0])
        self.n1 = {c: sum(x in covered for x in h3.grid_disk(c, 1)) for c in self.h}
        self.n3 = {c: sum(x in covered for x in h3.grid_disk(c, 3)) for c in self.h}
        self.base = pd.Series(model.predict(self.X[FEATS]), index=self.h)

    def own_rows(self, c, deltas):
        """Feature rows for hex c after adding each Δ in `deltas` (canopy fraction)."""
        r = self.X.loc[c]
        can = np.minimum(r.canopy + deltas, 1.0)
        dc = can - r.canopy
        imp = np.maximum(r.imperv - dc, 0.0)
        di = r.imperv - imp
        rows = pd.DataFrame({f: np.full(len(deltas), r[f]) for f in FEATS})
        rows["canopy"], rows["imperv"] = can, imp
        rows["canopyLag1"] = r.canopyLag1 + dc / self.n1[c]
        rows["canopyLag3"] = r.canopyLag3 + dc / self.n3[c]
        rows["impervLag1"] = np.maximum(r.impervLag1 - di / self.n1[c], 0)
        rows["impervLag3"] = np.maximum(r.impervLag3 - di / self.n3[c], 0)
        return rows, dc[-1], di[-1]

    def neighbor_rows(self, c, dc, di):
        """Rows for the in-grid cells within 3 rings of c (excluding c) after c gains dc canopy / loses di pavement."""
        ring1 = set(h3.grid_ring(c, 1))
        cells = [x for x in h3.grid_disk(c, 3) if x != c and x in self.base.index]
        rows = self.X.loc[cells, FEATS].copy()
        in1 = np.array([x in ring1 for x in cells])
        n1 = np.array([self.n1[x] for x in cells])
        n3 = np.array([self.n3[x] for x in cells])
        rows.loc[in1, "canopyLag1"] += dc / n1[in1]
        rows.loc[in1, "impervLag1"] = np.maximum(rows.loc[in1, "impervLag1"] - di / n1[in1], 0)
        rows["canopyLag3"] += dc / n3
        rows["impervLag3"] = np.maximum(rows["impervLag3"] - di / n3, 0)
        return cells, rows

    def run(self, units, pop, scale=1.0):
        """units: h3 → crown units; returns (gains dict, spill dict, cum-at-capacity dict)."""
        step = scale * CROWN_UNIT_M2 / AREA
        own_batches, nbr_batches, meta = [], [], []
        for c, u in units.items():
            if u <= 0:
                continue
            rows, dc, di = self.own_rows(c, step * np.arange(1, u + 1))
            cells, nrows = self.neighbor_rows(c, dc, di)
            own_batches.append(rows)
            nbr_batches.append(nrows)
            meta.append((c, u, cells))
        own_pred = self.model.predict(pd.concat(own_batches, ignore_index=True)[FEATS])
        nbr_all = pd.concat(nbr_batches)
        nbr_pred = self.model.predict(nbr_all[FEATS])
        nbr_base = self.base.loc[nbr_all.index].to_numpy()
        gains, spill, cap_cool = {}, {}, {}
        i = j = 0
        for c, u, cells in meta:
            cum = self.base[c] - own_pred[i:i + u]
            i += u
            cum = np.maximum.accumulate(np.clip(cum, 0, None))
            maj = concave_majorant(cum)
            marg = np.diff(np.concatenate([[0.0], maj]))
            gains[c] = np.maximum(np.minimum.accumulate(marg), 0)
            cap_cool[c] = float(maj[-1])
            k = len(cells)
            cool = np.clip(nbr_base[j:j + k] - nbr_pred[j:j + k], 0, None)
            j += k
            spill[c] = float(sum(pop.get(x, 0.0) * v for x, v in zip(cells, cool)) / u)
        return gains, spill, cap_cool


def build():
    model = lgb.Booster(model_file=str(MODEL_DIR / "heat_lgbm.txt"))
    cf = Counterfactual(model)
    sites = read_interim("sites")
    units = {c: int(min(g.crown.head(NMAX).sum(), NMAX_UNITS)) for c, g in sites.groupby("h3")}
    pop = read_interim("social").set_index("h3")["pop"].to_dict()

    gains, spill, cap_cool = cf.run(units, pop)
    all_zero = sum(1 for g in gains.values() if g.max() == 0)
    print(f"curves: {len(gains):,} hexes with sites; all-zero own gains in {all_zero} ({all_zero / len(gains):.1%})")

    def value(g, s, cc):
        return pd.Series({c: cc[c] * pop.get(c, 0) / units[c] + s[c] for c in g})
    v1 = value(gains, spill, cap_cool)
    sens = {}
    for sc in (0.5, 1.5):
        g2, s2, c2 = cf.run(units, pop, scale=sc)
        v2 = value(g2, s2, c2).loc[v1.index]
        top1, top2 = set(v1.nlargest(500).index), set(v2.nlargest(500).index)
        sens[f"crown_x{sc}"] = dict(spearman=float(spearmanr(v1, v2).statistic), top500overlap=len(top1 & top2) / 500)
    print("crown-size sensitivity:", sens)

    import shap
    X21 = cf.X[FEATS]
    sv = shap.TreeExplainer(model).shap_values(X21)
    importance = sorted(((f, float(np.abs(sv[:, i]).mean())) for i, f in enumerate(FEATS)), key=lambda t: -t[1])
    top3 = [json.dumps([[FEATS[k], round(float(row[k]), 3)] for k in np.argsort(-np.abs(row))[:3]]) for row in sv]

    pred18 = model.predict(design("18")[1][FEATS])
    out = pd.DataFrame({
        "h3": cf.h, "heatPred": cf.base.to_numpy(), "heatPred18": pred18,
        "gains": [json.dumps([round(float(x), 4) for x in gains[c]]) if c in gains else "[]" for c in cf.h],
        "spill": [spill.get(c, 0.0) for c in cf.h], "shap": top3,
    })
    g0 = np.array([g[0] for g in gains.values()])
    stats = dict(importance=importance, sensitivity=sens, allZeroShare=all_zero / len(gains),
                 gain0Median=float(np.median(g0)), spillMedian=float(np.median(list(spill.values()))),
                 ownVsSpillMedianRatio=float(np.median([cap_cool[c] * pop.get(c, 0) / units[c] / max(spill[c], 1e-12) for c in gains])))
    (MODEL_DIR / "curves_stats.json").write_text(json.dumps(stats, indent=1))
    print(f"gain[0] median {stats['gain0Median']:.5f} °F/unit; spill median {stats['spillMedian']:.3f} °F·people/unit; "
          f"own/spill median ratio {stats['ownVsSpillMedianRatio']:.2f}")
    print("importance:", [(f, round(v, 3)) for f, v in importance])
    write_interim(out, "curves")
    dump_browser_model(model)


PRUNE_KEEP = {"split_feature", "threshold", "decision_type", "default_left", "missing_type", "left_child",
              "right_child", "leaf_value"}


def prune(node):
    out = {k: v for k, v in node.items() if k in PRUNE_KEEP}
    for k in ("left_child", "right_child"):
        if k in out:
            out[k] = prune(out[k])
    return out


def dump_browser_model(model):
    d = model.dump_model()
    slim = {"feature_names": d["feature_names"], "objective": d.get("objective"),
            "average_output": d.get("average_output", False),
            "tree_info": [{"tree_structure": prune(t["tree_structure"])} for t in d["tree_info"]]}
    path = MODEL_DIR / "heat_model.json"
    path.write_text(json.dumps(slim, separators=(",", ":")))
    print(f"heat_model.json: {len(slim['tree_info'])} trees, {path.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    build()
