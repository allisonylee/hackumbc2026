"""Candidate planting sites → interim/sites.parquet.

Vacant Site / Vacant Potential records from the Forestry inventory ("Vacant Site Not Suitable" dropped), with
cost, overhead utilities, width, size class, crown units, survival (pipeline/site_rules.py) and a suggested
species rotated within its size class. Sites are sorted per hex by crown × surv / cost desc, ties cheapest.
"""
import json

import h3
import pandas as pd

from pipeline.build.species import species_list
from pipeline.config import COST, H3_RES, RAW
from pipeline.io import read_interim, write_interim
from pipeline.site_rules import crown_units, rescale_surv, size_class, surv_base


def parse_width(w):
    if w in (None, ""):
        return None
    return 20 if str(w).startswith(">") else int(float(w))


def load_vacant():
    """Plantable inventory records as dicts (no hex filtering)."""
    vac = json.load(open(RAW / "trees" / "vacant_sites.geojson"))
    out = []
    for f in vac["features"]:
        pr, g = f["properties"], f["geometry"]
        if pr.get("SPP") not in ("Vacant Site", "Vacant Potential") or not g:
            continue
        typ = "potential" if pr["SPP"] == "Vacant Potential" else "pit"
        out.append(dict(
            id=str(pr["OBJECTID"]), lng=round(g["coordinates"][0], 5), lat=round(g["coordinates"][1], 5),
            type=typ, cost=COST[typ], util=(pr.get("UTILITIES") or "None") != "None",
            width=parse_width(pr.get("SPACEWIDTH")), space=pr.get("SPACE_TYPE"),
        ))
    return out


def build():
    grid = read_interim("grid").set_index("h3")
    sites = pd.DataFrame(load_vacant())
    sites["h3"] = [h3.latlng_to_cell(la, ln, H3_RES) for la, ln in zip(sites.lat, sites.lng)]
    n0 = len(sites)
    sites = sites[sites.h3.isin(grid.index)].copy()
    print(f"sites: kept {len(sites):,} of {n0:,} (dropped {n0 - len(sites)} outside the grid)")
    sites["nb"] = grid.loc[sites.h3, "nb"].to_numpy()
    sites["size"] = [size_class(u, t, w) for u, t, w in zip(sites.util, sites.type, sites.width)]
    sites["crown"] = sites["size"].map(crown_units)
    base = [surv_base(t, sp, w) for t, sp, w in zip(sites.type, sites.space, sites.width)]
    sites["surv"] = rescale_surv(base).round(3)
    sites["density"] = sites.crown * sites.surv / sites.cost
    sites = sites.sort_values(["h3", "density", "cost", "id"], ascending=[True, False, True, True]).drop(columns="density")
    by_size = {sz: [x["name"] for x in species_list() if x["size"] == sz] for sz in ("small", "medium", "large")}
    rot = {sz: 0 for sz in by_size}
    names = []
    for sz in sites["size"]:
        names.append(by_size[sz][rot[sz] % len(by_size[sz])])
        rot[sz] += 1
    sites["species"] = names
    sites["width"] = sites["width"].astype("Int64")
    print(sites["size"].value_counts().to_dict(), "surv mean", round(sites.surv.mean(), 3))
    return write_interim(sites.reset_index(drop=True), "sites")


if __name__ == "__main__":
    build()
