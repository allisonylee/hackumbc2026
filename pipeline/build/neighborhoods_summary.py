"""Neighborhood-level summary (properties only; geometry is added at export) → interim/neighborhoods.parquet.

Per neighborhood, from its grid hexes: canopy and heat are land-area weighted (2021 canopy; observed 2018 afternoon
heat until the model's heatPred exists), income/asthma/poverty are population weighted, pop and sites are sums.
tes is the population-weighted Tree Equity Score of block groups whose centers fall in the neighborhood (unofficial
mirror; see pipeline/data/README.md). Ranks: 1 = hottest / greenest. bivHeat / bivIncome are 3×3 classes:
(2 − canopy tercile) × 3 + heat tercile, and (2 − canopy tercile) × 3 + (2 − income tercile).
"""
import json

import geopandas as gpd
import numpy as np
import pandas as pd

from pipeline.config import RAW
from pipeline.io import read_interim, write_interim


def wavg(v, w):
    m = np.isfinite(v) & (w > 0)
    return float(np.average(v[m], weights=w[m])) if m.any() else np.nan


def tercile(s):
    q1, q2 = s.quantile([1 / 3, 2 / 3])
    return np.where(s <= q1, 0, np.where(s <= q2, 1, 2))


def build():
    g = read_interim("grid")[["h3", "nb"]]
    lc = read_interim("landcover")[["h3", "canopy21", "water21", "valid_m2"]]
    df = (g.merge(lc, on="h3").merge(read_interim("heat")[["h3", "heatFill"]], on="h3")
           .merge(read_interim("social")[["h3", "income", "asthma", "poverty", "pop"]], on="h3"))
    sites = read_interim("sites").groupby("nb").size()
    df["land"] = df.valid_m2 * (1 - df.water21.fillna(0))
    rows = []
    for nb, d in df.groupby("nb"):
        land, pop = d.land.to_numpy(), d["pop"].to_numpy()
        rows.append(dict(
            name=nb,
            canopy=wavg(d.canopy21.to_numpy() / np.maximum(1 - d.water21.fillna(0).to_numpy(), 1e-9), land),
            heat=wavg(d.heatFill.to_numpy(), land),
            income=wavg(d.income.to_numpy(), pop), asthma=wavg(d.asthma.to_numpy(), pop),
            poverty=wavg(d.poverty.to_numpy(), pop), pop=float(pop.sum()), sites=int(sites.get(nb, 0)),
        ))
    out = pd.DataFrame(rows)
    names = {f["properties"]["Name"] for f in json.load(open(RAW / "boundaries" / "neighborhoods.geojson"))["features"]}
    missing = sorted(names - set(out.name))
    if missing:
        print(f"neighborhoods with no grid hex (center rule): {missing}")

    tes = gpd.read_file(RAW / "history" / "tes_maryland_mirror_baltimore.geojson")[["tes", "acs_pop", "geometry"]]
    tes["geometry"] = tes.geometry.representative_point()
    nbg = gpd.read_file(RAW / "boundaries" / "neighborhoods.geojson")[["Name", "geometry"]]
    tj = gpd.sjoin(tes.to_crs(4326), nbg.to_crs(4326), predicate="within")
    tes_nb = tj.groupby("Name").apply(lambda d: wavg(d.tes.to_numpy(float), d.acs_pop.to_numpy(float) + 1), include_groups=False)
    out["tes"] = out.name.map(tes_nb)

    out["rankHeat"] = out.heat.rank(ascending=False, method="first").astype(int)
    out["rankCanopy"] = out.canopy.rank(ascending=False, method="first").astype(int)
    can_t = 2 - tercile(out.canopy)
    out["bivHeat"] = can_t * 3 + tercile(out.heat)
    out["bivIncome"] = can_t * 3 + (2 - tercile(out.income.fillna(out.income.median())))
    out["canopyGap"] = (0.40 - out.canopy).clip(lower=0)
    print(f"{len(out)} neighborhoods; canopy {out.canopy.min():.2f}–{out.canopy.max():.2f}, "
          f"heat {out.heat.min():.1f}–{out.heat.max():.1f}°F, below 20% canopy: {(out.canopy < 0.2).sum()}, tes missing: {out.tes.isna().sum()}")
    return write_interim(out, "neighborhoods")


if __name__ == "__main__":
    build()
