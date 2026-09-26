"""Write mock web/public/data/*.json that matches CONTRACTS.md, so the frontend can start
before the real pipeline lands. Values are synthetic but spatially plausible.

Run: python -m pipeline.mock.make_mock
Needs h3, numpy and shapely, plus the raw neighborhoods/HOLC/trees/cooling-center files
(polygons, trees and cooling centers are real; per-hex values are synthetic).
"""
import json
import math

import h3
import numpy as np
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from pipeline.config import COST, CROWN_UNIT_M2, CROWN_UNITS, EXPO_W, H3_RES, NMAX, NMAX_UNITS, RAW, SURV_MEAN, WEB_DATA
from pipeline.site_rules import crown_units, rescale_surv, size_class, surv_base

rng = np.random.default_rng(42)
DOWNTOWN = (39.2904, -76.6122)
HARBOR = (39.2856, -76.6081)
N_SITES = 3000


def r(x, n=3):
    return None if x is None else round(float(x), n)


def round_coords(coords, n=5):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], n), round(coords[1], n)]
    return [round_coords(c, n) for c in coords]


def simplify(geom, tol=0.00008):
    """Topology-preserving simplify + 5-decimal rounding; always returns valid (Multi)Polygon GeoJSON."""
    g = shape(geom).simplify(tol, preserve_topology=True)
    if not g.is_valid:
        g = g.buffer(0)
    out = json.loads(json.dumps(mapping(g)))
    out["coordinates"] = round_coords(out["coordinates"])
    return out


def cells_of(geom):
    return set(h3.geo_to_cells(geom, H3_RES))


def km(a, b):
    dlat = (a[0] - b[0]) * 111.0
    dlng = (a[1] - b[1]) * 111.0 * math.cos(math.radians(a[0]))
    return math.hypot(dlat, dlng)


def smooth_noise(lat, lng, seed):
    """Cheap smooth 2D field in [-1, 1] from a few sinusoids."""
    s = np.random.default_rng(seed)
    v = 0.0
    for _ in range(4):
        fx, fy, ph = s.uniform(40, 160), s.uniform(40, 160), s.uniform(0, 2 * math.pi)
        v += math.sin(lat * fx + lng * fy + ph)
    return v / 4


def minmax(a):
    a = np.asarray(a, dtype=float)
    return (a - np.nanmin(a)) / (np.nanmax(a) - np.nanmin(a))


