from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIPELINE = ROOT / "pipeline"
RAW = PIPELINE / "data" / "raw"
INTERIM = PIPELINE / "data" / "interim"
WEB_DATA = ROOT / "web" / "public" / "data"

BBOX = (-76.72, 39.19, -76.52, 39.38)  # (minx, miny, maxx, maxy), EPSG:4326
H3_RES = 10
NMAX = 30          # max trees (candidate sites) per hex
CROWN_M2 = 50      # canopy area added per planted tree
COST = {"pit": 1000, "potential": 2000}

EQUAL_AREA_CRS = "EPSG:26985"  # Maryland State Plane, meters
