"""Linear heat model: the export-v1 stand-in until LightGBM (Stage 2), and later its baseline.

Trained on 2018 features (heat measured 2018-08-29), applied to 2021 features. Spatial CV groups hexes by their
res-7 parent (~5 km² blocks), since neighboring hexes are nearly identical and random CV leaks. For a linear
model, SHAP values are exact: contribution_f = coef_f × (x_f − mean_f).
"""
import time

import h3
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import GroupKFold, KFold

from pipeline.io import read_interim

FEATS = ["canopy", "imperv", "lowveg", "bare", "canopyLag3", "impervLag3", "waterNear", "distHarborKm"]
SIMPLE = ["canopy", "imperv", "waterNear"]  # the plan's interpretable baseline


def columns(year, feats=FEATS):
    lagged = {"canopyLag1", "canopyLag3", "impervLag1", "impervLag3", "waterNear"}
    return [f if f == "distHarborKm" else f"{f}_{year}" if f in lagged else f"{f}{year}" for f in feats]


def cv_scores(X, y, groups, cv):
    pred = np.empty(len(y))
    for tr, te in cv.split(X, y, groups):
        pred[te] = LinearRegression().fit(X[tr], y[tr]).predict(X[te])
    res = y - pred
    return dict(r2=1 - (res ** 2).sum() / ((y - y.mean()) ** 2).sum(), rmse=float(np.sqrt((res ** 2).mean())),
                mae=float(np.abs(res).mean()))


def fit():
    f = read_interim("features")
    heat = read_interim("heat").set_index("h3").loc[f.h3, "heat"].to_numpy()
    train = np.isfinite(heat)
    X18, X21 = f[columns("18")].to_numpy(), f[columns("21")].to_numpy()
    y, groups = heat[train], np.array([h3.cell_to_parent(c, 7) for c in f.h3[train]])
    t0 = time.time()
    model = LinearRegression().fit(X18[train], y)
    train_s = time.time() - t0
    spatial = cv_scores(X18[train], y, groups, GroupKFold(5))
    random = cv_scores(X18[train], y, None, KFold(5, shuffle=True, random_state=0))
    simple = cv_scores(f.loc[train, columns("18", SIMPLE)].to_numpy(), y, groups, GroupKFold(5))
    simple_fit = LinearRegression().fit(f.loc[train, columns("18", SIMPLE)].to_numpy(), y)
    mean_rmse = float(np.sqrt(((y - y.mean()) ** 2).mean()))
    coef = dict(zip(FEATS, model.coef_))
    mu = X18[train].mean(0)
    contrib21 = (X21 - mu) * model.coef_  # exact SHAP, °F vs. the training mean
    return dict(
        model=model, coef=coef, mu=dict(zip(FEATS, mu)), h3=f.h3.to_numpy(), X21=X21,
        pred18=model.predict(X18), pred21=model.predict(X21), heat=heat, contrib21=contrib21,
        nTrain=int(train.sum()), trainSeconds=train_s, spatial=spatial, random=random, simple=simple,
        simpleCanopySlopePer10=float(simple_fit.coef_[0] * 0.1), meanRmse=mean_rmse,
    )


if __name__ == "__main__":
    r = fit()
    print({k: round(v, 3) for k, v in r["coef"].items()})
    print("spatial", {k: round(v, 3) for k, v in r["spatial"].items()}, "random", {k: round(v, 3) for k, v in r["random"].items()})
    print("simple baseline spatial", {k: round(v, 3) for k, v in r["simple"].items()}, "mean-only rmse", round(r["meanRmse"], 3))
    print("canopy °F per +10%: own", round(r["coef"]["canopy"] * 0.1, 3), "own+lag3", round((r["coef"]["canopy"] + r["coef"]["canopyLag3"]) * 0.1, 3),
          "simple", round(r["simpleCanopySlopePer10"], 3))