def main():
    WEB_DATA.mkdir(parents=True, exist_ok=True)

    # --- neighborhoods (real polygons) and cell → neighborhood lookup ---
    nb_raw = json.load(open(RAW / "boundaries" / "neighborhoods.geojson"))
    cell_nb = {}
    for f in nb_raw["features"]:
        for c in cells_of(f["geometry"]):
            cell_nb.setdefault(c, f["properties"]["Name"])

    # --- HOLC (real polygons) and cell → grade lookup ---
    mi = json.load(open(RAW / "history" / "mappinginequality_us.json"))
    holc_feats = [f for f in mi["features"] if f["properties"]["city"] == "Baltimore"]
    cell_holc = {}
    for f in holc_feats:
        g = f["properties"]["grade"]
        if g:
            for c in cells_of(f["geometry"]):
                cell_holc[c] = g

    # --- ~2,000 contiguous hexes around downtown, clipped to the city ---
    center = h3.latlng_to_cell(*DOWNTOWN, H3_RES)
    cells = [c for c in h3.grid_disk(center, 28) if c in cell_nb][:2000]

    rows = []
    for c in cells:
        lat, lng = h3.cell_to_latlng(c)
        d = km((lat, lng), DOWNTOWN)
        n1, n2, n3 = smooth_noise(lat, lng, 1), smooth_noise(lat, lng, 2), smooth_noise(lat, lng, 3)
        canopy = float(np.clip(0.08 + 0.05 * d + 0.12 * n1 + rng.normal(0, 0.04), 0.01, 0.85))
        imperv = float(np.clip(0.85 - 0.9 * canopy + 0.08 * n2 + rng.normal(0, 0.04), 0.05, 0.98))
        bldg = imperv * float(rng.uniform(0.35, 0.55))
        road = imperv * float(rng.uniform(0.2, 0.35))
        heat_pred = 88.5 + 13 * imperv - 6 * canopy - 0.6 * km((lat, lng), HARBOR) * (d < 2) + 0.8 * n3
        heat = heat_pred + rng.normal(0, 0.7) if rng.random() > 0.04 else None
        income = float(np.clip(52000 + 25000 * n1 + 8000 * d + rng.normal(0, 8000), 12000, 220000))
        poverty = float(np.clip(0.35 - income / 400000 + rng.normal(0, 0.04), 0.01, 0.7))
        poc = float(np.clip(0.65 - 0.3 * n1 + rng.normal(0, 0.1), 0.02, 0.99))
        asthma = float(np.clip(9 + 5 * poverty + rng.normal(0, 0.8), 6, 16))
        svi = float(np.clip(0.5 + 0.8 * (poverty - 0.2) + rng.normal(0, 0.1), 0, 1))
        rows.append(dict(
            h3=c, nb=cell_nb[c], lat=lat, lng=lng, canopy=canopy, imperv=imperv, bldg=bldg, road=road,
            heat=heat, heatPred=heat_pred, income=income, poverty=poverty, poc=poc,
            asthma=asthma, svi=svi, holc=cell_holc.get(c), pop=float(max(0, rng.normal(90, 45))),
            flood=bool(km((lat, lng), HARBOR) < 1.2 and rng.random() < 0.2),
        ))

    heat_med = float(np.median([x["heat"] for x in rows if x["heat"] is not None]))
    n_pov, n_inc, n_poc = minmax([x["poverty"] for x in rows]), minmax([x["income"] for x in rows]), minmax([x["poc"] for x in rows])
    n_ast = minmax([x["asthma"] for x in rows])
    for i, x in enumerate(rows):
        x["vulnEq"] = float((n_pov[i] + (1 - n_inc[i]) + n_poc[i]) / 3)
        x["vulnHealth"] = float((n_ast[i] + x["svi"]) / 2)

    # --- outdoor exposure: real cooling centers; synthetic bus stops and schools ---
    cc_raw = json.load(open(RAW / "context" / "cooling_centers.geojson"))
    cc_cells = {h3.latlng_to_cell(f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0], H3_RES)
                for f in cc_raw["features"] if f["geometry"]}
    cool_near = {n for c in cc_cells for n in h3.grid_disk(c, 4)}
    school_cells = [cells[int(i)] for i in rng.choice(len(cells), 25, replace=False)]
    school_near = {n for c in school_cells for n in h3.grid_disk(c, 2)}
    bus = [max(0.0, rng.normal(400 * math.exp(-km((x["lat"], x["lng"]), DOWNTOWN) / 1.5), 60))
           if rng.random() < 0.3 else 0.0 for x in rows]  # weekday boardings in grid_disk(h, 1)
    n_bus = minmax(np.log1p(bus))
    p90 = float(np.quantile([x["pop"] for x in rows], 0.9))
    for i, x in enumerate(rows):
        x["expo"] = float((n_bus[i] + (x["h3"] in school_near) + (x["h3"] in cool_near)) / 3)
        x["people"] = x["pop"] + EXPO_W * x["expo"] * p90

    # --- sites: random points inside the hexes, then sort by crown × surv / cost per hex ---
    cell_set = set(cells)
    sites_by_hex = {c: [] for c in cells}
    oid = 100000
    spaces = ["Tree Lawn", "Well/Pit", "Potential Well/Pit", "Median/Island", "Open/Unrestricted"]
    while sum(len(v) for v in sites_by_hex.values()) < N_SITES:
        c = cells[int(rng.integers(len(cells)))]
        lat, lng = h3.cell_to_latlng(c)
        lat, lng = round(lat + rng.normal(0, 0.00025), 5), round(lng + rng.normal(0, 0.00032), 5)
        c2 = h3.latlng_to_cell(lat, lng, H3_RES)
        if c2 not in cell_set:
            continue
        typ = "potential" if rng.random() < 0.32 else "pit"
        space = "Potential Well/Pit" if typ == "potential" else str(rng.choice(spaces[:2] + spaces[3:], p=[0.8, 0.14, 0.05, 0.01]))
        width = None if rng.random() < 0.05 else (0 if typ == "potential" else int(rng.choice([3, 4, 5, 6, 8, 10, 20])))
        oid += 1
        sites_by_hex[c2].append(dict(
            id=str(oid), lng=lng, lat=lat, h3=c2, type=typ, cost=COST[typ],
            util=bool(rng.random() < 0.1), width=width, space=space, nb=cell_nb[c2], species="",
        ))

    species = mock_species()
    by_size = {s: [x["name"] for x in species if x["size"] == s] for s in ("small", "medium", "large")}
    rot = {s: 0 for s in by_size}
    all_sites = [s for c in cells for s in sites_by_hex[c]]
    surv = rescale_surv([surv_base(s["type"], s["space"], s["width"]) for s in all_sites])
    for s, sv in zip(all_sites, surv):
        size = size_class(s["util"], s["type"], s["width"])
        s["species"] = by_size[size][rot[size] % len(by_size[size])]
        rot[size] += 1
        s.update(size=size, crown=crown_units(size), surv=r(sv))
    sites = []
    for c in cells:
        lst = sorted(sites_by_hex[c], key=lambda s: (-s["crown"] * s["surv"] / s["cost"], s["cost"]))
        sites_by_hex[c] = lst
        sites += lst

    # --- per-hex fields that depend on sites: cap, gains, shap, anomalies ---
    feats = ["imperv", "canopy", "canopyLag3", "waterNear", "road", "bldg", "distHarborKm"]
    hexes = []
    for x in rows:
        cap = min(len(sites_by_hex[x["h3"]]), NMAX)
        units = min(sum(s["crown"] for s in sites_by_hex[x["h3"]][:cap]), NMAX_UNITS)
        # °F per crown unit (25 m²), decaying ~7% per 50 m² of added canopy
        g0 = max(0.0, 0.01 + 0.03 * x["imperv"] - 0.02 * x["canopy"] + rng.normal(0, 0.0025))
        gains = [r(g0 * (0.93 ** (k / 2)), 4) for k in range(units)]
        heat_for_anom = x["heat"] if x["heat"] is not None else x["heatPred"]
        shap_vals = sorted(((f, float(rng.normal(0, 1.2))) for f in rng.choice(feats, 3, replace=False)),
                           key=lambda t: -abs(t[1]))
        hexes.append(dict(
            h3=x["h3"], nb=x["nb"], canopy=r(x["canopy"]), canopy13=r(min(1, x["canopy"] + rng.normal(0.01, 0.02))),
            imperv=r(x["imperv"]), bldg=r(x["bldg"]), road=r(x["road"]),
            heat=r(x["heat"]), heatAnom=r(heat_for_anom - heat_med), heatPred=r(x["heatPred"]),
            heatResid=None if x["heat"] is None else r(x["heat"] - x["heatPred"]),
            spill=r(g0 * 20), income=round(x["income"]), poverty=r(x["poverty"]), poc=r(x["poc"]),
            asthma=r(x["asthma"], 1), svi=r(x["svi"]), holc=x["holc"], pop=r(x["pop"], 1),
            expo=r(x["expo"]), people=r(x["people"], 1),
            vulnEq=r(x["vulnEq"]), vulnHealth=r(x["vulnHealth"]), flood=x["flood"],
            cap=cap, gains=gains, shap=[[f, r(v)] for f, v in shap_vals],
        ))

    # --- neighborhood summaries (only neighborhoods touched by the mock hexes get real-ish values) ---
    agg = {}
    for h in hexes:
        a = agg.setdefault(h["nb"], dict(canopy=[], heat=[], income=[], pop=0.0, asthma=[], poverty=[], sites=0))
        a["canopy"].append(h["canopy"]); a["heat"].append(h["heatPred"]); a["income"].append(h["income"])
        a["asthma"].append(h["asthma"]); a["poverty"].append(h["poverty"]); a["pop"] += h["pop"]
        a["sites"] += len(sites_by_hex[h["h3"]])
    nb_props = {}
    for f in nb_raw["features"]:
        name = f["properties"]["Name"]
        a = agg.get(name)
        if a:
            p = dict(canopy=r(np.mean(a["canopy"])), heat=r(np.mean(a["heat"])), income=round(float(np.mean(a["income"]))),
                     pop=round(a["pop"]), asthma=r(np.mean(a["asthma"]), 1), poverty=r(np.mean(a["poverty"])), sites=a["sites"])
        else:
            p = dict(canopy=r(rng.uniform(0.2, 0.5)), heat=r(rng.uniform(88, 94)), income=int(rng.uniform(40000, 120000)),
                     pop=int(f["properties"].get("Population") or 0), asthma=r(rng.uniform(7, 11), 1),
                     poverty=r(rng.uniform(0.05, 0.3)), sites=int(rng.integers(20, 400)))
        p["tes"] = round(float(rng.uniform(50, 100)))
        nb_props[name] = p
    names = list(nb_props)
    for key, rank in (("heat", "rankHeat"), ("canopy", "rankCanopy")):
        order = sorted(names, key=lambda n: -nb_props[n][key])
        for i, n in enumerate(order):
            nb_props[n][rank] = i + 1

    def tercile(vals, v):
        q1, q2 = np.quantile(vals, [1 / 3, 2 / 3])
        return 0 if v <= q1 else (1 if v <= q2 else 2)

    can_vals = [nb_props[n]["canopy"] for n in names]
    heat_vals = [nb_props[n]["heat"] for n in names]
    inc_vals = [nb_props[n]["income"] for n in names]
    nb_feats = []
    for f in nb_raw["features"]:
        name = f["properties"]["Name"]
        p = nb_props[name]
        can_t = 2 - tercile(can_vals, p["canopy"])  # inverted: low canopy → 2
        p["bivHeat"] = can_t * 3 + tercile(heat_vals, p["heat"])
        p["bivIncome"] = can_t * 3 + (2 - tercile(inc_vals, p["income"]))
        p["canopyGap"] = r(max(0.0, 0.40 - p["canopy"]))
        lp = shape(f["geometry"]).representative_point()
        p["labelLng"], p["labelLat"] = round(lp.x, 5), round(lp.y, 5)
        nb_feats.append({"type": "Feature", "properties": {"name": name, **p}, "geometry": simplify(f["geometry"])})

    holc_out = [{"type": "Feature", "properties": {"grade": f["properties"]["grade"]}, "geometry": simplify(f["geometry"])}
                for f in holc_feats]

    # small buffer out/in closes slivers between neighborhood polygons
    city_geom = unary_union([shape(f["geometry"]).buffer(0) for f in nb_raw["features"]]).buffer(0.0001).buffer(-0.0001).simplify(0.0001)
    city = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"name": "Baltimore"}, "geometry": simplify(mapping(city_geom))}]}

    # live trees (real), limited to the mock hex area so the mock stays small
    trees_raw = json.load(open(RAW / "trees" / "trees_all_other.geojson"))
    trees = []
    for f in trees_raw["features"]:
        pr = f["properties"]
        if pr.get("CONDITION") in ("Stump", "Dead") or not f["geometry"]:
            continue
        lng, lat = f["geometry"]["coordinates"][:2]
        if h3.latlng_to_cell(lat, lng, H3_RES) in cell_set:
            trees.append([round(lng, 5), round(lat, 5), round(float(pr.get("DBH") or 0), 1)])

    cooling = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": round_coords(f["geometry"]["coordinates"][:2])},
         "properties": {"name": f["properties"]["NAME"], "address": f["properties"]["ADDRESS"],
                        "nb": f["properties"]["NGHBRHD"], "hours": f["properties"].get("Open_Hrs"),
                        "url": f["properties"].get("URL")}}
        for f in cc_raw["features"] if f["geometry"]]}

    stats = mock_stats(hexes, sites, nb_props, heat_med)
    stats["assumptions"] = mock_assumptions(sites, trees_raw)
    footprint = dict(
        pipelineKWh=0.012, pipelineGCO2=3.4, trainKWh=0.0004, trainGCO2=0.11, region="Maryland, USA",
        measuredAt="2026-09-26T00:00:00Z", devAiNote="MOCK: replace with real CodeCarbon numbers.",
        cloudRefs=[dict(name="Typical cloud chatbot query", wh=0.3, ml=None, source="MOCK")],
    )

    out = {
        "hexes.json": hexes,
        "sites.json": sites,
        "neighborhoods.geojson": {"type": "FeatureCollection", "features": nb_feats},
        "holc.geojson": {"type": "FeatureCollection", "features": holc_out},
        "city.geojson": city,
        "trees.json": trees,
        "cooling_centers.geojson": cooling,
        "stats.json": stats,
        "species.json": species,
        "footprint.json": footprint,
    }
    for name, obj in out.items():
        path = WEB_DATA / name
        path.write_text(json.dumps(obj, separators=(",", ":")))
        print(f"{name:24s} {path.stat().st_size / 1e6:6.2f} MB")
    print(f"hexes={len(hexes)} sites={len(sites)} neighborhoods={len(nb_feats)} holc={len(holc_out)} "
          f"trees={len(trees)} cooling={len(cooling['features'])}")


