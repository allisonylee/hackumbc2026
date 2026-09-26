"""ACS 5-year tract tables for Baltimore City → raw/census/acs5_<year>_tract_24510.json.

Run: python -m pipeline.fetch.census
"""
import json

import requests

from pipeline.config import RAW
from pipeline.io import census_key

YEAR = 2024  # latest ACS 5-year release as of 2026-09
VARS = {
    "B19013_001E": "income",        # median household income
    "B17001_001E": "pov_universe",  # poverty status determined
    "B17001_002E": "pov_below",     # below poverty level
    "B03002_001E": "race_total",
    "B03002_003E": "white_nh",      # non-Hispanic white alone
    "B01003_001E": "pop",
}
OUT = RAW / "census" / f"acs5_{YEAR}_tract_24510.json"


def fetch(force=False):
    if OUT.exists() and not force:
        print(f"cached {OUT.name}")
        return OUT
    url = f"https://api.census.gov/data/{YEAR}/acs/acs5"
    params = {"get": "NAME," + ",".join(VARS), "for": "tract:*", "in": "state:24 county:510", "key": census_key()}
    r = requests.get(url, params=params, timeout=60)
    r.raise_for_status()
    rows = r.json()
    header, data = rows[0], rows[1:]
    out = []
    for row in data:
        d = dict(zip(header, row))
        rec = {"geoid": d["state"] + d["county"] + d["tract"], "name": d["NAME"]}
        for code, name in VARS.items():
            v = float(d[code]) if d[code] not in (None, "") else None
            rec[name] = None if v is None or v < 0 else v  # Census null codes are large negatives
        out.append(rec)
    OUT.write_text(json.dumps({"year": YEAR, "source": url, "tracts": out}, indent=1))
    print(f"wrote {OUT.name}: {len(out)} tracts")
    return OUT


if __name__ == "__main__":
    fetch()
