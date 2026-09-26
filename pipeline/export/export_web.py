"""Export v1: interim tables → web/public/data/*.json (CONTRACTS.md).

v1 uses the linear heat model (pipeline/model/linear.py) as a stand-in until LightGBM (Stage 2):
- heatPred = linear prediction on 2021 land cover; heatResid = heat − prediction on 2018 land cover.
- shap = exact linear contributions (coef × (x − training mean)) on 2021 features, top 3 by |value|.
- gains: planting Δ canopy in hex h lowers h by (β_canopy + β_canopyLag3 / 37) × Δ, scaled by a concave factor
  max(0, 1 − (canopy + Δ) / 0.6) for diminishing returns; per crown unit (25 m²), non-increasing.
- spill: the other 36 hexes within 3 rings each cool by β_canopyLag3 / 37 × Δ; spill = Σ their pop × that, per
  crown unit (°F·people).

Run: python -m pipeline.export.export_web            (rebuilds Stages 0–1 under CodeCarbon, then exports)
     python -m pipeline.export.export_web --no-rebuild
"""
import argparse
import json
import time
from datetime import datetime, timezone

import h3
import numpy as np
import pandas as pd
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from pipeline.build.landcover import CODES  # noqa: F401  (documents the class groups used upstream)
from pipeline.build.species import species_list
from pipeline.config import CROWN_UNIT_M2, CROWN_UNITS, NMAX, NMAX_UNITS, RAW, SURV_MEAN, WEB_DATA
from pipeline.io import read_interim
from pipeline.mock.make_mock import round_coords, simplify
from pipeline.model import linear

AREA = h3.average_hexagon_area(10, unit="m^2")
CANOPY_SAT = 0.6
TREE_BENEFITS = {  # USFS Northeast Community Tree Guide, 20-yr street tree; $ × 1.5 from 2007 (research.md)
    "small": dict(co2LbYr=145, stormGalYr=312, usdYr=round(28.62 * 1.5)),
    "medium": dict(co2LbYr=271, stormGalYr=1014, usdYr=round(76.10 * 1.5)),
    "large": dict(co2LbYr=563, stormGalYr=1624, usdYr=round(150.75 * 1.5)),
}
LABELS = {"canopy": "canopy", "imperv": "imperv", "lowveg": "lowveg", "bare": "bare", "canopyLag3": "canopyLag3",
          "impervLag3": "impervLag3", "waterNear": "waterNear", "distHarborKm": "distHarborKm"}


def r(x, n=3):
    return None if x is None or (isinstance(x, float) and not np.isfinite(x)) else round(float(x), n)


def gains_for(canopy, units, per_unit):
    """Marginal °F per crown unit, concave, non-increasing, ≥ 0."""
    if units == 0 or per_unit <= 0:
        return [0.0] * units
    d = np.arange(1, units + 1) * CROWN_UNIT_M2 / AREA
    cum = per_unit / (CROWN_UNIT_M2 / AREA) * d * np.maximum(0, 1 - (canopy + d) / CANOPY_SAT)
    cum = np.maximum.accumulate(np.clip(cum, 0, None))
    marg = np.diff(np.concatenate([[0], cum]))
    return [round(float(v), 4) for v in np.minimum.accumulate(marg)]


