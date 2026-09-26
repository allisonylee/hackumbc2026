"""Stage 2: LightGBM heat model (plan §5.2–5.3) → interim/model/heat_lgbm.txt + interim/model/results.json.

Target: afternoon air temperature (°F), NOAA Heat Watch 2018-08-29. Trained on 2018 land cover (X18); applied to
2021 (X21) by curves.py and the export. Physical features only; names match the browser what-if (whatIf.ts).
Monotone constraints: canopy features can never raise predicted heat; impervious features can never lower it, so
the curves' "canopy grows over pavement" swap never predicts warming.
Spatial CV: GroupKFold(5) by res-7 parent (~5 km² blocks). Baselines come from pipeline/model/linear.py.

Run: python -m pipeline.model.train_heat
"""
import itertools
import json
import time

import h3
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.model_selection import GroupKFold, KFold

from pipeline.config import INTERIM
from pipeline.io import read_interim
from pipeline.model import linear

FEATS = ["canopy", "imperv", "bldg", "road", "lowveg", "canopyLag1", "canopyLag3",
         "impervLag1", "impervLag3", "waterNear", "distHarborKm"]
MONO = {"canopy": -1, "canopyLag1": -1, "canopyLag3": -1, "imperv": 1, "impervLag1": 1, "impervLag3": 1}
BASE = dict(n_estimators=600, learning_rate=0.03, subsample=0.8, subsample_freq=1, colsample_bytree=0.8,
            reg_lambda=1.0, monotone_constraints_method="advanced", verbose=-1, random_state=0)
GRID = {"num_leaves": [15, 31, 63], "min_child_samples": [20, 50]}
MODEL_DIR = INTERIM / "model"
LIT_F_PER10 = (0.5, 1.5)  # plan §5.3: air-temperature slope per +10% canopy, °F


def design(year):
    """Feature frame with the model's column names for 2018 or 2021 land cover."""
    f = read_interim("features")
    return f.h3.to_numpy(), pd.DataFrame({k: f[c] for k, c in zip(FEATS, linear.columns(year, FEATS))})


def params(**kw):
    p = dict(BASE, **kw)
    p["monotone_constraints"] = [MONO.get(f, 0) for f in FEATS]
    return p


def cv(X, y, groups, splitter, p):
    pred = np.empty(len(y))
    for tr, te in splitter.split(X, y, groups):
        pred[te] = lgb.LGBMRegressor(**p).fit(X.iloc[tr], y[tr]).predict(X.iloc[te])
    res = y - pred
    return dict(r2=float(1 - (res ** 2).sum() / ((y - y.mean()) ** 2).sum()),
                rmse=float(np.sqrt((res ** 2).mean())), mae=float(np.abs(res).mean())), pred


def area_slope(model, X, step=0.10):
    """°F change when a whole area gains `step` canopy (own + lag features), taking it from pavement."""
    Xs = X.copy()
    for c in ("canopy", "canopyLag1", "canopyLag3"):
        Xs[c] = np.minimum(X[c] + step, 1)
    for c, s in (("imperv", "canopy"), ("impervLag1", "canopyLag1"), ("impervLag3", "canopyLag3")):
        Xs[c] = np.maximum(X[c] - (Xs[s] - X[s]), 0)
    return float((model.predict(Xs) - model.predict(X)).mean())


def pd_curve(model, X, grid=np.linspace(0, 0.8, 17)):
    """Partial dependence on area-wide canopy (own + lags set to the grid value)."""
    out = []
    for g in grid:
        Xg = X.copy()
        for c in ("canopy", "canopyLag1", "canopyLag3"):
            Xg[c] = g
        out.append([round(float(g), 2), round(float(model.predict(Xg).mean()), 2)])
    return out


