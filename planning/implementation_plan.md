# Implementation Plan — Baltimore Tree Planting Planner

Companion to [research.md](research.md), which has the data URLs, citations and background. This document covers **how to build the app, step by step**.
Assumes: solo builder, a 24–36 h hackathon, 2–3 parallel Claude Code sessions.

---

## Contents
- [0. Architecture at a glance](#0-architecture-at-a-glance)
- [1. Before the hackathon (allowed prep only)](#1-before-the-hackathon-allowed-prep-only)
- [2. Hour 0: repo setup](#2-hour-0-repo-setup)
- [3. Data contracts](#3-data-contracts)
- [4. Data pipeline (Python)](#4-data-pipeline-python)
- [5. Heat model and benefit curves (Python)](#5-heat-model-and-benefit-curves-python)
- [6. Frontend foundation](#6-frontend-foundation)
- [7. Tab 1: Current State](#7-tab-1-current-state)
- [8. Tab 2: Plan](#8-tab-2-plan)
- [9. Tab 3: Learn (story, how to help, chat)](#9-tab-3-learn-story-how-to-help-chat)
- [10. Backend (FastAPI, Ollama, retrieval)](#10-backend-fastapi-ollama-retrieval)
- [11. Footprint and evaluation panels](#11-footprint-and-evaluation-panels)
- [12. Deployment](#12-deployment)
- [13. Testing and verification](#13-testing-and-verification)
- [14. Timeline and sessions](#14-timeline-and-sessions)
- [15. Scope cuts (in order)](#15-scope-cuts-in-order)
- [16. Demo script (2 minutes)](#16-demo-script-2-minutes)
- [17. Submission checklist](#17-submission-checklist)

---

## 0. Architecture at a glance

```
┌──────────── Python offline pipeline (your laptop) ────────────┐
│ fetch raw data → H3 grid → per-hex features → heat model       │
│ → benefit curves + SHAP + stats → export static JSON           │
└───────────────┬────────────────────────────────────────────────┘
                │ writes web/public/data/*.json
┌───────────────▼──────── Frontend (static, DO App Platform) ────┐
│ React + Vite + TS · Tailwind + shadcn · motion                  │
│ One persistent MapLibre + deck.gl map shared by all tabs        │
│ Web Worker: greedy optimizer (runs in the browser)              │
│ Learn: scroll story · How to help · Chat drawer                 │
└───────────────┬─────────────────────────────────────────────────┘
                │ POST /api/chat (only when the chat is open)
┌───────────────▼──────── Backend (FastAPI) ─────────────────────┐
│ localhost:8000 (dev / ?llm=local)  or  api.<domain> (droplet)   │
│ router → neighborhood stats / retrieval → Ollama qwen3.5:2b     │
│ streams tokens + sources + energy estimate                      │
└─────────────────────────────────────────────────────────────────┘
```

**Key principles**
- Everything the map and optimizer need is **precomputed static JSON**. There's no server on the critical path.
- The LLM is used **only in the chat**. The optimizer is plain math.
- `main` must always build, because every push to `main` redeploys.

---

## 1. Before the hackathon (allowed prep only)

> Check hackUMBC's rules on pre-event work first. Accounts, downloading public data, reading docs and design sketches are almost always fine. Pre-written project code usually isn't.

- [ ] **Accounts and keys**
  - GitHub.
  - DigitalOcean account; ask an MLH coach for credits at the event.
  - GoDaddy Registry domain (promo `MLH0926HU`). Brainstorm 5 names.
  - Free Census API key: https://api.census.gov/data/key_signup.html
- [ ] **Install tools:** Node 20+, Python 3.11+, `uv` or venv, Ollama. Optionally `mapshaper` (`npm i -g mapshaper`).
- [ ] **Download models:**
  ```bash
  ollama pull qwen3.5:2b
  ```
  ```bash
  ollama pull embeddinggemma
  ```
- [ ] **Download large public files** to a scratch folder, if pre-event downloading is allowed:
  - Chesapeake 1 m land cover for Baltimore City. Get 2021/22, and 2013 too if you want the time-lapse or backtest. ~37 MB each.
  - Read the metadata XML and **write down the class codes** for tree canopy, impervious and water.
- [ ] **Collect Learn-tab sources** by reading and saving URLs. You'll turn them into corpus files at the event:
  - TreeBaltimore pages.
  - USFS Baltimore's Urban Forest 2020.
  - Howard Center "Code Red."
  - The papers listed in research.md §3.
  - Maryland native street-tree list.
- [ ] **Visual reference:** screenshots of apps you like, color palette and fonts.

---

## 2. Hour 0: repo setup

**Session A (main)** does this. Takes about 45–60 min.

- [ ] `git init` in `hackumbc2026/`; create the GitHub repo and push.
- [ ] Create this layout:
```
hackumbc2026/
  CLAUDE.md
  CONTRACTS.md
  planning/                  research.md, implementation_plan.md
  pipeline/
    requirements.txt
    config.py
    fetch/                   arcgis.py, trees.py, neighborhoods.py, heat.py, census.py,
                             health.py, holc.py, tes.py
    build/                   grid.py, features.py, social.py, neighborhoods_summary.py
    model/                   train_heat.py, curves.py, validate.py, baselines.py
    export/                  export_web.py, stats.py
    data/raw/  data/interim/          (both gitignored)
  web/                       Vite app (see §6)
    public/data/             hexes.json, sites.json, neighborhoods.geojson, holc.geojson,
                             stats.json, species.json, footprint.json
  backend/
    requirements.txt
    main.py  llm.py  rag.py  router.py  tools.py  energy.py  build_corpus.py
    corpus/                  *.md source documents with front-matter
    data/                    corpus_index.npz, cached_answers.json
  deploy/                    Caddyfile, api.service, setup_droplet.sh
  .claude/agents/            contract-checker.md, geo-validator.md
```
- [ ] **Write CLAUDE.md.** It should cover:
  - a two-line project summary, with links to both planning docs;
  - the stack;
  - how to run each part: `cd web && npm run dev`, `cd backend && uvicorn main:app --reload`, `python -m pipeline.export.export_web`;
  - the rules:
    - only edit your lane's folder;
    - CONTRACTS.md changes happen only on `main`;
    - commit after every working step;
    - `main` must always build;
    - no cloud LLM APIs;
    - keep `web/public/data` under ~5 MB gzipped.
- [ ] **Write CONTRACTS.md** by copying §3 below.
- [ ] **Generate mock data** that matches the contracts: about 2,000 random hexes around Baltimore and 3,000 random sites, with plausible ranges. The frontend lanes can start immediately.
- [ ] **Add `.claude/agents/`:**
  - `contract-checker`: validates `web/public/data/*.json` against CONTRACTS.md. Read-only.
  - `geo-validator`: checks coordinates fall inside the Baltimore bounding box, the expected counts, and that no geometry is empty.
- [ ] **Scaffold the web app (§6.1)** and deploy "hello map" to App Platform (§12.1). Connecting the deploy at hour 0 is deliberate.
- [ ] **Create worktrees:**
  ```bash
  git worktree add ../hack-pipeline -b feat/pipeline
  ```
  ```bash
  git worktree add ../hack-backend -b feat/backend
  ```

**Done when:** the public URL shows a dark Baltimore map, and the mock data loads without errors.

---

## 3. Data contracts

Keep keys short but readable. Round coordinates to 5 decimals and floats to 3.

> **Contract change applied (2026-09-26):** tree size, survival and exposure fields are in `CONTRACTS.md`, `web/src/lib/types.ts` and the mock. The optimizer (§8.1) still needs to switch to the crown-unit formula.

### `hexes.json`: array, one object per H3 res-10 cell (~14–16k)
```ts
type Hex = {
  h3: string;              // H3 res 10 index
  nb: string;              // neighborhood name (centroid join)
  canopy: number;          // 0–1, fraction tree canopy (2021/22)
  canopy13?: number;       // 0–1, 2013 (optional: time-lapse)
  imperv: number;          // 0–1
  bldg: number;            // 0–1 building footprint fraction
  road: number;            // 0–1 road fraction
  heat: number | null;     // °F, NOAA Heat Watch afternoon 2018-08-29 (mean); null if not covered
  heatAnom: number;        // °F minus city median (uses heatPred where heat is null)
  heatPred: number;        // ML model prediction °F
  heatResid: number | null;// heat − heatPred
  spill: number;           // extra °F·people of neighbor cooling per tree (0 if spillover skipped)
  income: number | null;   // tract median household income $
  poverty: number | null;  // 0–1 share below poverty line
  poc: number | null;      // 0–1 share people of color
  asthma: number | null;   // % adults with asthma (CDC PLACES)
  svi: number | null;      // 0–1 CDC SVI overall percentile
  holc: "A"|"B"|"C"|"D"|null;
  pop: number;             // estimated residents in hex
  expo: number;            // 0–1 outdoor exposure: bus stops, schools, cooling-center approaches (§4.6)
  people: number;          // people exposed = pop + EXPO_W × expo × P90(pop); used by the optimizer
  vulnEq: number;          // 0–1 equity score (poverty/income/poc composite)
  vulnHealth: number;      // 0–1 health score (asthma/svi composite)
  flood: boolean;          // intersects FEMA floodplain (optional)
  cap: number;             // # candidate sites used (≤ NMAX)
  gains: number[];         // marginal °F cooling of each successive CROWN_UNIT (25 m²) of new canopy;
                           // length = total crown units of the hex's sites (≤ NMAX_UNITS), non-increasing, ≥0
  shap: [string, number][];// top 3 [feature, contribution °F]
};
```

### `sites.json`: array (~60k after filtering)
```ts
type Site = {
  id: string;              // inventory OBJECTID
  lng: number; lat: number;
  h3: string;              // parent hex
  type: "pit" | "potential";   // "Vacant Site" | "Vacant Potential"
  cost: number;            // $1000 pit, $2000 potential (assumption; see research §3)
  util: boolean;           // overhead utilities present
  width: number | null;    // space width (ft)
  space: string | null;    // SPACE_TYPE (e.g., "Tree Lawn")
  nb: string;
  species: string;         // suggested species (rule-based)
  size: "small" | "medium" | "large"; // mature size class of the suggested species
  crown: 1 | 2 | 3;        // crown units at ~20 yrs (small 25 m², medium 50 m², large 75 m²)
  surv: number;            // 0–1 expected establishment survival (§4.5, an assumption table)
};
```
Within each hex, sites are **sorted by expected canopy per dollar** (`crown × surv / cost`, descending; ties cheapest first). The optimizer uses the k-th site for the k-th tree, and the k-th tree uses the next `crown` entries of the hex's `gains`.

### `neighborhoods.geojson`: 279 features, simplified (mapshaper 8%)
Properties:
- `name`, `canopy`, `heat`, `income`, `pop`, `asthma`, `poverty`, `sites`, `tes` (optional), `rankHeat`, `rankCanopy`;
- `bivHeat` and `bivIncome`: 0–8 bivariate class index, computed in Python;
- `canopyGap` = max(0, 0.40 − canopy).

### `holc.geojson`
60 Baltimore polygons, property `grade`.

### `stats.json`
```ts
{
  city: { canopy, canopyGoal: 0.40, heatSpreadF, emptySites, nbBelow20 },
  corr: { vars: string[], matrix: number[][] },          // Pearson, neighborhood level
  regression: { slopeFPer10pct, r2, n },                  // heat ~ canopy (neighborhood)
  byHolc: [{ grade, canopy, heat, n }],
  model: { target, date, features: string[], nTrain,
           r2Random, r2Spatial, rmseSpatial, maeSpatial,
           baselines: { meanRmse, linearR2Spatial, linearSlopeFPer10pct },
           pdFPer10pct, pdCurve: [canopy, heatF][],           // for the model-card chart
           importance: [feature, meanAbsShapF][],
           trainSeconds, trainWh, limitations: string[] },
  literature: { zaerpour_C_per10: 0.8, meta_C_per10: 0.3 },
  treeBenefits: { small: {...}, medium: {...}, large: {...} }, // USFS NE guide values
  assumptions: { crownM2: { small, medium, large }, survMean, survBySpace: [space, surv][],
                 expoW, deadShareBySpace: [space, share][] }   // shown in the model card
}
```

### `heat_model.json`
LightGBM `dump_model()` output, pruned to `feature_names` plus `tree_info[].tree_structure`. Used by the in-browser what-if (§5.6). Target size under ~1–2 MB. If it's larger, reduce `n_estimators` or `num_leaves` for the exported copy.

### `species.json`
```ts
[{ name, latin, size: "small"|"medium"|"large", underWires: boolean,
   minWidthFt, native: boolean, notes }]
```

### `footprint.json`
```ts
{ pipelineKWh, pipelineGCO2, trainKWh, trainGCO2, region, measuredAt,
  devAiNote: string, cloudRefs: [{ name, wh, ml, source }] }
```

### Optimizer interface (TS, Web Worker)
```ts
type Weights = { heat: number; equity: number; health: number; eco: number }; // 0–1 each
type Params = {
  budget: number;                 // $ (tree-count mode multiplies by avg cost)
  weights: Weights;
  equityQuota: number;            // 0–1: min share of trees in vulnEq ≥ 0.5 hexes (0 = off)
  excludeNbs: string[];
  avoidUtilities: boolean;
  years: 0 | 10 | 20;             // maturity horizon for benefit display
};
type Result = {
  siteIds: string[];              // in selection order (rank → sprout delay)
  perHex: Record<string, number>; // h3 → trees
  impact: { trees, expectedSurviving, spent, coolingPersonF, avgFTargeted, residents,
            peopleExposed, shareLowIncome, shareHolcCD, co2LbYr, stormGalYr, benefitUsdYr };
            // all benefits are survival-weighted expected values
};
allocate(p: Params): Result
pareto(p: Params, steps = 21): { quota, cooling, shareLowIncome }[]
baselines(p: Params): { random: Result['impact'], lowestCanopy: ..., tes?: ... }
```

### Chat API
`POST /api/chat`
Request: `{ messages: [{role, content}], mode?: "learn" }`
Response: NDJSON stream, one JSON object per line:
```
{"type":"sources","items":[{"n":1,"title":"...","url":"..."}]}
{"type":"token","text":"Trees "}
...
{"type":"done","tokens":212,"energyWh":0.021,"measured":true,"cached":false}
```

---

## 4. Data pipeline (Python)

**Session B** (`feat/pipeline` worktree). Start at hour 0; this is the biggest risk.

`requirements.txt`:
- geopandas, shapely, pyproj, rasterio, rasterstats (or exactextract);
- h3>=4, pandas, numpy, requests;
- lightgbm, scikit-learn, shap, codecarbon, rapidfuzz.

### 4.1 `config.py`
- `BBOX = (-76.72, 39.19, -76.52, 39.38)`, `H3_RES = 10`, `NMAX = 30`.
- `CROWN_UNIT_M2 = 25`, `CROWN_UNITS = {"small": 1, "medium": 2, "large": 3}` (≈25/50/75 m² crowns at ~20 years), `NMAX_UNITS = 90`.
- `SURV_MEAN = 0.66` (research.md: ~66% street-tree survival), plus the `SURV` table in §4.5.
- `EXPO_W = 0.5`: a hex with maximum outdoor exposure and no residents counts as half of a dense (90th-percentile) residential hex.
- `COST = {"pit": 1000, "potential": 2000}`.
- Paths for `data/raw`, `data/interim` and `web/public/data`.
- `EQUAL_AREA_CRS = "EPSG:26985"` (Maryland State Plane, meters).

### 4.2 `fetch/arcgis.py`: one paged fetcher for every ArcGIS layer
```python
def fetch_layer(url, where="1=1", fields="*", page=2000):
    feats, offset = [], 0
    while True:
        r = requests.get(f"{url}/query", params=dict(where=where, outFields=fields, outSR=4326,
                         f="geojson", resultOffset=offset, resultRecordCount=page), timeout=60).json()
        feats += r.get("features", [])
        if not r.get("properties", {}).get("exceededTransferLimit") and len(r.get("features", [])) < page:
            break
        offset += page
    return gpd.GeoDataFrame.from_features(feats, crs=4326)
```
Cache every result to `data/raw/<name>.geojson` and skip the download if the file already exists.

### 4.3 Fetch scripts

The endpoints are in research.md §2.
- [ ] **`trees.py`:** Forestry inventory.
  - Query: `where="SPP IN ('Vacant Site','Vacant Potential')"`, fields `OBJECTID,SPP,SPACE_TYPE,SPACEWIDTH,UTILITIES,Neighborhood,PLANTING_POTENTIAL`. That's ~66k points and about 33 requests.
  - Optional: live trees, fields `OBJECTID,COMMON,DBH`, for a point-cloud layer. Skip it if time is short.
- [ ] **`neighborhoods.py`:** 279 polygons. Also save the dissolved city boundary.
- [ ] **`heat.py`:** NOAA ImageServer `exportImage` → `heat_afternoon.tif`.
  - Params: `bbox=BBOX`, `bboxSR=4326`, `imageSR=4326`, `size=2000,1900`, `format=tiff`, `pixelType=F32`, `mosaicRule={"mosaicMethod":"esriMosaicLockRaster","lockRasterIds":[2]}`, `f=image`.
  - **Check:** open it and confirm values are around 85–100°F with downtown hotter.
- [ ] **Land cover:** ✅ already downloaded (2013, 2018, 2021, and 2013–2021 change) to `pipeline/data/raw/landcover/`. The class codes are the 2024 LULC scheme, **not** the old 1–12 scheme; see `pipeline/data/README.md` for the canopy, impervious, water and low-vegetation code groups.
- [ ] **`census.py`:** ACS 2024 5-year at tract level, `state:24 county:510`.
  - Variables: `B19013_001E` (income), `B17001_001E`/`_002E` (poverty), `B03002_001E`/`_003E` (non-Hispanic white → POC = 1 − white/total), `B01003_001E` (population).
  - Tract geometry: TIGER cartographic boundary `cb_2024_24_tract_500k`.
  - Replace the Census null codes (negative values like −666666666) with NaN.
- [ ] **`health.py`:**
  - CDC PLACES asthma (`measureid=CASTHMA`, `countyfips=24510`) → tract.
  - CDC SVI 2022 FeatureServer, `where=STCNTY='24510'` → `RPL_THEMES`.
- [ ] **`holc.py`:** download the Mapping Inequality JSON, filter `city == "Baltimore"`, save.
- [ ] **`tes.py` (optional):** Tree Equity Score block groups for Baltimore, used as a baseline ranking.
- [ ] **`exposure.py`** (needed for the exposure term, §4.6). Cooling centers are already in `raw/context/cooling_centers.geojson`. Fetch:
  - MDOT MTA bus stops (Maryland open data / iMAP ArcGIS). Keep average weekday boardings if the layer has them; otherwise use stop counts. Add the endpoint to research.md §2.
  - Baltimore City public school locations (Open Baltimore). Add the endpoint to research.md §2.
  - If either fetch fails, build `expo` from what you have; cooling centers alone are enough for a first version.
- [ ] **Optional:** FEMA floodplain, parks (to exclude).

### 4.4 `build/grid.py`: the H3 grid
```python
city = gpd.read_file(RAW/"city_boundary.geojson").to_crs(4326).geometry.iloc[0]
cells = h3.geo_to_cells(city.__geo_interface__, H3_RES)
hexes = gpd.GeoDataFrame({"h3": list(cells)},
    geometry=[Polygon([(lng, lat) for lat, lng in h3.cell_to_boundary(c)]) for c in cells], crs=4326)
```
Expect about 14–16k cells.

### 4.5 `build/features.py`: per-hex features
- [ ] **Land cover:**
  - Reproject the hexes to the raster's CRS.
  - Run `zonal_stats(..., categorical=True)` (or exactextract, which is faster).
  - Compute `canopy`, `imperv` and `water` fractions. Repeat for 2013 if you have it.
- [ ] **Heat:** `zonal_stats(hexes, heat_afternoon.tif, stats=["mean"])` → `heat`. Then `heatAnom = heat − median`.
  - Fill NaN hexes (outside traverse coverage) with the k-ring mean, or drop them from training.
- [ ] **Neighbor features:** for each hex, take `h3.grid_disk(h, 2)` and compute `canopyLag` and `impervLag` as neighbor means, plus `waterNear` (water fraction within `grid_disk(h, 4)`).
- [ ] **Sites:** `sites["h3"] = h3.latlng_to_cell(lat, lng, 10)`.
  - Drop sites whose hex isn't in the grid.
  - Set cost per type and parse `util` from `UTILITIES` (e.g. "Yes"/"No"; check the actual values).
  - Assign `species` with a rule: `util` or width < 4 ft → small; width 4–6 → medium; otherwise large. Choose from `species.json` by rotating through the matching species for diversity.
  - **Potential pits:** ~21k of them have `SPACEWIDTH = "0"` because the well hasn't been cut yet. Treat them as a standard 5 ft well, not 0 ft, or every one becomes a small tree.
  - `size` = the species' size class; `crown = CROWN_UNITS[size]`.
- [ ] **Survival `surv`** (an assumption table; say so in the model card):

  | Site | Base survival |
  |---|---|
  | Width ≥ 6 ft, or Open/Unrestricted | 0.75 |
  | Width 4–5 ft (incl. potential pits at 5 ft) | 0.65 |
  | Width < 4 ft or unknown | 0.55 |
  | Median/Island | × 0.9 (traffic, road salt) |

  - Rescale so the mean over all candidate sites equals `SURV_MEAN`. Save the table to `stats.json.assumptions`.
  - **Sanity check only, not calibration:** the dead/stump share by `SPACE_TYPE` in `trees_all_other` is 6–12% and doesn't separate space types much. That's survivorship bias: dead street trees get removed and become vacant sites. Save the shares to `stats.json.assumptions.deadShareBySpace` and note the bias.
- [ ] **`cap`:** `min(#sites in hex, NMAX)`. Sort sites within each hex by `crown × surv / cost` descending (ties cheapest first).

### 4.6 `build/social.py`
- [ ] Spatial-join each hex centroid to its tract → `income`, `poverty`, `poc`, `asthma`, `svi`.
- [ ] `pop = tract_pop × (hex_area / tract_area)`. Optional improvement: weight by non-canopy, non-water fraction.
- [ ] **Outdoor exposure** (`pop` counts only people at home, but afternoon heat hits people waiting and walking):
  - `bus` = weekday boardings (or stop count) in `grid_disk(h, 1)`, then `norm(log1p(bus))`;
  - `school` = 1 if a school is within `grid_disk(h, 2)` (~250 m);
  - `coolNear` = 1 if a cooling center is within `grid_disk(h, 4)` (~500 m walk);
  - `expo = mean(bus, school, coolNear)` over the parts you have, 0–1;
  - `people = pop + EXPO_W × expo × P90(pop)`. Save `EXPO_W` to `stats.json.assumptions`.
- [ ] Centroid in a HOLC polygon → `holc`. Centroid in a neighborhood → `nb`.
- [ ] Composite scores, min-max normalized across hexes:
  - `vulnEq = mean(norm(poverty), 1 − norm(income), norm(poc))`
  - `vulnHealth = mean(norm(asthma), svi)`

### 4.7 `build/neighborhoods_summary.py`
- [ ] Aggregate hexes to neighborhoods, area- and population-weighted: canopy, heat, income, asthma, poverty, sites, pop.
- [ ] Bivariate classes: terciles of canopy (inverted) × terciles of heat → `bivHeat` index 0–8; same for income → `bivIncome`.
- [ ] Simplify the geometry:
  ```bash
  mapshaper nb.geojson -simplify 8% keep-shapes -o precision=0.00001 neighborhoods.geojson
  ```

**Checkpoint:** the `geo-validator` agent passes. The canopy mean citywide is about 0.27–0.30 (sanity check against the known ~28%). The heat range spans about 15°F.

---

## 5. Heat model and benefit curves (Python)

Also Session B. **This is a core feature and is never cut.** The model is what turns "plant where it's hot" into "plant where a tree will cool the most people." It feeds the Plan optimizer, the "Why here?" explanations, a model layer and model card in Current State, and the story's "turn" beat.

### 5.0 What the model does
- **Question it answers:** "Given a block's land cover and surroundings, how hot is it on a summer afternoon, and how much cooler would it be with more trees?"
- **Unit:** one H3 res-10 hex (~15,000 m², about 66 m across). That matches the 60–90 m scale where tree cooling is strongest (Ziter 2019).
- **Target (y):** mean afternoon air temperature (°F) from NOAA Heat Watch, 2018-08-29. It measures what people actually feel.
  - Optional second model: Landsat summer land surface temperature, as a robustness check.
- **Model:** LightGBM gradient-boosted trees with a **monotone constraint**: more canopy can never predict more heat. It's small, trains in seconds on a laptop CPU, and needs no GPU.
- **How it's used:** as a counterfactual. Add crown area to a hex, re-predict, and the difference is the cooling. SHAP explains each prediction.
- **In one paragraph:** the model learns, from ~15k hexes, how afternoon air temperature depends on a block's land cover and its surroundings. Training uses only physical features, so it answers "what would happen if this block had more canopy?" rather than "which kinds of neighborhoods are hot?". For each hex, we add canopy 25 m² at a time and record how much the prediction drops. That list of marginal drops (`gains`) is the only thing the optimizer takes from the model. It is hex-specific: a paved, treeless block far from water gets big early gains, while a leafy block gets little.

### 5.1 Feature engineering (`build/features.py` additions)
| Feature | Source | Why |
|---|---|---|
| `canopy` | land cover (tree classes incl. canopy over impervious) | main lever |
| `imperv` | land cover (structures + roads + other impervious) | heat source |
| `bldg` | land cover (impervious structures) | building mass traps heat |
| `road` | land cover (impervious roads) | asphalt heats most |
| `lowveg` | land cover (low vegetation / grass) | grass cools less than trees |
| `canopyLag1`, `canopyLag3` | mean canopy in `grid_disk(h,1)` and `grid_disk(h,3)` | cooling spills into nearby blocks |
| `impervLag1`, `impervLag3` | same, for impervious | surrounding heat load |
| `waterNear` | water fraction in `grid_disk(h,4)` | harbor and stream cooling |
| `distHarborKm` | distance from centroid to the Inner Harbor point (39.2856, −76.6081) | sea-breeze gradient |
| `elev` (optional) | USGS 3DEP 10 m DEM (`py3dep`) or skip | cold-air drainage in valleys |
| `ndvi` (optional) | Sentinel-2 summer composite (Planetary Computer) | vegetation vigor; skip if time is short |

- **Leave socioeconomic variables out of the heat model** (income, race, etc.). They correlate with heat but don't cause it physically, so including them would corrupt the counterfactual. They enter only through the optimizer's priority weights.
- **Drop training rows** where Heat Watch coverage is missing. Keep those hexes for prediction.

### 5.2 `model/train_heat.py`
- [ ] Wrap the whole script in `codecarbon.EmissionsTracker(project_name="heat_model", country_iso_code="USA", region="maryland")` and write the kWh and CO₂ out to `footprint.json`.
- [ ] **Baselines first, so you can show the ML adds value:**
  1. Mean-only model (predict the city median) → RMSE floor.
  2. Linear regression: `heat ~ canopy + imperv + waterNear` → interpretable slope (°F per 10% canopy).
  3. Optional: a PySAL `spreg` spatial-lag model for the "spatially aware" stats slide.
- [ ] **Main model:**
  ```python
  FEATS = ["canopy","imperv","bldg","road","lowveg","canopyLag1","canopyLag3",
           "impervLag1","impervLag3","waterNear","distHarborKm"]  # + elev, ndvi if available
  MONO  = {"canopy": -1, "canopyLag1": -1, "canopyLag3": -1}       # heat non-increasing in canopy
  mono  = [MONO.get(f, 0) for f in FEATS]
  params = dict(n_estimators=600, learning_rate=0.03, num_leaves=31, min_child_samples=30,
                subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=1.0,
                monotone_constraints=mono, monotone_constraints_method="advanced", verbose=-1)
  ```
- [ ] **Spatial cross-validation:** `GroupKFold(5)` with `groups = h3.cell_to_parent(h, 7)` (blocks about 5 km² each). Neighboring hexes are nearly identical, so random CV leaks information and inflates R².
  - Report R², RMSE and MAE for **random CV vs. spatial CV** vs. both baselines. Save to `stats.json.model`.
- [ ] **Small tuning pass:** try `num_leaves ∈ {15, 31, 63}` × `min_child_samples ∈ {20, 50}`, scored by spatial CV. Keep the best. Budget about 10 minutes.
- [ ] **Final fit** on all training rows. Predict `heatPred` for every hex and compute `heatResid = heat − heatPred`.
- [ ] **Save:** `model.txt` (LightGBM native) plus `web/public/data/heat_model.json` (`booster.dump_model()`, pruned to the tree structures) for the in-browser what-if (§5.6).
- [ ] **Log** training time and energy. Expect seconds and a tiny fraction of a Wh, which is a great footprint-panel number.

### 5.3 Model checks (must pass before using the curves)
- [ ] **Accuracy:** spatial-CV R² beats the linear baseline. About 0.5–0.8 is typical. If it's below the linear model, simplify: fewer features, more regularization.
- [ ] **Physical plausibility:** partial dependence of heat on `canopy` is monotone decreasing. Its slope per +10% canopy should fall roughly in the literature range (≈0.5–1.5°F air temperature). Save `pd_canopy.png` for the slides and store `pdFPer10pct`.
- [ ] **Residual map:** plot `heatResid` by hex. Large clustered residuals mean a missing driver, often water or elevation. Note them in the model card as known limits.
- [ ] **Sanity spot-checks:** the downtown/industrial hexes the model predicts hottest should match the observed hottest; leafy areas like Roland Park or Guilford should be predicted coolest.

### 5.4 `model/curves.py`: counterfactual cooling per crown unit (vectorized)
The curve is measured per **crown unit** (25 m² of new canopy), not per tree, so trees of different sizes share one curve: a small tree uses the next 1 entry of `gains`, a medium tree the next 2, a large tree the next 3. This keeps diminishing returns correct whatever mix of sizes lands in a hex, and it still works when the "avoid power lines" filter removes some sites.

Adding canopy to a hex also changes its neighbors' `canopyLag1`/`canopyLag3` features. The first version below changes only the hex's own `canopy`. The spillover step afterward adds the neighbor effect.
```python
AREA = h3.average_hexagon_area(10, unit="m^2")        # ≈15,047
base = model.predict(X)
cum = np.zeros((len(X), NMAX_UNITS))
for n in range(1, NMAX_UNITS + 1):                     # n = crown units added
    Xn = X.copy()
    Xn["canopy"] = np.minimum(X["canopy"] + n * CROWN_UNIT_M2 / AREA, 1.0)
    cum[:, n-1] = base - model.predict(Xn)             # cumulative °F cooling
cum = np.maximum.accumulate(np.clip(cum, 0, None), axis=1)
marg = np.diff(np.concatenate([np.zeros((len(X),1)), cum], axis=1), axis=1)
# enforce non-increasing marginals (diminishing returns): running min from the left
marg = np.minimum.accumulate(marg, axis=1)
units = sites.groupby("h3")["crown"].apply(lambda c: min(c.head(NMAX).sum(), NMAX_UNITS))
hexes["gains"] = [m[:int(units.get(h, 0))].round(4).tolist() for m, h in zip(marg, hexes["h3"])]
```
- [ ] **Watch for step functions.** Tree models are piecewise constant, so marginals may be mostly zero with occasional jumps. If more than half of the hexes with sites get all-zero gains, still use the model, but smooth its output:
  - **Fix A (preferred):** measure each hex's local sensitivity with a larger finite difference: `s_local = (pred(canopy) − pred(canopy + 0.10)) / 0.10`, °F per unit canopy, clipped ≥ 0. Then build a smooth concave curve `ΔT(n) = s_local × Δcanopy(n) × max(0, 1 − (canopy + Δcanopy(n)) / 0.6)`, with `Δcanopy(n) = n × CROWN_UNIT_M2 / AREA`. It stays model-driven and hex-specific, with diminishing returns built in.
  - **Fix B:** average the model over an ensemble of 5–10 LightGBM models trained with different seeds and subsamples. Averaging smooths the steps.
  - **Emergency only, if the heat data itself fails** (for example, a corrupt raster): use the literature slope, 0.8°C per +10% canopy, converted to °F (×1.8), capped at 40% canopy. Say so openly in the model card.
- [ ] **Spillover (do it once the basic curves work):** when hex h gains Δ canopy, raise `canopyLag1` of its 6 ring-1 neighbors by Δ/7 and `canopyLag3` of the ring-3 neighbors by Δ/37. Re-predict those neighbors too. Total cooling = own + Σ neighbor cooling, weighted by each neighbor's population in the optimizer.
  - To stay fast, compute the spillover once for n = NMAX_UNITS, then scale it linearly with n.
  - Weight neighbor cooling by each neighbor's `people` (residents plus exposure), not just `pop`.
  - Store it as `spill` (°F·people **per crown unit**). The optimizer multiplies it by the tree's `crown`.
- [ ] Hexes with `cap = 0` get no curve but keep `heatPred` and `shap`.

### 5.5 SHAP explanations
- [ ] `explainer = shap.TreeExplainer(model)`; compute `shap_values(X)` for all hexes (seconds).
- [ ] Per hex: top 3 features by |value| → `shap` field, e.g. `[["imperv", 2.1], ["canopy", 1.4], ["waterNear", -0.6]]`. Units are °F relative to the city average.
- [ ] Global: mean |SHAP| per feature → `stats.json.model.importance`, for the model-card bar chart. Also save a beeswarm PNG for the slides.
- [ ] Frontend label map: `imperv` → "Pavement & roofs", `canopy` → "Tree cover", `canopyLag3` → "Trees nearby", `waterNear` → "Near water", `road` → "Roads", `bldg` → "Buildings", and so on.

### 5.6 In-browser what-if (optional but impressive)
- [ ] `web/src/lib/heatModel.ts`: a roughly 40-line evaluator for the dumped LightGBM trees. Walk each tree from the root using `split_feature`/`threshold`/`left_child`/`right_child` and sum the leaf values. Test it against 20 Python predictions (they should match to about 1e-6).
- [ ] UI (neighborhood card, §7.2): a slider "What if this neighborhood had X% canopy?" re-predicts every hex in the neighborhood live and animates the temperature change. It runs on the user's CPU in microseconds with no server, which is also a good footprint story.

### 5.7 `model/validate.py`
- [ ] **Model card JSON** (`stats.json.model`):
  - target and date;
  - features;
  - number of training hexes;
  - random- vs. spatial-CV metrics and baselines;
  - `pdFPer10pct` alongside the literature range;
  - feature importance;
  - training energy;
  - known limitations: a single hot day; air temperature from a car traverse; no night-time model; LightGBM step-shaped curves; no humidity;
  - optimizer assumptions: crown sizes, the survival table (not calibrated to local data, see §4.5) and the exposure weight, all from `stats.json.assumptions`;
  - diminishing returns is a simplification: Ziter 2019 found cooling strengthens above ~40% canopy, but the greedy optimizer needs concave curves.
- [ ] **Backtest (optional):** needs 2013 canopy plus a second heat source, so it's usually skipped. Save a note on why it was skipped.
- [ ] **Sensitivity:** check the stability of the top-500 hex ranking (Spearman) under each change, and save the results to stats:
  - crown sizes scaled × 0.5 and × 1.5;
  - survival off (`surv = 1` everywhere) vs. the table;
  - `EXPO_W` = 0, 0.5 and 1.
- [ ] **Optional Landsat cross-check:** train the same model on summer LST. Compare the canopy partial-dependence slopes; surface slopes should be larger, as the literature notes they overstate air-temperature effects about 2×.

### 5.8 `export/stats.py` and `export/export_web.py`
- [ ] Neighborhood-level Pearson correlations for canopy, heat, income, poverty, POC, asthma, impervious and HOLC (HOLC numeric: A=1…D=4).
- [ ] OLS of heat on canopy at the neighborhood level → slope (°F per 10 points of canopy) and r².
- [ ] `byHolc` means. City KPIs.
- [ ] Tree benefit constants from research.md §3.
- [ ] Write all the JSON files to `web/public/data/`: round the numbers, drop the geometry from hexes (deck.gl uses the H3 ids), and print the file sizes.

**Checkpoint:**
- The `contract-checker` passes.
- Real data replaces the mock data on `main` (merge `feat/pipeline`).
- The spatial-CV R² is printed; about 0.5–0.8 is typical, and lower is still usable if you're honest about it.
- The partial-dependence slope is in the literature ballpark.

---

## 6. Frontend foundation

**Session A** (`main`).

### 6.1 Scaffold
```bash
npm create vite@latest web -- --template react-ts
```
```bash
cd web && npm i maplibre-gl react-map-gl @deck.gl/core @deck.gl/layers @deck.gl/geo-layers @deck.gl/mapbox h3-js zustand react-router-dom motion @observablehq/plot scrollama
```
```bash
npm i -D tailwindcss @tailwindcss/vite vitest @types/scrollama
```
```bash
npx shadcn@latest init
```
```bash
npx shadcn@latest add button card tabs slider switch select sheet tooltip hover-card badge collapsible toggle-group dialog scroll-area separator
```

### 6.2 Design system
- **Colors:** dark theme only. Near-black background (`#0b0f0e`) with glassy panels (`bg-white/5 backdrop-blur-md border-white/10`). Canopy green `#4ade80`, heat ramp yellow → orange → red, equity accent violet.
- **Fonts:** Inter for UI, and a display font such as "Space Grotesk" or "Fraunces" for big numbers and story headings (Google Fonts).
- **Motion:** 300–600 ms ease-out for panels, spring for counters. Respect `prefers-reduced-motion`.
- **Reusable components:**
  - `Panel` (glass card, collapsible);
  - `StatTile` (label, animated number, delta);
  - `AnimatedNumber` (motion `useSpring`);
  - `Legend` (continuous and bivariate 3×3);
  - `LoadingScreen` (animated sprouting logo while the JSON loads).

### 6.3 App shell
- [ ] `react-router`: `/` redirects to `/current`, plus `/plan` and `/learn`. The top nav shows the logo, three tabs with an animated underline (motion `layoutId`), and a "🌱 Footprint" badge button.
- [ ] **One persistent `<MapCanvas/>`** rendered behind all the routes. Each tab only changes the store's `layers` config and camera, so switching tabs **animates the camera** instead of reloading the map.
- [ ] `store.ts` (zustand):
  ```ts
  { data: {hexes, sites, nbs, holc, stats, species, footprint} | null,
    tab, hovered: {h3?: string, nb?: string}, selectedNb, selectedSite,
    current: {colorBy, heightBy, bivariate: null|'heat'|'income', layers: {...}},
    plan: {params, result, pareto, baselines, computing},
    story: {step}, chatOpen, chatPrefill }
  ```
- [ ] `lib/data.ts`: fetch all JSON in parallel (`Promise.all`) → build indexes (`hexById`, `sitesByHex`, `nbByName`) → `store.setData`.

### 6.4 `MapCanvas`
- [ ] `react-map-gl/maplibre` `<Map>` with the CARTO Dark Matter style `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`, `maxPitch=75`, initial view `{lng:-76.615, lat:39.30, zoom:11.3, pitch:50, bearing:-15}`.
- [ ] `DeckGLOverlay` via `useControl(() => new MapboxOverlay({interleaved: true}))`.
- [ ] On load, add the OpenFreeMap 3D building extrusion at zoom 14 and above. Code is in research.md §13.
- [ ] Layers come from `useLayers()`, which reads the store and returns an array depending on the tab.
- [ ] `flyTo(view)` helper exposed through the store, so tabs and the story can move the camera.
- [ ] **Performance:** set `updateTriggers` properly, and memoize data arrays.

**Done when:** tabs switch with the camera animating, mock hexes render in 3D, and the app holds about 60 fps.

---

## 7. Tab 1: Current State

Session A.

### 7.1 Map layers

**Real-Baltimore overlay requirements.** The data sits on a real, zoomable map of Baltimore and follows the city's shape.
- [ ] **Basemap:** CARTO Dark Matter (real streets, harbor, parks). deck.gl runs `interleaved`, and data layers use `beforeId` set to the first symbol/label layer, so street and place labels draw **above** the hexes.
- [ ] **City shape:** build the H3 grid from the official city boundary (dissolved neighborhoods). Drop hexes whose land-cover water fraction is above 0.5, so the harbor stays visible.
- [ ] **Outside-city mask:** a polygon of the whole view extent with the city boundary cut out as a hole, filled black at about 55% opacity. It dims Baltimore County so the city outline pops.
- [ ] **Neighborhood outlines:** a `GeoJsonLayer` of the 279 official neighborhoods, stroke only (1 px, white at 25% opacity). The hovered neighborhood gets a 2.5 px bright outline.
- [ ] **Neighborhood labels:** a `TextLayer` at each polygon's label point (`representative_point()` computed in Python), with official names. Show at zoom ≥ 12.5 with collision filtering (`CollisionFilterExtension`), and scale the font by zoom.
- [ ] **Readability:** hex opacity 0.6–0.75 so streets show through. A **2D/3D toggle**: 2D is flat and best for reading neighborhoods; 3D extrudes heat.
- [ ] **Zoom-dependent detail:** at zoom ≥ 15, fade the hexes and show individual live trees and empty pits as points, plus 3D buildings.
- [ ] **Search:** a combobox over the 279 names (local fuzzy match) that flies to the neighborhood's bounds. No external geocoder.
- [ ] **Satellite toggle:** an Esri World Imagery raster basemap, with attribution.
- [ ] **H3HexagonLayer** (`hex-current`):
  - `extruded: true`, `coverage: 0.9`;
  - elevation = `max(0, heatAnom) × scale` (height means hotter than the city median);
  - color = the `colorBy` ramp: canopy (brown → green), heat (yellow → red), income (reversed viridis) or asthma;
  - `transitions` for elevation and color (800 ms);
  - **rise-in on first load:** animate `elevationScale` from 0 to 1 over about 1.8 s.
- [ ] **Bivariate mode:** a `GeoJsonLayer` of neighborhoods filled with the Stevens palette by `bivHeat` or `bivIncome`. Hexes are hidden or flattened, and the color transitions when the pair changes.
- [ ] **Overlays** (toggles in the layers menu):
  - HOLC outlines (A `#76a865`, B `#7cb5bd`, C `#ffff00`, D `#d9838d`, standard colors), with a dashed line and a label at high zoom;
  - empty planting sites (`ScatterplotLayer`, small dots, visible at zoom 14 and above);
  - 3D buildings;
  - cooling centers (optional).
- [ ] **Hover:** a tooltip with hex canopy %, °F and neighborhood. The hover syncs `store.hovered`.
- [ ] **Click on a neighborhood:** `flyTo` its bounds (pitch 55) and open the `NeighborhoodCard`.

### 7.2 UI panels
- [ ] **Top-left control bar:** "Color by" segmented control (Canopy / Heat / Income / Asthma / Model), "Height = heat" switch, "Bivariate" select (off / canopy×heat / canopy×income), layers popover.
- [ ] **Legend,** bottom-left: continuous ramp, or the bivariate 3×3 grid rotated 45° with axis labels.
- [ ] **Right collapsible stats panel** (shadcn `Collapsible`, motion slide-in):
  1. **KPI row:** city canopy 28% vs. the 40% goal (progress ring), heat spread in °F, empty sites, number of neighborhoods under 20% canopy.
  2. **Linked scatter** (Observable Plot): one dot per neighborhood, canopy on x vs. heat on y, with `Plot.linearRegressionY` and an r² label. Hovering a dot sets `store.hovered.nb`, which highlights that neighborhood on the map, and the reverse. Clicking a dot flies there.
  3. **"Redlining's legacy":** grouped bars of mean canopy and heat by HOLC grade A–D.
  4. **Correlation heatmap:** a small 7×7 grid with values on hover and a one-line takeaway underneath.
  5. **Ranked lists:** the 10 hottest neighborhoods and the 10 with lowest canopy. Clicking one flies there.
- [ ] **`NeighborhoodCard`,** in a floating panel:
  - name; canopy % and gap to 40%; °F vs. the city median;
  - income, asthma, empty sites, HOLC share, city rank;
  - a "Plan trees here →" button that switches to Plan with this neighborhood pre-focused;
  - the ML section: predicted vs. measured °F, the top 3 SHAP drivers as bars ("Pavement & roofs +2.1°F"), and the **what-if canopy slider** (§5.6) that re-predicts the neighborhood live.
- [ ] **"Model" color mode:** a sub-toggle between predicted heat and residuals (diverging blue/red). It shows judges where the model is right and where it's wrong.
- [ ] **Model card,** a section in the stats panel or its own dialog, built from `stats.json.model`:
  - "How we predict heat" in 2 lines;
  - metrics tiles: spatial-CV R² vs. the linear baseline;
  - feature-importance bars;
  - partial-dependence line of heat vs. canopy, with the literature range shaded;
  - training energy ("trained in N s on a laptop, ≈X Wh");
  - the limitations list.

### 7.3 Stretch
- [ ] Time-lapse from 2013 to 2021: a play button lerps `canopy13 → canopy` with a big year ticker.
- [ ] Satellite swipe (Esri World Imagery vs. the canopy layer).

**Done when:** all four color modes and both bivariate modes work, the scatter-to-map linking works, and the stats show real numbers from `stats.json`.

---

## 8. Tab 2: Plan

The optimizer and its tests can be done by Session C, or by Session A after Current State.

### 8.1 Optimizer (`src/tabs/plan/optimizer.ts` + `optimizer.worker.ts`)
**How it works:** every candidate site gets a score of value per dollar. The optimizer repeatedly buys the best-scoring site that still fits the budget, then re-scores that hex's next site, which is worth less because of diminishing returns. It stops when the budget runs out. This "greedy" method is near-optimal when returns diminish, and it runs in milliseconds, so the map can update while a slider is being dragged. It uses only precomputed JSON; the heat model never runs in the browser during planning.

A site's **value** is the expected cooling it delivers to people, weighted by who those people are, plus a flat ecological credit:
- **cooling** = the next `crown` entries of the hex's `gains` (°F) × `people` in the hex, plus neighbor spillover;
- × **survival**: a tree that dies delivers nothing, so all benefits are multiplied by `surv`;
- × the **priority multiplier** from the sliders: `w.heat + w.equity × vulnEq + w.health × vulnHealth`;
- + **eco** = `w.eco` × the USFS per-tree benefit for the tree's size class × `surv`.

**What the "who benefits" sliders do** (put a short version of this in the UI's info popover and the pitch):
- **Yes, they move the trees.** The sliders change each hex's multiplier, which changes the ranking and so which sites get bought first. Heat alone ranks by cooling × people per dollar. Adding Equity boosts hexes in proportion to `vulnEq`, so a hot, poor block outranks an equally hot, wealthy one. Adding Health does the same with asthma and SVI.
- **Equity and Health scale cooling; they don't replace it.** A block where a tree cools nothing gets nothing from these sliders. That keeps every plan physically sensible: we never plant a tree that won't cool anyone just because the block scores high on need.
- **Only the ratios matter.** (1, 1, 0, 0) and (0.5, 0.5, 0, 0) give the same plan. With Heat and Equity both at 1, the most vulnerable hex (`vulnEq = 1`) is worth at most twice an otherwise identical hex with `vulnEq = 0`. Setting Heat to 0 makes need a hard filter: hexes with `vulnEq = 0` get only their eco value.
- **Eco pulls the other way.** It's a per-tree credit that ignores heat and people, so raising it favors cheap, large-crown, high-survival sites wherever they are, including less populated areas.
- **The effect is biggest at small and medium budgets.** At large budgets the top hexes fill up (diminishing returns plus limited sites), and plans with different weights converge on the same sites. The Pareto chart shows this trade-off directly.
- **Soft vs. hard:** the Equity slider is a preference that trades off against cooling. The equity guarantee slider (`equityQuota`) is a hard rule: at least X% of trees go to low-income blocks, whatever the cooling cost.

- [ ] `heap.ts`: a small binary max-heap.
- [ ] **Precompute on load:**
  - normalization constants: `maxHeatVal = max(gains[0] × people + spill)` per crown unit, and similarly for the other terms;
  - each hex's cost list, taken from its sorted sites after filters are applied.
- [ ] **Value of the k-th tree in hex h** (site `s = sitesByHex[h][k]`; `u[h]` = crown units already placed in h):
  ```ts
  const g = sum(h.gains.slice(u[h], u[h] + s.crown));                 // °F from this tree's crown units
  const cool = (g * h.people + h.spill * s.crown) / maxHeatVal;       // ML cooling incl. neighbor spillover
  const v = s.surv * (cool * (w.heat + w.equity * h.vulnEq + w.health * h.vulnHealth)
                      + w.eco * ECO_NORM[s.size]);                    // USFS benefit by size class
  const ratio = v / s.cost;
  ```
  If `u[h] + s.crown` runs past the end of `gains`, the missing entries count as 0.
- [ ] **Lazy greedy:** push `(h, k=0)` for every eligible hex. Pop the best; if it fits the remaining budget, take site `sitesByHex[h][k]`, add `s.crown` to `u[h]`, and push `(h, k+1)` if `k+1 < cap`. Continue until the heap is empty or the budget is spent. If a site doesn't fit, try the hex's next site before dropping the hex, since sites differ in cost.
- [ ] **Filters:** remove hexes in `excludeNbs`. When `avoidUtilities` is on, drop `util` sites, which reduces the hex's cap.
- [ ] **Equity quota:** if `equityQuota > 0`:
  - Pass 1 runs greedy over hexes with `vulnEq ≥ 0.5` only, with budget × quota.
  - Pass 2 runs over all hexes with the remaining budget, continuing each hex's k from pass 1.
- [ ] **Impact:**
  - trees, expected surviving trees (`Σ surv`) and dollars spent;
  - `coolingPersonF = Σ surv × g × people` (survival-weighted);
  - people exposed (`Σ people` over targeted hexes), alongside residents;
  - average °F cooling across targeted hexes;
  - residents in targeted hexes;
  - low-income share: benefit in `vulnEq ≥ 0.5` hexes divided by total benefit;
  - HOLC C/D share;
  - CO₂, stormwater and dollars from the per-tree USFS values for each tree's size class × `surv` × a maturity factor (0 years → 0.15, 10 → 0.5, 20 → 1.0 of the 20-year values).
- [ ] **`pareto()`:** 21 runs with quota from 0 to 1 at the current budget and weights.
- [ ] **`baselines()`:**
  - random eligible sites up to the budget (seeded RNG);
  - lowest canopy first;
  - highest Tree Equity Score gap first (if TES data exists).
- [ ] **Worker protocol:** `postMessage({type: "allocate"|"pareto"|"baselines", params})`. Tag each request with an incrementing id and ignore stale responses. Debounce slider changes by 100 ms.
- [ ] **Unit tests (vitest)** with a 5-hex fixture:
  - the budget is never exceeded;
  - no hex exceeds its cap;
  - greedy picks the higher-gain hex first;
  - a large tree uses 3 gain entries and a small tree 1 (crown-unit accounting);
  - lower `surv` lowers a site's rank; `surv = 1` everywhere reproduces the no-survival ranking;
  - with Heat = 1 only, raising a hex's `vulnEq` doesn't change the plan; with Equity > 0 it moves trees toward that hex;
  - scaling all weights by a constant gives an identical plan;
  - the quota is satisfied;
  - excluded neighborhoods get 0 trees;
  - results are deterministic;
  - runtime is under 50 ms on real data (log it).

### 8.2 Controls (left panel)
- [ ] **Budget input:** toggle between $ and number of trees.
  - Slider on a log scale, $25k–$10M; show both $ and the approximate tree count.
  - Quick chips: "$250k", "$1M", "City's yearly pace (~10k trees)".
- [ ] **Presets** (toggle group), each setting the weights with an animated slider move:
  - Max cooling (1, 0, 0, 0.1);
  - Equity first (0.4, 1, 0.3, 0.1);
  - Health (0.4, 0.3, 1, 0.1);
  - Balanced (0.6, 0.6, 0.6, 0.3).
- [ ] **Weight sliders:** Heat, Equity, Health, Eco co-benefits.
- [ ] **Equity guarantee slider:** "At least X% of trees in low-income blocks."
- [ ] **Exclusions:** neighborhood multi-select (combobox), "Avoid sites under power lines" switch, maturity horizon (0 / 10 / 20 yrs).

### 8.3 Map
- [ ] `hex-plan` layer: flat hexes, subtle heat coloring at 40% opacity. When a plan exists, color hexes by predicted cooling (a teal ramp) with a short transition.
- [ ] **Sites layer** (`ScatterplotLayer`, or `IconLayer` with a tree SVG):
  - selected sites **sprout**: radius animates from 0 with delay `min(rank × 3 ms, 1500 ms)`, driven by a `now` state updated with requestAnimationFrame for about 2 s after each result;
  - unselected sites are hidden, or shown as faint dots at high zoom.
- [ ] **Click a site** → popup with neighborhood, space type and width, suggested species and size, expected survival, cost, and a "Why here?" section:
  - SHAP bars for the hex;
  - the site's rank;
  - an **"Ask the AI to explain"** button that opens the chat with a prefilled question and the site's stats.

### 8.4 Impact panel (right)
- [ ] `StatTile`s with `AnimatedNumber`: trees (with "≈N expected to survive" underneath); $ spent; average −°F in targeted blocks; residents reached; people exposed outdoors; % of benefit to low-income blocks; % in HOLC C/D; CO₂ lb/yr; stormwater gal/yr; $ benefits/yr.
- [ ] **Pareto chart** (Observable Plot):
  - line of cooling vs. low-income share;
  - dot for the current plan, with a hollow dot for each baseline;
  - annotation along the lines of "the first X% of equity costs only Y% of cooling," computed from the curve.
- [ ] **Baselines table:** your plan vs. random vs. lowest canopy first, with cooling and equity share columns. The best value in each column is highlighted.
- [ ] **Export menu:**
  - CSV of selected sites (id, lat, lng, neighborhood, space, species, cost);
  - GeoJSON;
  - stretch: a printable neighborhood report (a print-CSS route `/report/:nb`).

### 8.5 Stretch
- [ ] Before/after toggle: canopy color by current vs. current + planned. Planned canopy per hex = canopy + trees × crown ÷ area.
- [ ] Draw an avoid polygon (terra-draw, or `@deck.gl-community/editable-layers`).
- [ ] "Robust picks" layer: run 20 perturbed-weight allocations and highlight sites chosen in at least 80% of them.

**Done when:**
- dragging the budget slider re-optimizes in under 100 ms and trees sprout;
- presets visibly reshuffle the picks;
- the Pareto chart and baselines update;
- the CSV downloads.

---

## 9. Tab 3: Learn (story, how to help, chat)

Session A for the story; Session C for the chat UI.

### 9.1 Scroll story (`src/tabs/learn/Story.tsx`)
- [ ] Layout: a full-height scroll column of step cards on the left (desktop) or overlaid at the bottom (mobile). The persistent map is the sticky background.
- [ ] `steps.ts`: an array of `{ id, kicker, title, body, camera, layers, overlay?: ReactNode }`.
- [ ] **Scrollama:** `onStepEnter` → `store.story.step = i` → `useLayers()` and `flyTo(camera)` react to it. Add progress dots on the right edge and a "Skip to how to help ↓" link.
- [ ] **Beats.** Numbers come from `stats.json` or live optimizer runs; never hardcode them.
  1. **Hook:** "August 29, 2018. 3 PM." Dark map; heat hexes rise; a big counter ticks up to "16°F", the spread across one city on one afternoon. Camera: city overview, pitch 50.
  2. **History:** "In 1937, federal maps drew red lines around Baltimore's Black neighborhoods." HOLC polygons fade in. Camera orbits slightly.
  3. **Echo:** "The same blocks are hottest today." The overlay shows HOLC D outlines together with heat hexes, and the `byHolc` bar chart grows in a card.
  4. **Canopy gap:** color switches to canopy (brown → green), and the D-graded areas are visibly bare. Counter: canopy in A vs. D neighborhoods.
  5. **Human cost:** asthma and poverty stat tiles for the hottest 10 vs. coolest 10 neighborhoods. Camera flies to the hottest neighborhood at street level with 3D buildings.
  6. **The gap:** a progress bar from 28% to the 40% goal by 2037. It shows about 10k trees planted a year vs. about 25k needed.
  7. **The turn:** "Same 1,000 trees. Where they go matters."
     - Run the optimizer twice in the worker: `baselines().random` and `allocate({budget = 1000 trees, preset Balanced})`.
     - Show random sites in orange first, then transition them to optimized green sites.
     - Two comparison cards with animated numbers: cooling, residents, and share in low-income areas.
  8. **Vision:** trees sprout citywide at "10 years at 25k trees/yr" (a big-budget allocation); hexes sink and turn green; the temperature counter drops.
  9. **Call to action:** "You can help." Button → How to help, which scrolls to the next section.
- [ ] Story text: short, at most about 35 words per step. Cite the source in small text on each card.

### 9.2 How to help (`TakeAction.tsx`)
- [ ] **"Find a spot near you":** a neighborhood select, plus a "Use my location" button (browser geolocation, processed only in the browser).
  - Show the 5 nearest empty sites on a mini map (or fly the main map there) with their species suggestions.
  - Button: "Request a free street tree" → https://www.treebaltimore.org/street-tree-request-form
- [ ] **Action cards** (icon, one line, button). **Verify each URL during the build:**
  - Get a free tree: https://www.treebaltimore.org/tree-order
  - Volunteer: Baltimore Tree Trust https://www.baltimoretreetrust.org/get-involved/volunteer/ ; Blue Water Baltimore https://bluewaterbaltimore.org/volunteer-opportunities-baltimore/ ; Parks & People https://parksandpeople.org/volunteer
  - Donate: each organization's donate page. Find and verify them; don't guess the URLs.
  - Events: https://www.treebaltimore.org/treeevents
  - Become a Tree Keeper: TreeBaltimore programs https://www.treebaltimore.org/programs
- [ ] **Share button:** copy the link, pre-filled with the user's neighborhood stats.

### 9.3 Chat drawer (`ChatDrawer.tsx`)
- [ ] A floating round button, bottom-right, visible on Learn and when triggered from Plan: a leaf icon with a pulse on first view. It opens a shadcn `Sheet` from the right.
- [ ] **Header:** "Canopy Guide," a mode badge ("Server · Toronto" / "Your laptop" / "On your device"), and a ⓘ popover explaining the footprint and caveats.
- [ ] **Empty state:** 4 suggested-question chips, which the backend answers from cache:
  - "Why do trees cool streets?"
  - "Why is my neighborhood hotter?"
  - "Which tree fits a narrow sidewalk?"
  - "How can I help?"
- [ ] **Messages:**
  - stream tokens;
  - render `[n]` citations as superscript links;
  - show source cards under each answer;
  - show a **footprint badge** per answer: "≈0.02 Wh · measured" or "estimated".
- [ ] `lib/llm.ts`: the provider switch.
  ```ts
  const p = new URLSearchParams(location.search);
  export const LLM_URL = (location.hostname === "localhost" || p.get("llm") === "local")
    ? "http://localhost:8000/api/chat" : `${import.meta.env.VITE_API_URL}/api/chat`;
  ```
  Parse the stream with a `ReadableStream` reader, splitting on newlines and parsing each line as JSON.
- [ ] **Errors:** if the server fails, show "The guide is offline. Try 'Run on my device'" plus a retry button.
- [ ] **Stretch: on-device mode.**
  - A "Run on my device" toggle that lazily `import()`s `@mlc-ai/web-llm` and loads `Qwen3.5-0.8B-q4f16_1-MLC` (or 2B) in a worker. Show a progress bar and a download-size warning with the break-even note.
  - Retrieval in on-device mode: ship `corpus_chunks.json` (text only) and do keyword search in the browser (Orama BM25). No embedding model is needed.

**Done when:** the story scrolls smoothly through all beats with live numbers, the How-to-help links are verified, and the chat streams cited answers from local Ollama.

---

## 10. Backend (FastAPI, Ollama, retrieval)

**Session C** (`feat/backend` worktree).

`requirements.txt`: fastapi, uvicorn[standard], httpx, numpy, rapidfuzz, slowapi, pyyaml, and `zeus-apple-silicon` (Mac only, optional).

### 10.1 Corpus (`backend/corpus/*.md` + `build_corpus.py`)
- [ ] Write about 25–60 short markdown files. Paraphrase and summarize sources; don't copy whole pages. Each file starts with front-matter:
  ```yaml
  ---
  title: "Baltimore's canopy goal"
  url: https://www.baltimorecity.gov/bcrp/forestry/treebaltimore/canopy
  source: TreeBaltimore
  ---
  ```
  Topics:
  - canopy goal and history;
  - heat science (Ziter, Zaerpour);
  - redlining and heat (Hoffman);
  - income and canopy (McDonald);
  - tree benefits (USFS NE guide);
  - Baltimore urban forest facts (NRS-139);
  - how to request trees and volunteer;
  - native species;
  - tree care;
  - green gentrification and resident concerns;
  - how this app works;
  - AI footprint numbers.
- [ ] `build_corpus.py`:
  - chunk to about 300–400 words;
  - embed with Ollama `embeddinggemma` (`POST /api/embed`), using the query and document prefixes;
  - save `data/corpus_index.npz` (vectors, normalized) and `data/chunks.json` (text, title, url);
  - also export `web/public/data/corpus_chunks.json` for on-device mode.

### 10.2 `rag.py`
- [ ] `retrieve(q, k=4)`: embed the query, take cosine similarity against the index, and add a keyword boost when chunk titles or text contain query terms. Return the top k with a similarity threshold.

### 10.3 `router.py` + `tools.py`: deterministic, no LLM tool calling
- [ ] **Neighborhood detection:** `rapidfuzz.process.extractOne` of the question against the 279 neighborhood names (score ≥ 85).
  - On a hit, `tools.neighborhood_stats(name)` returns a compact fact block (canopy, gap, °F vs. median, income, asthma, sites, rank). The facts come from a copy of `neighborhoods.geojson` properties.
- [ ] **Site explanation:** when the frontend sends `context.site` (from the Plan popup), include the site facts, SHAP and rank.
- [ ] **Species:** keyword triggers ("narrow", "power line", "sidewalk", "species") → `tools.recommend_species(...)` from `species.json`.
- [ ] Build the context: facts blocks, then numbered source chunks.

### 10.4 `llm.py` + `main.py`
- [ ] **System prompt:**
  > You are Canopy Guide, an educator for a Baltimore tree-planting app. Use ONLY the FACTS and numbered SOURCES provided. Cite sources like [1]. If they don't cover the question, say you don't know and suggest a source. Max 120 words. Warm, plain language.
  Include one worked example Q&A in the prompt to show the citation format.
- [ ] **Ollama call:** `POST {OLLAMA_URL}/api/chat` with:
  - `model=qwen3.5:2b` (env `MODEL`), `stream=true`, `think=false`;
  - `options={"num_predict": 300, "temperature": 0.3}`;
  - `keep_alive="30m"`.
- [ ] **`/api/chat`:** validate the input (≤ 2,000 chars, ≤ 10 messages) → check the cache for exact suggested questions → route and retrieve → emit a `sources` event → stream `token` events → emit `done` with the token count and energy.
- [ ] **`energy.py`:**
  - On a Mac with zeus available, wrap the generation in an energy window and report `measured: true`.
  - Otherwise, `energyWh = tokens × J_PER_TOKEN / 3600` with `measured: false`. Calibrate `J_PER_TOKEN` once on the Mac, and note that droplet values are estimates.
- [ ] **`cached_answers.json`:** generate once with a script, reviewing each answer by hand. Serve cached answers instantly with `cached: true` and an energy of 0 beyond the one-time generation cost.
- [ ] **Middleware and endpoints:**
  - CORS allowing `http://localhost:5173` and `https://<domain>`;
  - `slowapi` limit of 10/min per IP;
  - `GET /api/health` returns `{model, provider, region}`.
- [ ] **Config from env:** `OLLAMA_URL`, `MODEL`, `REGION_LABEL`, `ALLOWED_ORIGINS`.

**Done when:**
- `curl -N -X POST localhost:8000/api/chat -d '{"messages":[{"role":"user","content":"Why is Broadway East hot?"}]}' -H 'content-type: application/json'` streams a cited answer that includes neighborhood facts;
- the frontend drawer works against it.

---

## 11. Footprint and evaluation panels

Session A, around the middle to late stage. **This is key for both tracks.**

### 11.1 Footprint dialog
Opened from the nav badge.
- [ ] **"What this app costs the planet":**
  - pipeline and training kWh and gCO₂ (CodeCarbon, from `footprint.json`);
  - one optimizer run (about 50 ms of CPU → microwatt-hours, estimated);
  - a chat answer (live, from the last `done` event);
  - hosting (static CDN plus one small droplet in Toronto, shut down after judging).
- [ ] **Comparison table,** with sources:
  - Google Gemini median prompt: 0.24 Wh / 0.26 mL;
  - Epoch AI GPT-4o: ~0.3 Wh;
  - ours: small local model, ~0.01–0.05 Wh.
- [ ] **Download break-even calculator** for on-device mode: model size × network energy per GB (a range) ÷ energy per answer → break-even number of questions.
- [ ] **"Where we chose not to use AI":** the optimizer is plain math; the stats are precomputed; answers are cached.
- [ ] **Honest caveats:** laptop idle power, hardware manufacturing, estimates vs. measurements, and that building the app used cloud AI coding tools (state the estimated amount).
- [ ] **Offset framing:** "One street tree absorbs about X lb CO₂/yr. That offsets our entire training run in about Y minutes."

### 11.2 "Impact & Evaluation" section
A tab inside the Plan panel, or a dialog.
- [ ] **Impact metrics table:** metric, data source, cadence. Taken from research.md §7.
- [ ] **Model validation:**
  - spatial-CV R² vs. random-CV R²;
  - partial-dependence °F per 10% canopy vs. the literature range;
  - baseline comparison;
  - crown-size sensitivity.
- [ ] **Pilot plan:** 100 wells in 2–3 neighborhoods with a partner organization; measure survival, heat-sensor data and engagement against business-as-usual siting.
- [ ] **Risks:** green gentrification, resident consent (tree refusals), maintenance burden, data limits (a single heat day; air vs. surface temperature).

---

## 12. Deployment

### 12.1 Frontend: DigitalOcean App Platform (hour 0)
- [ ] Push `main` to GitHub. In DO: **Create App** → GitHub repo → **Static Site**:
  - source directory `web`;
  - build command `npm ci && npm run build`;
  - output directory `dist`.
- [ ] Set the **catch-all document** to `index.html` so SPA routes like `/plan` work on refresh.
- [ ] Env var `VITE_API_URL=https://api.<domain>`, set at build time.
- [ ] Auto-deploy on push to `main`: on by default. Watch the first build succeed.

### 12.2 Domain (hour 0–2)
- [ ] Register the domain with GoDaddy Registry (MLH promo).
- [ ] In App Platform → Settings → Domains, add `<domain>` and `www`, then follow DO's DNS instructions: either add the CNAME/A records in GoDaddy, or delegate nameservers to DO.
- [ ] DNS propagation can take a while, so do this early.

### 12.3 Backend: droplet in TOR1 (mid-hackathon, once chat works locally)
- [ ] Create a droplet: Ubuntu 24.04, 8 GB RAM / 4 vCPU (CPU-Optimized if the credits allow), TOR1, SSH key.
- [ ] `deploy/setup_droplet.sh`, run as root:
  1. `apt update && apt install -y python3-venv git caddy ufw`
  2. `curl -fsSL https://ollama.com/install.sh | sh`
  3. `ollama pull qwen3.5:2b && ollama pull embeddinggemma`
  4. Set `OLLAMA_KEEP_ALIVE=30m` via `systemctl edit ollama` (an `Environment=` line). Ollama stays bound to 127.0.0.1.
  5. `git clone` the repo to `/opt/app`, create a venv, run `pip install -r backend/requirements.txt`.
  6. Install `deploy/api.service`:
     ```ini
     [Service]
     WorkingDirectory=/opt/app/backend
     Environment=OLLAMA_URL=http://127.0.0.1:11434 MODEL=qwen3.5:2b REGION_LABEL=Toronto ALLOWED_ORIGINS=https://<domain>
     ExecStart=/opt/app/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
     Restart=always
     ```
  7. Put `deploy/Caddyfile` at `/etc/caddy/Caddyfile`:
     ```
     api.<domain> {
         reverse_proxy 127.0.0.1:8000
     }
     ```
     Then `systemctl reload caddy`.
  8. `ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable`
- [ ] GoDaddy DNS: add an A record pointing `api` to the droplet IP.
- [ ] Test: `curl https://api.<domain>/api/health`, then chat from the public site.
- [ ] **Updating later:** `ssh` in, then `cd /opt/app && git pull && systemctl restart api`.
- [ ] **After judging:** snapshot and destroy the droplet, then switch the site to on-device-only or hide the chat.

### 12.4 Demo-mode checklist
- [ ] Laptop: `ollama serve` is running, and `uvicorn main:app --port 8000` is running with CORS allowing the production domain.
- [ ] Open `https://<domain>/?llm=local`. Accept Chrome's local-network-access prompt during rehearsal.
- [ ] Pre-cache the on-device model on the demo browser profile (if built).
- [ ] Fallback: drop `?llm=local` to use the droplet. Final fallback: a recorded video.

---

## 13. Testing and verification

- [ ] **Pipeline:** assertion checks at the end of each build script:
  - counts: hexes 12–18k, sites 55–70k, neighborhoods 279;
  - ranges: canopy 0–1, heat 75–105;
  - no NaN in required fields.
  - Run the `geo-validator` and `contract-checker` agents after each export.
- [ ] **Optimizer:** the vitest suite (§8.1), plus a runtime check on real data.
- [ ] **Backend:** `pytest` smoke tests:
  - the router detects "Sandtown-Winchester";
  - retrieval returns relevant chunks;
  - `/api/chat` streams valid NDJSON (mock Ollama with a stub).
- [ ] **UI:** at each milestone, run the dev server and click through every tab in the browser pane. Check the console for errors and watch the frame rate while panning in 3D.
- [ ] **Performance budget:**
  - initial data under 5 MB gzipped;
  - first render under 3 s on venue Wi-Fi;
  - optimizer under 50 ms;
  - no dropped frames during sprouting with 5k sites (above about 10k selected, skip the stagger animation).
- [ ] **Cross-check the numbers** in the story and the pitch against `stats.json`. Nothing hardcoded.

---

## 14. Timeline and sessions

Sessions:
- **A:** `main`, frontend.
- **B:** `feat/pipeline`, data and ML.
- **C:** `feat/backend`, backend plus the optimizer tests, the corpus and one-off tasks.

Hours are for a 24 h build. For 36 h, stretch the middle.

| Hours | Session A (frontend) | Session B (pipeline) | Session C (backend/other) | Merge |
|---|---|---|---|---|
| 0–1 | Repo, CLAUDE.md, contracts, mock data, scaffold, deploy "hello map", domain | Fetch helper; start the tree inventory download | — | — |
| 1–4 | Design system, app shell, persistent map, loading | Fetch everything; build the H3 grid | Optimizer + vitest (in the `web/src/tabs/plan` folder only) | Optimizer → main |
| 4–8 | Current State: hex layer, color modes, tooltip, neighborhood card | Features, social join, neighborhood summary; **first real export** | Corpus writing, `build_corpus.py`, retrieval | **Real data → main (H8)** |
| 8–12 | Plan: controls, worker wiring, sprouting, impact tiles | **ML heat model**: baselines, LightGBM + spatial CV, plausibility checks, curves, SHAP; export v2 | FastAPI chat, router, streaming; test with curl | Curves → main; backend → main |
| 12–16 | Pareto, baselines, site popup, export; stats panel charts; **model card + Model color mode** | Validation, stats.json, PD plot; CodeCarbon → footprint.json | Chat drawer UI against the local backend; cached answers | Merge all |
| 16–19 | Scroll story, all 9 beats; what-if slider (`heatModel.ts`) | Spillover, model card JSON, sensitivity; fix data issues | **Droplet deploy**; How-to-help page | Merge all |
| 19–21 | Footprint + evaluation panels; polish, motion, empty states | — | Stretch: on-device mode, or time-lapse | **Feature freeze at H21** |
| 21–23 | Bug bash, cross-check numbers, performance | — | Slides, Devpost write-up, demo video | — |
| 23–24 | Rehearse the demo ×3; submit | | | |

Merge routine at every milestone:
1. In the branch session: commit.
2. In session A: "merge `<branch>` into main, run the build and tests."
3. In the branch session: sync with main.

---

## 15. Scope cuts (in order)

Cut from the top of this list first if you fall behind:
1. On-device (WebLLM) chat mode.
2. Time-lapse and satellite swipe.
3. Drawing avoid polygons; robust picks.
4. Printable neighborhood report.
5. Heat-model extras: spillover, what-if slider, Landsat cross-check, tuning pass. Keep the core model, spatial CV, curves and SHAP.
6. Droplet → demo on laptop only (`?llm=local`). Hide the chat on the public site, or show a "demo only" note.
7. Story beats 5 and 8 (keep the hook, redlining, the turn and the call to action).

**Never cut:** the ML heat model (train, spatial CV, counterfactual curves, SHAP, model card), Current State map, Plan slider with sprouting and impact numbers, story beat 7 ("The turn"), footprint panel, evaluation plan slide.

---

## 16. Demo script (2 minutes)

1. **(0:00)** Current State, auto-orbiting 3D heat hexes. "In Baltimore, on one afternoon, it was 16°F hotter in some blocks than others."
2. **(0:15)** Toggle the HOLC overlay and the bivariate view. "The hottest blocks are the ones redlined in 1937, and they have the least canopy." Hover the scatter to highlight a neighborhood.
3. **(0:35)** Plan tab. Drag the budget to $1M and trees sprout. "Each dot is a real empty tree pit from the city's inventory."
4. **(0:50)** Switch the preset to Equity first; the picks reshuffle. Point to the Pareto chart: "Prioritizing equity costs almost no cooling."
5. **(1:05)** Click a site → "Why here?" The ML heat model predicts this block cools 0.4°F per tree, and the SHAP bars show pavement is driving the heat → → "Ask the AI." The chat answers with citations, and the footprint badge shows "0.02 Wh, measured on this laptop."
6. **(1:25)** Learn tab: scroll quickly to "The turn." "Same 1,000 trees: random vs. strategic."
7. **(1:40)** Footprint dialog. "We measured our AI's cost, used a model about 100× smaller than a chatbot's, and chose not to use AI where math works."
8. **(1:50)** Evaluation plan. "Here's how we'd measure impact with TreeBaltimore: canopy, heat sensors, tree survival, equity share."

---

## 17. Submission checklist
- [ ] Public URL live; the domain resolves; the `/plan` and `/learn` routes survive a refresh.
- [ ] README: what it is, screenshots, architecture diagram, how to run locally, data sources with licenses and attribution, AI-use disclosure, footprint numbers, limitations.
- [ ] Map attributions: CARTO, OpenStreetMap, OpenFreeMap, Esri (if used), NOAA, Chesapeake Conservancy, Census, CDC, Mapping Inequality.
- [ ] Devpost: tracks selected (Environmental + Community Impact) and sponsor prizes (DigitalOcean, GoDaddy domain, Tiger Data if used).
- [ ] Demo video recorded as a backup.
- [ ] Droplet shutdown scheduled after judging.