def build_hexes(lin, sites):
    grid = read_interim("grid")
    lc = read_interim("landcover").set_index("h3")
    ft = read_interim("features").set_index("h3")
    ht = read_interim("heat").set_index("h3")
    so = read_interim("social").set_index("h3")
    beta_c, beta_l3 = lin["coef"]["canopy"], lin["coef"]["canopyLag3"]
    own_per_unit = -(beta_c + beta_l3 / 37) * CROWN_UNIT_M2 / AREA  # °F per crown unit before saturation
    nbr_per_unit = -beta_l3 / 37 * CROWN_UNIT_M2 / AREA
    pop = so["pop"].to_dict()
    pred21 = dict(zip(lin["h3"], lin["pred21"]))
    pred18 = dict(zip(lin["h3"], lin["pred18"]))
    contrib = dict(zip(lin["h3"], lin["contrib21"]))
    heat_med = float(np.nanmedian(ht.heat))
    by_hex = sites.groupby("h3")
    out = []
    for c, nb in zip(grid.h3, grid.nb):
        s = by_hex.get_group(c) if c in by_hex.groups else sites.iloc[:0]
        cap = min(len(s), NMAX)
        units = int(min(s.crown.head(cap).sum(), NMAX_UNITS))
        canopy = float(lc.at[c, "canopy21"])
        heat = ht.at[c, "heat"]
        heat = None if not np.isfinite(heat) else float(heat)
        spill = nbr_per_unit * sum(pop.get(x, 0.0) for x in h3.grid_disk(c, 3) if x != c) if cap else 0.0
        top = sorted(zip(linear.FEATS, contrib[c]), key=lambda t: -abs(t[1]))[:3]
        so_row = so.loc[c]
        out.append(dict(
            h3=c, nb=nb, canopy=r(canopy), canopy13=r(lc.at[c, "canopy13"]), imperv=r(lc.at[c, "imperv21"]),
            bldg=r(lc.at[c, "bldg21"]), road=r(lc.at[c, "road21"]), lowveg=r(lc.at[c, "lowveg21"]),
            waterNear=r(ft.at[c, "waterNear_21"]),
            heat=r(heat), heatAnom=r(float(ht.at[c, "heatFill"]) - heat_med), heatPred=r(pred21[c]),
            heatResid=None if heat is None else r(heat - pred18[c]), spill=r(max(0.0, spill)),
            income=None if pd.isna(so_row.income) else int(round(so_row.income)), poverty=r(so_row.poverty),
            poc=r(so_row.poc), asthma=r(so_row.asthma, 1), svi=r(so_row.svi), holc=so_row.holc or None,
            pop=r(so_row["pop"], 1), vulnEq=r(so_row.vulnEq), vulnHealth=r(so_row.vulnHealth), flood=bool(so_row.flood),
            cap=cap, gains=gains_for(canopy, units, own_per_unit), shap=[[LABELS[f], r(v)] for f, v in top],
        ))
    return out, heat_med


def build_sites(sites):
    out = []
    for s in sites.itertuples(index=False):
        out.append(dict(id=s.id, lng=s.lng, lat=s.lat, h3=s.h3, type=s.type, cost=int(s.cost), util=bool(s.util),
                        width=None if pd.isna(s.width) else int(s.width), space=s.space, nb=s.nb, species=s.species,
                        size=s.size, crown=int(s.crown), surv=r(s.surv)))
    return out


def build_neighborhoods():
    nbp = read_interim("neighborhoods").set_index("name")
    raw = json.load(open(RAW / "boundaries" / "neighborhoods.geojson"))
    feats = []
    for f in raw["features"]:
        name = f["properties"]["Name"]
        p = nbp.loc[name]
        lp = shape(f["geometry"]).representative_point()
        props = dict(name=name, canopy=r(p.canopy), heat=r(p.heat),
                     income=None if pd.isna(p.income) else int(round(p.income)), pop=int(round(p["pop"])),
                     asthma=r(p.asthma, 1), poverty=r(p.poverty), sites=int(p.sites),
                     rankHeat=int(p.rankHeat), rankCanopy=int(p.rankCanopy), bivHeat=int(p.bivHeat),
                     bivIncome=int(p.bivIncome), canopyGap=r(p.canopyGap), labelLng=round(lp.x, 5), labelLat=round(lp.y, 5))
        if pd.notna(p.tes):
            props["tes"] = int(round(p.tes))
        feats.append({"type": "Feature", "properties": props, "geometry": simplify(f["geometry"])})
    return {"type": "FeatureCollection", "features": feats}, raw