def mock_species():
    s = lambda name, latin, size, wires, w, native, notes="": dict(
        name=name, latin=latin, size=size, underWires=wires, minWidthFt=w, native=native, notes=notes)
    return [
        s("Eastern redbud", "Cercis canadensis", "small", True, 3, True, "Spring flowers"),
        s("Serviceberry", "Amelanchier canadensis", "small", True, 3, True, "Berries feed birds"),
        s("American hornbeam", "Carpinus caroliniana", "small", True, 3, True),
        s("Hedge maple", "Acer campestre", "small", True, 3, False, "Tolerates urban stress"),
        s("Blackgum", "Nyssa sylvatica", "medium", False, 4, True, "Red fall color"),
        s("American hophornbeam", "Ostrya virginiana", "medium", False, 4, True),
        s("Yellowwood", "Cladrastis kentukea", "medium", False, 4, False),
        s("Willow oak", "Quercus phellos", "large", False, 6, True, "Classic Baltimore street tree"),
        s("Swamp white oak", "Quercus bicolor", "large", False, 6, True),
        s("Red maple", "Acer rubrum", "large", False, 6, True),
        s("London planetree", "Platanus × acerifolia", "large", False, 6, False),
        s("Kentucky coffeetree", "Gymnocladus dioicus", "large", False, 6, False),
    ]


