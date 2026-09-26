"""Heat-model features per hex, for 2018 (training) and 2021 (current) → interim/features.parquet.

Own-hex land cover comes from landcover.parquet. Neighbor features are means over grid_disk(h, k), including h,
over every cell the land cover raster covers, including halo cells outside the grid such as open water (cells
beyond the city raster are ignored rather than counted as zero):
  canopyLag1/3, impervLag1/3 (k = 1, 3) and waterNear (water fraction, k = 4).
distHarborKm is the great-circle distance from the hex center to the Inner Harbor. Columns end in 18 or 21.
Only physical features belong here; socioeconomic variables stay out of the heat model (plan §5.1).
"""
import h3
import numpy as np
import pandas as pd

from pipeline.io import read_interim, write_interim

HARBOR = (39.2856, -76.6081)
YEARS = ("18", "21")


def disk_mean(cells, lookup, k):
    """Mean of `lookup` (cell → value, NaN-free) over grid_disk(c, k) for each cell."""
    return np.array([np.mean([lookup[x] for x in h3.grid_disk(c, k) if x in lookup]) for c in cells])


def build():
    grid = read_interim("grid")
    lc = read_interim("landcover")
    df = grid[["h3"]].merge(lc, on="h3", how="left")
    assert df.canopy21.notna().all()
    cells = df.h3.tolist()
    covered = lc[lc.valid_m2 > 0]
    out = pd.DataFrame({"h3": cells})
    for y in YEARS:
        for f in ("canopy", "imperv", "bldg", "road", "lowveg", "bare"):
            out[f"{f}{y}"] = df[f"{f}{y}"]
        look = {f: dict(zip(covered.h3, covered[f"{f}{y}"])) for f in ("canopy", "imperv", "water")}
        out[f"canopyLag1_{y}"] = disk_mean(cells, look["canopy"], 1)
        out[f"canopyLag3_{y}"] = disk_mean(cells, look["canopy"], 3)
        out[f"impervLag1_{y}"] = disk_mean(cells, look["imperv"], 1)
        out[f"impervLag3_{y}"] = disk_mean(cells, look["imperv"], 3)
        out[f"waterNear_{y}"] = disk_mean(cells, look["water"], 4)
    out["distHarborKm"] = [h3.great_circle_distance(h3.cell_to_latlng(c), HARBOR, unit="km") for c in cells]
    print(out.describe().T[["mean", "min", "max"]].round(3).to_string())
    return write_interim(out, "features")


if __name__ == "__main__":
    build()
