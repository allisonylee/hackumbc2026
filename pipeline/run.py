"""Run the pipeline stages in order. Each stage reads earlier interim files and writes its own.

  python -m pipeline.run                 # everything up to the model (Stages 0–1)
  python -m pipeline.run --only heat     # one stage
  python -m pipeline.run --from social   # a stage and everything after it
"""
import argparse
import time

from pipeline.build import features, grid, heat, landcover, neighborhoods_summary, sites, social
from pipeline.fetch import census

STAGES = {
    "census": census.fetch,
    "grid": grid.build,
    "sites": sites.build,
    "landcover": landcover.build,
    "heat": heat.build,
    "features": features.build,
    "social": social.build,
    "neighborhoods": neighborhoods_summary.build,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=STAGES)
    ap.add_argument("--from", dest="start", choices=STAGES)
    a = ap.parse_args()
    names = list(STAGES)
    run = [a.only] if a.only else names[names.index(a.start):] if a.start else names
    for name in run:
        t = time.time()
        print(f"== {name}")
        STAGES[name]()
        print(f"   {time.time() - t:.1f}s")


if __name__ == "__main__":
    main()
