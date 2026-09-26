"""Tract-level social, health and history data per hex → interim/social.parquet.

- Hex center → 2024 census tract (nearest tract for the few centers outside all tracts).
- ACS 2024 5-year: income (median household), poverty (share below poverty line), poc (1 − non-Hispanic white).
- CDC PLACES 2023 asthma (% adults), CDC SVI 2022 overall percentile (RPL_THEMES; −999 → missing).
- pop: each neighborhood's 2020 census population (neighborhoods.geojson `Population`) spread over its grid hexes in
  proportion to building footprint plus a small land-area floor (w = bldg21 + 0.05 × land share). Neighborhoods, not
  tracts, are the control totals because they separate industrial areas from housing; spreading tract totals by
  buildings put thousands of residents into port warehouses. ACS supplies rates only.
- Tracts with fewer than MIN_TRACT_POP residents (the industrial port tract has 34) get their rates set to missing,
  because estimates from a few dozen people are noise; their vulnerability scores fall back to the city median.
- holc: HOLC grade whose polygon contains the hex center. flood: hex intersects a FEMA 1% zone (A, AE, AO, VE).
- vulnEq = mean(norm(poverty), 1 − norm(income), norm(poc)); vulnHealth = mean(norm(asthma), svi); min-max across
  hexes, averaging whichever parts are present.
"""
import json

import geopandas as gpd
import numpy as np
import pandas as pd

from pipeline.config import EQUAL_AREA_CRS, RAW
from pipeline.fetch.census import OUT as ACS_PATH
from pipeline.io import hex_gdf, read_interim, write_interim

SFHA = {"A", "AE", "AO", "VE"}
POP_FLOOR = 0.05
MIN_TRACT_POP = 200
RATES = ["income", "poverty", "poc", "asthma", "svi"]


def norm(s):
    s = pd.Series(s, dtype=float)
    return (s - s.min()) / (s.max() - s.min())


def tracts():
    t = gpd.read_file(f"zip://{RAW / 'census' / 'cb_2024_24_tract_500k.zip'}")
    t = t[t.COUNTYFP == "510"][["GEOID", "geometry"]].to_crs(4326)
    acs = pd.DataFrame(json.load(open(ACS_PATH))["tracts"])
    acs["poverty"] = acs.pov_below / acs.pov_universe
    acs["poc"] = 1 - acs.white_nh / acs.race_total
    t = t.merge(acs[["geoid", "income", "poverty", "poc", "pop"]].rename(columns={"geoid": "GEOID", "pop": "tract_pop"}),
                on="GEOID", how="left")
    places = [r for r in json.load(open(RAW / "health" / "cdc_places_tract_baltimore.json")) if r["measureid"] == "CASTHMA"]
    asthma = {r["locationname"]: float(r["data_value"]) for r in places if r.get("data_value") not in (None, "")}
    t["asthma"] = t.GEOID.map(asthma)
    svi = gpd.read_file(RAW / "health" / "cdc_svi_2022_baltimore.geojson")
    svi_map = {f: (v if v >= 0 else np.nan) for f, v in zip(svi.FIPS.astype(str), svi.RPL_THEMES)}
    t["svi"] = t.GEOID.map(svi_map)
    small = t.tract_pop < MIN_TRACT_POP
    print(f"tracts with < {MIN_TRACT_POP} residents (rates → missing): {t.loc[small, 'GEOID'].tolist()}")
    t.loc[small, RATES] = np.nan
    return t


def build():
    grid = read_interim("grid")
    lc = read_interim("landcover").set_index("h3")
    pts = gpd.GeoDataFrame(grid[["h3"]], geometry=gpd.points_from_xy(grid.lng, grid.lat), crs=4326)
    t = tracts()
    j = gpd.sjoin(pts, t, how="left", predicate="within").drop(columns="index_right")
    j = j[~j.h3.duplicated()]
    miss = j.GEOID.isna()
    if miss.any():
        near = gpd.sjoin_nearest(pts[miss.values].to_crs(EQUAL_AREA_CRS), t.to_crs(EQUAL_AREA_CRS), how="left")
        near = near[~near.h3.duplicated()].set_index("h3")
        for c in t.columns.drop("geometry"):
            j.loc[miss, c] = near.loc[j.loc[miss, "h3"], c].to_numpy()
    print(f"tract join: {int(miss.sum())} hex centers outside all tracts → nearest tract")
    df = pd.DataFrame(j.drop(columns="geometry"))
    bldg = lc.loc[df.h3, "bldg21"].fillna(0).to_numpy()
    land = 1 - lc.loc[df.h3, "water21"].fillna(0).to_numpy()
    df["w"] = bldg + POP_FLOOR * land
    nb_pop = {f["properties"]["Name"]: float(f["properties"].get("Population") or 0)
              for f in json.load(open(RAW / "boundaries" / "neighborhoods.geojson"))["features"]}
    df["nb"] = grid.nb.to_numpy()
    df["pop"] = df.nb.map(nb_pop) * df.w / df.groupby("nb").w.transform("sum")
    df["pop"] = df["pop"].fillna(0)

    mi = json.load(open(RAW / "history" / "mappinginequality_us.json"))
    holc = gpd.GeoDataFrame.from_features([f for f in mi["features"] if f["properties"]["city"] == "Baltimore"], crs=4326)
    holc = holc[holc.grade.isin(list("ABCD"))][["grade", "geometry"]]
    hj = gpd.sjoin(pts, holc, how="left", predicate="within")
    hj = hj[~hj.h3.duplicated()]
    df["holc"] = hj.grade.where(hj.grade.notna(), None).to_numpy()

    fl = gpd.read_file(RAW / "context" / "floodplain.geojson")
    fl = fl[fl.FLD_ZONE.isin(SFHA)][["geometry"]]
    fl["geometry"] = fl.geometry.buffer(0)
    hx = hex_gdf(grid.h3)
    fj = gpd.sjoin(hx, fl, how="inner", predicate="intersects")
    df["flood"] = df.h3.isin(set(fj.h3))

    df["vulnEq"] = pd.concat([norm(df.poverty), 1 - norm(df.income), norm(df.poc)], axis=1).mean(axis=1).to_numpy()
    df["vulnHealth"] = pd.concat([norm(df.asthma), df.svi.astype(float)], axis=1).mean(axis=1).to_numpy()
    for c in ("vulnEq", "vulnHealth"):
        n = df[c].isna().sum()
        if n:
            print(f"{c}: {n} hexes with no data → city median")
            df[c] = df[c].fillna(df[c].median())
    out = df[["h3", "GEOID", "income", "poverty", "poc", "asthma", "svi", "holc", "pop", "flood", "vulnEq", "vulnHealth"]]
    out = out.rename(columns={"GEOID": "tract"})
    print(f"pop total {out['pop'].sum():,.0f}; holc {out.holc.value_counts().to_dict()}; flood hexes {int(out.flood.sum())}")
    print(out[["income", "poverty", "poc", "asthma", "svi", "vulnEq", "vulnHealth"]].describe().T[["count", "mean", "min", "max"]].round(3).to_string())
    return write_interim(out, "social")


if __name__ == "__main__":
    build()
