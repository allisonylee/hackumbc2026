# Data contracts

Source of truth for the files in `web/public/data/` and the chat API. Copied from `planning/implementation_plan.md` §3.
**Change this file only on `main`**, and update the mock generator (`pipeline/mock/make_mock.py`) in the same commit.

Until the real pipeline lands, `web/public/data/` holds mock data from `python -m pipeline.mock.make_mock` (2,000 hexes, 3,000 sites; real neighborhood and HOLC polygons with synthetic values; `stats.json` has `mock: true`).

Keep keys short but readable. Round coordinates to 5 decimals and floats to 3.

## `hexes.json`: array, one object per H3 res-10 cell (~14–16k)
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
  vulnEq: number;          // 0–1 equity score (poverty/income/poc composite)
  vulnHealth: number;      // 0–1 health score (asthma/svi composite)
  flood: boolean;          // intersects FEMA floodplain (optional)
  cap: number;             // # candidate sites used (≤ NMAX)
  gains: number[];         // length cap; marginal °F cooling of the 1st..cap-th tree, non-increasing, ≥0
  shap: [string, number][];// top 3 [feature, contribution °F]
};
```

## `sites.json`: array (~60k after filtering)
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
};
```
Within each hex, sites are **sorted cheapest first**. The optimizer uses the k-th site for the k-th tree.

## `neighborhoods.geojson`: 279 features, simplified (mapshaper 8%)
Properties:
- `name`, `canopy`, `heat`, `income`, `pop`, `asthma`, `poverty`, `sites`, `tes` (optional), `rankHeat`, `rankCanopy`;
- `bivHeat` and `bivIncome`: 0–8 bivariate class index, computed in Python;
- `canopyGap` = max(0, 0.40 − canopy).

## `holc.geojson`
60 Baltimore polygons, property `grade`.

## `stats.json`
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
  treeBenefits: { small: {...}, medium: {...}, large: {...} } // USFS NE guide values
}
```

## `heat_model.json`
LightGBM `dump_model()` output, pruned to `feature_names` plus `tree_info[].tree_structure`. Used by the in-browser what-if (§5.6). Target size under ~1–2 MB. If it's larger, reduce `n_estimators` or `num_leaves` for the exported copy.

## `species.json`
```ts
[{ name, latin, size: "small"|"medium"|"large", underWires: boolean,
   minWidthFt, native: boolean, notes }]
```

## `footprint.json`
```ts
{ pipelineKWh, pipelineGCO2, trainKWh, trainGCO2, region, measuredAt,
  devAiNote: string, cloudRefs: [{ name, wh, ml, source }] }
```

## Optimizer interface (TS, Web Worker)
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
  impact: { trees, spent, coolingPersonF, avgFTargeted, residents, shareLowIncome,
            shareHolcCD, co2LbYr, stormGalYr, benefitUsdYr };
};
allocate(p: Params): Result
pareto(p: Params, steps = 21): { quota, cooling, shareLowIncome }[]
baselines(p: Params): { random: Result['impact'], lowestCanopy: ..., tes?: ... }
```

## Chat API
`POST /api/chat`
Request: `{ messages: [{role, content}], mode?: "learn" }`
Response: NDJSON stream, one JSON object per line:
```
{"type":"sources","items":[{"n":1,"title":"...","url":"..."}]}
{"type":"token","text":"Trees "}
...
{"type":"done","tokens":212,"energyWh":0.021,"measured":true,"cached":false}
```