def train():
    h, X18 = design("18")
    heat = read_interim("heat").set_index("h3").loc[h, "heat"].to_numpy()
    ok = np.isfinite(heat)
    X, y = X18[ok].reset_index(drop=True), heat[ok]
    groups = np.array([h3.cell_to_parent(c, 7) for c in h[ok]])
    gkf = GroupKFold(5)

    lin = linear.fit()
    tuning = []
    for nl, mcs in itertools.product(GRID["num_leaves"], GRID["min_child_samples"]):
        s, _ = cv(X, y, groups, gkf, params(num_leaves=nl, min_child_samples=mcs))
        tuning.append(dict(num_leaves=nl, min_child_samples=mcs, **s))
        print(f"  num_leaves={nl:2d} min_child={mcs:2d}  spatial R² {s['r2']:.3f}  RMSE {s['rmse']:.3f}")
    best = min(tuning, key=lambda t: t["rmse"])
    p = params(num_leaves=best["num_leaves"], min_child_samples=best["min_child_samples"])
    spatial, oof = cv(X, y, groups, gkf, p)
    random, _ = cv(X, y, None, KFold(5, shuffle=True, random_state=0), p)
    t0 = time.time()
    model = lgb.LGBMRegressor(**p).fit(X, y)
    train_s = time.time() - t0

    # --- checks (plan §5.3) ---
    slope = area_slope(model, X)
    pdc = pd_curve(model, X)
    pd_monotone = all(b[1] <= a[1] + 1e-9 for a, b in zip(pdc, pdc[1:]))
    resid = pd.Series(y - oof, index=h[ok])
    rmap = resid.to_dict()
    nbr = np.array([np.mean([rmap[x] for x in h3.grid_disk(c, 1) if x in rmap and x != c] or [0]) for c in resid.index])
    resid_autocorr = float(np.corrcoef(resid.to_numpy(), nbr)[0, 1])
    checks = dict(
        beatsLinear=bool(spatial["r2"] > lin["spatial"]["r2"]),
        beatsSimpleLinear=bool(spatial["r2"] > lin["simple"]["r2"]),
        pdMonotone=bool(pd_monotone),
        slopeFPer10pct=slope,
        slopeInLitRange=bool(LIT_F_PER10[0] <= -slope <= LIT_F_PER10[1]),
        residNeighborCorr=resid_autocorr,
    )
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    model.booster_.save_model(str(MODEL_DIR / "heat_lgbm.txt"))
    results = dict(
        features=FEATS, monotone=MONO, params={k: v for k, v in p.items() if k != "monotone_constraints"},
        nTrain=int(ok.sum()), tuning=[{k: float(v) if isinstance(v, np.floating) else v for k, v in t.items()} for t in tuning], spatial=spatial, random=random, trainSeconds=train_s,
        baselines=dict(meanRmse=lin["meanRmse"], linearR2Spatial=lin["simple"]["r2"],
                       linearSlopeFPer10pct=lin["simpleCanopySlopePer10"], fullLinearR2Spatial=lin["spatial"]["r2"]),
        pdFPer10pct=slope, pdCurve=pdc, checks=checks,
    )
    (MODEL_DIR / "results.json").write_text(json.dumps(results, indent=1))
    print(f"best: num_leaves={best['num_leaves']} min_child={best['min_child_samples']}")
    print(f"LightGBM spatial R² {spatial['r2']:.3f} RMSE {spatial['rmse']:.3f} MAE {spatial['mae']:.3f} | random R² {random['r2']:.3f}")
    print(f"linear (8 feats) spatial R² {lin['spatial']['r2']:.3f} | simple linear {lin['simple']['r2']:.3f} | mean-only RMSE {lin['meanRmse']:.3f}")
    print("checks:", {k: (round(v, 3) if isinstance(v, float) else v) for k, v in checks.items()})
    return model, results


def main():
    """Train under CodeCarbon (tuning + CV + final fit) and record the energy in results.json."""
    from codecarbon import OfflineEmissionsTracker

    tr = OfflineEmissionsTracker(project_name="heat_model_lgbm", country_iso_code="USA", region="maryland",
                                 log_level="error", save_to_file=False)
    tr.start()
    try:
        _, results = train()
    finally:
        tr.stop()
    d = tr.final_emissions_data
    results.update(trainKWh=d.energy_consumed, trainGCO2=d.emissions * 1000, trainWallSeconds=d.duration)
    (MODEL_DIR / "results.json").write_text(json.dumps(results, indent=1))
    print(f"training energy {d.energy_consumed * 1000:.3f} Wh, {d.emissions * 1000:.3f} g CO2, {d.duration:.0f} s")


if __name__ == "__main__":
    main()