def static_layers(nb_raw, grid_cells):
    mi = json.load(open(RAW / "history" / "mappinginequality_us.json"))
    holc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"grade": f["properties"]["grade"]}, "geometry": simplify(f["geometry"])}
        for f in mi["features"] if f["properties"]["city"] == "Baltimore"]}
    city_geom = unary_union([shape(f["geometry"]).buffer(0) for f in nb_raw["features"]]).buffer(0.0001).buffer(-0.0001).simplify(0.0001)
    city = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": "Baltimore"}, "geometry": simplify(mapping(city_geom))}]}
    trees = []
    for f in json.load(open(RAW / "trees" / "trees_all_other.geojson"))["features"]:
        pr = f["properties"]
        if pr.get("CONDITION") in ("Stump", "Dead") or not f["geometry"]:
            continue
        lng, lat = f["geometry"]["coordinates"][:2]
        trees.append([round(lng, 5), round(lat, 5), round(float(pr.get("DBH") or 0), 1)])
    cc = json.load(open(RAW / "context" / "cooling_centers.geojson"))
    cooling = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": round_coords(f["geometry"]["coordinates"][:2])},
         "properties": {"name": f["properties"]["NAME"], "address": f["properties"]["ADDRESS"],
                        "nb": f["properties"]["NGHBRHD"], "hours": f["properties"].get("Open_Hrs"),
                        "url": f["properties"].get("URL")}}
        for f in cc["features"] if f["geometry"]]}
    return holc, city, trees, cooling


def build_stats(lin, hexes, sites, nbfc, heat_med):
    nb = pd.DataFrame([f["properties"] for f in nbfc["features"]])
    hx = pd.DataFrame(hexes)
    lc = read_interim("landcover").set_index("h3")
    hx["land"] = [float(lc.at[c, "valid_m2"]) * (1 - float(lc.at[c, "water21"])) for c in hx.h3]
    grade_num = {"A": 1, "B": 2, "C": 3, "D": 4}
    extra = hx.assign(g=hx.holc.map(grade_num)).groupby("nb").apply(lambda d: pd.Series({
        "poc": np.average(d.poc.fillna(d.poc.mean() if d.poc.notna().any() else 0), weights=d["pop"] + 1e-9),
        "imperv": np.average(d.imperv, weights=d.land + 1e-9),
        "holc": d.g.mean()}), include_groups=False)
    nb = nb.join(extra, on="name")
    vars_ = ["canopy", "heat", "income", "poverty", "poc", "asthma", "imperv", "holc"]
    corr = nb[vars_].astype(float).corr().round(3).fillna(0).to_numpy().tolist()
    m = nb[["canopy", "heat"]].dropna()
    slope, icpt = np.polyfit(m.canopy, m.heat, 1)
    r2 = float(np.corrcoef(m.canopy, m.heat)[0, 1] ** 2)
    by_holc = []
    for g in "ABCD":
        d = hx[hx.holc == g]
        by_holc.append(dict(grade=g, canopy=r(np.average(d.canopy, weights=d.land + 1e-9)),
                            heat=r(d.heat.dropna().mean(), 1), n=int(len(d))))
    heats = hx.heat.dropna()
    land = hx.land.to_numpy()
    water = np.array([float(lc.at[c, "water21"]) for c in hx.h3])
    city_canopy = float(np.average(hx.canopy / np.maximum(1 - water, 1e-9), weights=land))
    coef = lin["coef"]
    total_slope = (coef["canopy"] + coef["canopyLag3"]) * 0.1
    grid_c = np.linspace(0, 0.8, 17)
    base = np.mean(lin["pred21"])
    mean_can = lin["mu"]["canopy"]
    pd_curve = [[round(float(c), 2), r(base + (coef["canopy"] + coef["canopyLag3"]) * (c - mean_can), 2)] for c in grid_c]
    importance = sorted(((f, float(np.abs(lin["contrib21"][:, i]).mean())) for i, f in enumerate(linear.FEATS)),
                        key=lambda t: -t[1])
    surv = pd.DataFrame(sites)
    dead = {}
    for f in json.load(open(RAW / "trees" / "trees_all_other.geojson"))["features"]:
        pr = f["properties"]
        d = dead.setdefault(pr.get("SPACE_TYPE"), [0, 0])
        d[0] += pr.get("CONDITION") in ("Dead", "Stump")
        d[1] += 1
    return dict(
        city=dict(canopy=r(city_canopy), canopyGoal=0.40, heatSpreadF=r(heats.max() - heats.min()),
                  emptySites=len(sites), nbBelow20=int((nb.canopy < 0.20).sum())),
        corr=dict(vars=vars_, matrix=corr),
        regression=dict(slopeFPer10pct=r(slope * 0.1), r2=r(r2), n=int(len(m))),
        byHolc=by_holc,
        model=dict(
            target="Afternoon air temperature (°F), NOAA Heat Watch", date="2018-08-29",
            features=linear.FEATS, nTrain=lin["nTrain"],
            r2Random=r(lin["random"]["r2"]), r2Spatial=r(lin["spatial"]["r2"]),
            rmseSpatial=r(lin["spatial"]["rmse"]), maeSpatial=r(lin["spatial"]["mae"]),
            baselines=dict(meanRmse=r(lin["meanRmse"]), linearR2Spatial=r(lin["simple"]["r2"]),
                           linearSlopeFPer10pct=r(lin["simpleCanopySlopePer10"])),
            pdFPer10pct=r(total_slope), pdCurve=pd_curve, importance=[[f, r(v)] for f, v in importance],
            trainSeconds=r(lin["trainSeconds"], 4), trainWh=r(lin["trainKWh"] * 1000, 6),
            limitations=[
                "Export v1: a linear model stands in until the LightGBM model (Stage 2) is trained",
                "Trained on 2018 land cover, applied to 2021 land cover",
                "Single hot afternoon (2018-08-29)", "Air temperature from a car-mounted traverse",
                "No night-time model", "No humidity",
                "Tree survival and crown sizes are assumptions (see assumptions)",
            ],
        ),
        literature=dict(zaerpour_C_per10=0.8, meta_C_per10=0.3),
        treeBenefits=TREE_BENEFITS,
        assumptions=dict(
            crownM2={k: v * CROWN_UNIT_M2 for k, v in CROWN_UNITS.items()}, survMean=SURV_MEAN,
            survBySpace=[[k, r(v)] for k, v in surv.groupby("space").surv.mean().sort_values(ascending=False).items()],
            deadShareBySpace=[[k, r(a / n)] for k, (a, n) in sorted(dead.items(), key=lambda kv: -kv[1][1]) if k and n >= 200],
        ),
    )


