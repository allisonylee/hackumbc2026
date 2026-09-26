"""Per-hex land cover fractions for 2013, 2018 and 2021 → interim/landcover.parquet.

Chesapeake 1 m LULC (2024 Edition). Instead of per-polygon zonal stats, each window of the raster gets the hex
row index painted onto it (pixel-center rule), and class counts per hex come from one np.bincount per year.
Fractions are over valid (non-NoData) pixels; `valid_m2` records how much of the hex the raster covers.

Groups (codes from lulc_2024-Edition.xml; see pipeline/data/README.md):
  canopy  = all tree canopy, including canopy over roads/structures/other impervious
  road, bldg, imperv = exposed impervious only (imperv = road + bldg + other impervious + extractive + solar)
  water, lowveg (turf, herbaceous, shrub, herbaceous wetland, crop/pasture), other (barren, bare developed)
"""
import numpy as np
import pandas as pd
import rasterio
from rasterio.features import rasterize
from rasterio.windows import Window, bounds as win_bounds

from pipeline.config import RAW
from pipeline.io import hex_gdf, read_interim, write_interim

YEARS = {"13": 2013, "18": 2018, "21": 2021}
GROUPS = ["nodata", "canopy", "road", "bldg", "impervOther", "water", "lowveg", "other"]
CODES = {
    "canopy": [23, 24, 25, 26, 40, 41, 53, 54, 63, 64, 73, 74],
    "road": [20],
    "bldg": [21],
    "impervOther": [22, 31, 32],
    "water": [10, 11, 12, 13, 14],
    "lowveg": [27, 34, 35, 37, 38, 43, 44, 46, 51, 52, 61, 62, 71, 72, 81, 86],
    "other": [15, 28, 30, 33, 36, 42, 50, 55, 60, 70],
}
LUT = np.full(256, GROUPS.index("other"), dtype=np.int64)
LUT[0] = 0
for g, codes in CODES.items():
    LUT[codes] = GROUPS.index(g)
WIN = 2048


def path(year):
    return RAW / "landcover" / f"balt_24510_lulc_{year}_2024-Edition.tif"


def build():
    grid = read_interim("grid")
    n, G = len(grid), len(GROUPS)
    with rasterio.open(path(2021)) as ref:
        crs, transform, W, H = ref.crs, ref.transform, ref.width, ref.height
    hexes = hex_gdf(grid.h3, crs)
    sindex = hexes.sindex
    counts = {k: np.zeros(n * G, dtype=np.int64) for k in YEARS}
    srcs = {k: rasterio.open(path(y)) for k, y in YEARS.items()}
    for s in srcs.values():
        assert s.crs == crs and s.transform == transform and (s.width, s.height) == (W, H), "rasters must align"
    for row in range(0, H, WIN):
        for col in range(0, W, WIN):
            win = Window(col, row, min(WIN, W - col), min(WIN, H - row))
            wt = rasterio.windows.transform(win, transform)
            idx = sindex.query(__import__("shapely").geometry.box(*win_bounds(win, transform)))
            if len(idx) == 0:
                continue
            ids = rasterize(((hexes.geometry.iloc[i], i + 1) for i in idx), out_shape=(win.height, win.width),
                            transform=wt, fill=0, dtype="int32")
            m = ids > 0
            if not m.any():
                continue
            hid = ids[m].astype(np.int64) - 1
            for k, s in srcs.items():
                grp = LUT[s.read(1, window=win)[m]]
                counts[k] += np.bincount(hid * G + grp, minlength=n * G)
    for s in srcs.values():
        s.close()
    out = pd.DataFrame({"h3": grid.h3})
    for k, c in counts.items():
        c = c.reshape(n, G)
        valid = c[:, 1:].sum(1)
        frac = c / np.maximum(valid, 1)[:, None]
        out[f"canopy{k}"] = frac[:, 1]
        out[f"road{k}"] = frac[:, 2]
        out[f"bldg{k}"] = frac[:, 3]
        out[f"imperv{k}"] = frac[:, 2] + frac[:, 3] + frac[:, 4]
        out[f"water{k}"] = frac[:, 5]
        out[f"lowveg{k}"] = frac[:, 6]
        if k == "21":
            out["valid_m2"] = valid  # 1 m pixels
    for k in YEARS:
        land = out[f"water{k}"] < 0.99
        w = out.valid_m2 * (1 - out[f"water{k}"])
        print(f"20{k}: canopy (land-weighted) {np.average(out[f'canopy{k}'][land] / (1 - out[f'water{k}'][land]), weights=w[land]):.3f}"
              f"  imperv {np.average(out[f'imperv{k}'][land] / (1 - out[f'water{k}'][land]), weights=w[land]):.3f}")
    print(f"hexes with no raster coverage: {(out.valid_m2 == 0).sum()}; <50% covered: {(out.valid_m2 < 7500).sum()}")
    return write_interim(out, "landcover")


if __name__ == "__main__":
    build()
