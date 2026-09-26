"""H3 res-10 grid for Baltimore City → interim/grid.parquet (h3, nb, lat, lng).

A cell is in the city if its center falls inside a neighborhood polygon. Edge cells whose center is just outside
but that hold a real planting site are added too (same rule as the mock), so no inventory site is lost at the
boundary; their neighborhood is the most common one within grid_disk(c, 2).
"""
import json

import h3
import pandas as pd

from pipeline.build.sites import load_vacant
from pipeline.config import H3_RES, RAW
from pipeline.io import write_interim


def build():
    nb_raw = json.load(open(RAW / "boundaries" / "neighborhoods.geojson"))
    cell_nb = {}
    for f in nb_raw["features"]:
        for c in h3.geo_to_cells(f["geometry"], H3_RES):
            cell_nb.setdefault(c, f["properties"]["Name"])
    n_center = len(cell_nb)
    for s in load_vacant():
        c = h3.latlng_to_cell(s["lat"], s["lng"], H3_RES)
        if c not in cell_nb:
            near = [cell_nb[n] for n in h3.grid_disk(c, 2) if n in cell_nb]
            if near:
                cell_nb[c] = max(sorted(set(near)), key=near.count)
    cells = sorted(cell_nb)
    lat, lng = zip(*(h3.cell_to_latlng(c) for c in cells))
    df = pd.DataFrame({"h3": cells, "nb": [cell_nb[c] for c in cells], "lat": lat, "lng": lng})
    print(f"grid: {n_center:,} cells by center + {len(df) - n_center} edge cells with sites")
    return write_interim(df, "grid")


if __name__ == "__main__":
    build()