def mock_assumptions(sites, trees_raw):
    """Optimizer assumptions for the model card. deadShareBySpace is real (inventory), survBySpace is from the mock sites."""
    by_space = {}
    for s in sites:
        by_space.setdefault(s["space"], []).append(s["surv"])
    dead = {}
    for f in trees_raw["features"]:
        pr = f["properties"]
        d = dead.setdefault(pr.get("SPACE_TYPE"), [0, 0])
        d[0] += pr.get("CONDITION") in ("Dead", "Stump")
        d[1] += 1
    return dict(
        crownM2={k: v * CROWN_UNIT_M2 for k, v in CROWN_UNITS.items()},
        survMean=SURV_MEAN,
        survBySpace=[[k, r(np.mean(v))] for k, v in sorted(by_space.items(), key=lambda kv: -len(kv[1])) if k],
        expoW=EXPO_W,
        deadShareBySpace=[[k, r(a / n)] for k, (a, n) in sorted(dead.items(), key=lambda kv: -kv[1][1]) if k and n >= 200],
    )


def mock_stats(hexes, sites, nb_props, heat_med):
    heats = [h["heatPred"] for h in hexes]
    canopies = [p["canopy"] for p in nb_props.values()]
    feats = ["canopy", "imperv", "bldg", "road", "lowveg", "canopyLag1", "canopyLag3",
             "impervLag1", "impervLag3", "waterNear", "distHarborKm"]
    vars_ = ["canopy", "heat", "income", "poverty", "poc", "asthma", "imperv", "holc"]
    m = np.eye(len(vars_))
    for i in range(len(vars_)):
        for j in range(i + 1, len(vars_)):
            m[i, j] = m[j, i] = round(float(rng.uniform(-0.8, 0.8)), 3)
    return dict(
        mock=True,
        city=dict(canopy=r(np.mean(canopies)), canopyGoal=0.40, heatSpreadF=r(max(heats) - min(heats)),
                  emptySites=len(sites), nbBelow20=sum(c < 0.20 for c in canopies)),
        corr=dict(vars=vars_, matrix=m.round(3).tolist()),
        regression=dict(slopeFPer10pct=-1.1, r2=0.52, n=len(nb_props)),
        byHolc=[dict(grade=g, canopy=c, heat=t, n=n) for g, c, t, n in
                (("A", 0.42, 91.2, 6), ("B", 0.33, 92.4, 14), ("C", 0.24, 93.8, 22), ("D", 0.17, 95.1, 18))],
        model=dict(
            target="Afternoon air temperature (°F), NOAA Heat Watch", date="2018-08-29", features=feats,
            nTrain=len(hexes), r2Random=0.86, r2Spatial=0.64, rmseSpatial=1.4, maeSpatial=1.1,
            baselines=dict(meanRmse=2.9, linearR2Spatial=0.48, linearSlopeFPer10pct=-0.9),
            pdFPer10pct=-1.0, pdCurve=[[round(c, 2), r(heat_med + 3 - 10 * c)] for c in np.linspace(0, 0.8, 17)],
            importance=[[f, r(v)] for f, v in zip(feats, sorted(rng.uniform(0.05, 2.0, len(feats)), reverse=True))],
            trainSeconds=4.2, trainWh=0.4,
            limitations=["MOCK DATA", "Single hot day", "Air temperature from a car traverse", "No night-time model"],
        ),
        literature=dict(zaerpour_C_per10=0.8, meta_C_per10=0.3),
        treeBenefits={k: dict(co2LbYr=co2, stormGalYr=gal, usdYr=usd) for k, co2, gal, usd in
                      (("small", 20, 300, 25), ("medium", 60, 900, 55), ("large", 120, 1600, 95))},
    )


if __name__ == "__main__":
    main()
