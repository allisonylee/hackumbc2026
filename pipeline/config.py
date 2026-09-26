from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIPELINE = ROOT / "pipeline"
RAW = PIPELINE / "data" / "raw"
INTERIM = PIPELINE / "data" / "interim"
WEB_DATA = ROOT / "web" / "public" / "data"

BBOX = (-76.72, 39.19, -76.52, 39.38)  # (minx, miny, maxx, maxy), EPSG:4326
H3_RES = 10
NMAX = 45          # max trees (candidate sites) per hex; the densest hex in the inventory has 42
CROWN_UNIT_M2 = 25  # gains are per crown unit of new canopy (see CONTRACTS.md)
CROWN_UNITS = {"small": 1, "medium": 2, "large": 3}  # ≈25/50/75 m² crowns at ~20 years
NMAX_UNITS = 135    # max crown units per hex (45 large trees)
SURV_MEAN = 0.66    # mean street-tree survival (research.md); site survival is rescaled to this
EXPO_W = 0.5        # max-exposure hex with no residents counts as half a P90-population hex
COST = {"pit": 1000, "potential": 2000}

EQUAL_AREA_CRS = "EPSG:26985"  # Maryland State Plane, meters
