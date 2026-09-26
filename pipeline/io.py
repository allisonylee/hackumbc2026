"""Small shared helpers: interim parquet I/O, the census key, and the H3 grid geometry."""
import os
from pathlib import Path

import geopandas as gpd
import h3
import pandas as pd
from shapely.geometry import Polygon

from pipeline.config import INTERIM, ROOT

MAIN_CHECKOUT = Path("/Users/allisonlee/Desktop/AI/hackumbc2026")


def write_interim(df: pd.DataFrame, name: str) -> Path:
    INTERIM.mkdir(parents=True, exist_ok=True)
    path = INTERIM / f"{name}.parquet"
    df.to_parquet(path, index=False)
    print(f"wrote {path.relative_to(ROOT)}  rows={len(df):,}  cols={len(df.columns)}")
    return path


def read_interim(name: str) -> pd.DataFrame:
    path = INTERIM / f"{name}.parquet"
    if not path.exists():
        raise FileNotFoundError(f"{path} is missing; run `python -m pipeline.run --only {name}` first")
    return pd.read_parquet(path)


def census_key() -> str:
    """CENSUS_API_KEY from the environment or the repo-root .env (worktrees fall back to the main checkout)."""
    from dotenv import load_dotenv

    for env in (ROOT / ".env", MAIN_CHECKOUT / ".env"):
        if env.exists():
            load_dotenv(env, override=False)
    key = os.environ.get("CENSUS_API_KEY")
    if not key:
        raise RuntimeError("CENSUS_API_KEY not set (expected in the repo-root .env)")
    return key


def hex_gdf(cells, crs=4326) -> gpd.GeoDataFrame:
    """Polygons for H3 cells, in `crs`."""
    cells = list(cells)
    geom = [Polygon([(lng, lat) for lat, lng in h3.cell_to_boundary(c)]) for c in cells]
    return gpd.GeoDataFrame({"h3": cells}, geometry=geom, crs=4326).to_crs(crs)
