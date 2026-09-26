"""Per-hex afternoon air temperature (NOAA Heat Watch, 2018-08-29, 3–4 pm) → interim/heat.parquet.

Same painting approach as landcover.py on the ~10 m heat grid: `heat` is the mean of valid pixels whose centers
fall in the hex. Hexes with less than MIN_COVER of their pixels valid get heat = NaN (not used for training).
`heatFill` fills those from the mean of valid hexes in grid_disk(h, 2), then the city median, for display only.
Evening (7–8 pm) is kept as `heatEve` for reference; the model target is the afternoon.
"""
import h3
import numpy as np
import pandas as pd
import rasterio
from rasterio.features import rasterize

from pipeline.config import RAW
from pipeline.io import hex_gdf, read_interim, write_interim

MIN_COVER = 0.5
FILES = {"heat": "baltimore_afternoon_air_temperature_20180829.tif",
         "heatEve": "baltimore_evening_air_temperature_20180829.tif"}


def hex_means(grid, file):
    with rasterio.open(RAW / "heat" / file) as src:
        a = src.read(1)
        nodata = src.nodata
        hexes = hex_gdf(grid.h3, src.crs)
        ids = rasterize(((g, i + 1) for i, g in enumerate(hexes.geometry)), out_shape=a.shape,
                        transform=src.transform, fill=0, dtype="int32")
    n = len(grid)
    m = ids > 0
    hid = ids[m].astype(np.int64) - 1
    v = a[m]
    ok = (v != nodata) & np.isfinite(v)
    total = np.bincount(hid, minlength=n)
    cnt = np.bincount(hid[ok], minlength=n)
    s = np.bincount(hid[ok], weights=v[ok], minlength=n)
    mean = np.where(cnt > 0, s / np.maximum(cnt, 1), np.nan)
    cover = cnt / np.maximum(total, 1)
    return mean, cover


def build():
    grid = read_interim("grid")
    out = pd.DataFrame({"h3": grid.h3})
    for col, f in FILES.items():
        mean, cover = hex_means(grid, f)
        out[col] = np.where(cover >= MIN_COVER, mean, np.nan)
        if col == "heat":
            out["heatCover"] = cover
    med = float(np.nanmedian(out.heat))
    val = dict(zip(out.h3, out.heat))
    fill = []
    for c, v in zip(out.h3, out.heat):
        if np.isfinite(v):
            fill.append(v)
            continue
        near = [val[x] for x in h3.grid_disk(c, 2) if x in val and np.isfinite(val[x])]
        fill.append(float(np.mean(near)) if near else med)
    out["heatFill"] = fill
    h = out.heat.dropna()
    print(f"heat: {len(h):,} of {len(out):,} hexes covered; min/median/max {h.min():.1f}/{h.median():.1f}/{h.max():.1f}°F "
          f"(spread {h.max() - h.min():.1f}°F)")
    return write_interim(out, "heat")


if __name__ == "__main__":
    build()