def tracked(fn, name):
    """Run fn under CodeCarbon; returns (result, kWh, gCO2)."""
    from codecarbon import OfflineEmissionsTracker

    tr = OfflineEmissionsTracker(project_name=name, country_iso_code="USA", region="maryland", log_level="error",
                                 save_to_file=False)
    tr.start()
    try:
        res = fn()
    finally:
        tr.stop()
    d = tr.final_emissions_data
    return res, d.energy_consumed, d.emissions * 1000


def export(pipeline_kwh=None, pipeline_g=None, measured=None):
    t0 = time.time()
    lin, train_kwh, train_g = tracked(linear.fit, "heat_model_linear_v1")
    sites = read_interim("sites")
    hexes, heat_med = build_hexes(lin, sites)
    site_rows = build_sites(sites)
    nbfc, nb_raw = build_neighborhoods()
    holc, city, trees, cooling = static_layers(nb_raw, {h["h3"] for h in hexes})
    lin["trainKWh"] = train_kwh
    stats = build_stats(lin, hexes, site_rows, nbfc, heat_med)
    footprint = dict(
        pipelineKWh=r(pipeline_kwh, 6), pipelineGCO2=r(pipeline_g, 3), trainKWh=r(train_kwh, 8), trainGCO2=r(train_g, 5),
        region="Maryland, USA", measuredAt=measured or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        devAiNote="Not estimated yet.", cloudRefs=[],
    )
    out = {
        "hexes.json": hexes, "sites.json": site_rows, "neighborhoods.geojson": nbfc, "holc.geojson": holc,
        "city.geojson": city, "trees.json": trees, "cooling_centers.geojson": cooling, "stats.json": stats,
        "species.json": species_list(), "footprint.json": footprint,
    }
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    for name, obj in out.items():
        path = WEB_DATA / name
        path.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))
        print(f"{name:24s} {path.stat().st_size / 1e6:6.2f} MB")
    print(f"export: {len(hexes):,} hexes, {len(site_rows):,} sites in {time.time() - t0:.1f}s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-rebuild", action="store_true", help="export from existing interim files, no CodeCarbon")
    a = ap.parse_args()
    if a.no_rebuild:
        export()
        return
    from pipeline import run

    _, kwh, g = tracked(lambda: [stage() for stage in run.STAGES.values()], "pipeline_stages_0_1")
    export(pipeline_kwh=kwh, pipeline_g=g)


if __name__ == "__main__":
    main()
