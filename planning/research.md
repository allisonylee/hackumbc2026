# Baltimore Tree Planting Planner — Research & Recommendations
_Compiled 2026-09-25. Dataset endpoints were queried live on that date._

---

## 0. TL;DR

- **Concept is strong and fits both tracks**, but as written it leans "Environmental". To win **Community Impact** you must add: (1) a *measurable impact + evaluation plan*, (2) evidence of *Baltimore-specific need* (redlining → heat → canopy story), and (3) outputs real stakeholders can act on (TreeBaltimore, Baltimore Tree Trust, community associations).
- **Killer data find:** Baltimore Forestry's live tree inventory has **~66k real empty planting sites** ("Vacant Site" 44,781 + "Vacant Potential" 21,541). Snap recommendations to *actual tree pits*, not abstract hexes.
- **Plan model:** No LLM. LightGBM heat model (predict temperature from canopy/impervious/etc.) → counterfactual "cooling per tree" per cell → **greedy budget optimizer running in the browser** (<50 ms, sliders feel instant) → Pareto curve of cooling vs. equity.
- **Learn chatbot:** runs **in the browser** via WebLLM (Qwen3.5-2B) + local RAG over curated Baltimore sources with citations. Skip LangGraph.
- **Environmental-cost honesty:** show a live "footprint" badge (Wh / mL water per answer, per optimization) vs. cloud LLM figures, with caveats. The Environmental track explicitly asks you to acknowledge AI's costs.
- **Stack:** Vite + React + TS, Tailwind + shadcn/ui, Framer Motion, MapLibre + deck.gl (3D H3 hexes, dark CARTO basemap), Observable Plot, Scrollama. Python (GeoPandas, h3, rasterstats, LightGBM, SHAP) offline only. Static deploy on DigitalOcean + GoDaddy domain.

---

## 1. Track fit analysis

### Environmental ("Best Environmental Idea", ETF)
| Rubric phrase | How you satisfy it |
|---|---|
| "reduces environmental harm or strengthens ecological resilience" | Trees → heat reduction, stormwater, air quality, carbon; quantify with i-Tree/USFS coefficients |
| "critically and creatively applying AI" | ML heat model used *counterfactually* + optimizer + SHAP explanations; in-browser LLM with RAG |
| "responsibly, ethically, sustainably" | Local/in-browser models, no data sent to cloud, equity constraints, transparent weights |
| "put Earth/climate/local habitats first" | Native species recommender; ecological co-benefits (stormwater near Jones Falls/Gwynns Falls, floodplains) |
| **"acknowledging the real environmental costs of AI systems"** | **Footprint dashboard**: CodeCarbon for training, zeus-apple-silicon for local inference, per-answer Wh/mL badge, comparison to Gemini/ChatGPT per-query figures, honest caveats (embodied carbon, local ≠ free). Include a "when NOT to use AI" note (e.g. optimizer is plain math, not an LLM). |

### Community Impact ("Community Impact and Social Innovation", STARS)
| Rubric phrase | How you satisfy it |
|---|---|
| "clear understanding of the needs of the Baltimore community" | Tell the *Baltimore story*: 1937 HOLC redlining → today's hottest neighborhoods (16°F spread in 2018 NOAA heat campaign) → lowest canopy → asthma (CDC PLACES). Cite Baltimore's 40%-by-2037 canopy goal (currently ~28%). Name real neighborhoods (e.g. McElderry Park, Broadway East, Sandtown-Winchester). |
| "meaningful, measurable impact" | Every plan outputs numbers: trees, °F reduced, residents reached, % of benefit to low-income/formerly-redlined blocks, gallons of stormwater, CO₂, $. |
| **"realistic plan for evaluating that impact"** | **Add an "Impact & Evaluation" section/tab** (see §7). This is the part most teams skip. |
| "genuine community challenge" | Baltimore plants ~10k trees/yr vs ~25k/yr needed for goal (Howard Center 2019); planners have ~66k empty pits and limited $. Your tool answers "which pits first?" |

> ⚠️ Check hackUMBC rules on whether one project can be submitted to both tracks (usually yes). Tailor the pitch per judge panel: lead with AI-responsibility for ETF, lead with community need/evaluation for STARS.

---

## 2. Data sources (verified)

**ArcGIS tip:** append `/query?where=1=1&outFields=*&outSR=4326&f=geojson` to any REST layer. Page with `resultOffset`/`resultRecordCount` (2000 cap).

### Top 8 must-use
1. **Forestry street tree inventory** — `https://baltegis.baltimorecity.gov/mapping/rest/services/Forestry/Trees/MapServer/0` — 193k points, live. `SPP` field: "Vacant Site" 44,781; "Vacant Potential" 21,541; "Vacant Site Not Suitable" 3,834; "Stump" 9,112; ~115k live trees. Fields: `SPACE_TYPE`, `SPACEWIDTH`, `UTILITIES`, `Neighborhood`, `CONDITION`, `DBH`, `PLANTING_POTENTIAL`, `PRIORITY`.
   Example: `.../query?where=SPP IN ('Vacant Site','Vacant Potential')&outFields=SPP,SPACE_TYPE,SPACEWIDTH,UTILITIES,Neighborhood&outSR=4326&f=geojson`
2. **Chesapeake Bay Program 1 m land cover, Baltimore City** — https://www.sciencebase.gov/catalog/item/68011bd8d4be0263cab0ff37 (2013, 2018, 2021/22; ~37 MB GeoTIFF/yr). Change rasters: https://www.sciencebase.gov/catalog/item/68011c83d4be0263cab101c8 . Canopy %, impervious %, canopy change.
3. **NOAA/CAPA Heat Watch 2018-08-29** (air temp, ~10 m, °F) — `https://gis.nnvl.noaa.gov/arcgis/rest/services/HINDZ/Afternoon_Air_Temperature_in_Cities/ImageServer` (also Morning_/Evening_). Export:
   `.../exportImage?bbox=-76.72,39.19,-76.52,39.38&bboxSR=4326&size=2000,1900&format=tiff&pixelType=F32&mosaicRule={"mosaicMethod":"esriMosaicLockRaster","lockRasterIds":[2]}&f=image`
4. **Tree Equity Score block groups** — official download https://www.treeequityscore.org/methodology?tab=data-download (618 Baltimore block groups; includes canopy goal/gap, priority index, `holc_grade`). Great baseline to compare against.
5. **Census ACS 2020–2024** (B19013 income, B17001 poverty, B03002 race) — `https://api.census.gov/data/2024/acs/acs5?get=NAME,B19013_001E&for=tract:*&in=state:24&in=county:510&key=KEY` (**key now required**, free).
6. **Neighborhoods (279)** — `https://baltegis.baltimorecity.gov/server/rest/services/CityView/Neighborhoods/FeatureServer/0` (has 2020 pop). **CSAs (56)** + **BNIA Vital Signs** — https://vital-signs-bniajfi.hub.arcgis.com/
7. **HOLC redlining** — https://dsl.richmond.edu/panorama/redlining/static/mappinginequality.json (filter `city=='Baltimore'`, 60 polygons).
8. **Health vulnerability** — CDC PLACES `https://data.cdc.gov/resource/cwsq-ngmh.json?countyfips=24510&measureid=CASTHMA`; CDC SVI 2022 `https://onemap.cdc.gov/onemapservices/rest/services/SVI/CDC_ATSDR_Social_Vulnerability_Index_2022_USA/FeatureServer/8` (`where=STCNTY='24510'`).

### Secondary
- Landsat 8/9 LST (Earth Engine `LANDSAT/LC09_C02_T1_L2`, `ST_B10`, K = DN×0.00341802+149.0; June–Aug median) — summer-wide *surface* temp.
- TPL heat severity ImageServer `https://server4.tplgis.org/arcgis4/rest/services/NATIONAL/uhi_city_severity_2019/ImageServer`.
- NLCD tree canopy 30 m (fallback).
- Parcels, vacant building notices, Adopt-A-Lot lots (`.../Housing/DHCD_Open_Baltimore_Datasets/FeatureServer/1` and `/6`).
- Parks 2023 (`bcrpParks2023`, has `perTreeCover18`), FEMA floodplain, 311 (no "tree planting" type), cooling centers (`Code_Red_Cooling_Center_New`), PurpleAir, EJScreen mirror (https://screening-tools.com/epa-ejscreen — EPA took original down Feb 2025).
- Howard Center "Code Red" (2019) cleaned neighborhood canopy/heat/demographics: https://howard-center-investigations.github.io/code-red-baltimore-climate-divide/ — huge time saver.
- Baltimore UHI sensors (time series): https://www.baltimoresustainability.org/urban-heat-island-sensors/

### Gotchas
- CRS: city layers in MD State Plane ft (EPSG:2248/2893); Chesapeake rasters in Albers. Always `outSR=4326` for web; reproject polygons to raster CRS for zonal stats.
- **Pre-fetch data into static files early** (tree inventory = ~97 paged requests).
- Heat Watch = one afternoon → relative heat. LST = ground temp, overstates air-temp UHI ~2×.
- Geography mismatch: tracts (199) vs neighborhoods (279) vs CSAs (56) → area-weighted interpolation (`tobler` library) or just aggregate everything to H3.
- Some sites 403 to scripts but work in browser.

---

## 3. Key numbers to cite

**Baltimore context**
- Canopy ~27% (2007) → ~28% (2015, 2021/22). Goal **40% by 2037**.
- 2018 Heat Watch: **16°F** spread across city on one afternoon.
- Howard Center 2019: need ~25k trees/yr; city planting ~10k/yr.
- Cost: ~**$1,000** per tree at an existing pit (planting + 2 yr care); ~**$2,000** if concrete must be cut (Baltimore Tree Trust via WYPR, 2026-09-24). Old USFS guide used $300.
- Baltimore urban forest (USFS NRS-RB-139, 2025): 1.9M trees; 56k t CO₂/yr sequestered (~27–29 kg/tree/yr avg); 347 t pollution removed/yr ($11.8M); $7.2M/yr energy savings.

**Per-tree benefits (USFS Northeast Community Tree Guide, 20-yr-old street tree, 2007 $ ×~1.5 for today)**
| /tree/yr | Small | Medium (red maple) | Large (zelkova-class) |
|---|---|---|---|
| Electricity | 27 kWh | 71 kWh | 176 kWh |
| CO₂ | 145 lb | 271 lb | 563 lb |
| Air pollutants | 0.58 lb | 1.18 lb | 2.43 lb |
| Rainfall intercepted | 312 gal | 1,014 gal | 1,624 gal |
| Total benefit | $28.62 | $76.10 | $150.75 |

**Cooling science**
- Ziter et al. 2019 PNAS: strongest cooling above **40% canopy**, at **60–90 m** block scale → justifies H3 res 10 + concave/threshold benefit.
- Zaerpour et al. 2025 npj Urban Sust.: +10% canopy → −0.8°C air; +30% → −1.5°C.
- Meta-analysis (ERL 2021): ~−0.3°C air per +10% canopy.
- Zhou et al. 2017 RSE: in **Baltimore**, canopy *amount* matters more than configuration.
- McDonald et al. 2021 PLOS ONE: low-income blocks 15.2% less canopy, 1.5°C hotter (Northeast: 30% less, 4°C hotter).
- Hoffman et al. 2020 *Climate*: redlined areas avg **2.6°C** hotter LST (up to 7°C), incl. Baltimore.

**AI footprint comparisons**
- Google (arXiv 2508.15734, Aug 2025): median Gemini text prompt **0.24 Wh, 0.26 mL water, 0.03 gCO₂e**.
- Epoch AI 2025: GPT-4o ~0.3 Wh typical.
- Altman 2025: 0.34 Wh, ~0.32 mL per ChatGPT query (company-reported).
- Li et al. "Making AI Less Thirsty": GPT-3 training ~700k L water; older, higher per-response estimates.
- Luccioni et al. 2024 "Power Hungry Processing": generative tasks ~18× more energy than classification → small task-specific models ≫ LLMs.
- Local 3B model on Mac ≈ 124 J ≈ 0.034 Wh/answer (ML.ENERGY).
- **Honest framing:** cloud per-query energy is already small; local saves data-center water and keeps data private but isn't free. Put caveats in a tooltip — judges reward intellectual honesty.

---

## 4. Tab 1 — "Current State" (map + stats)

### Visuals (ranked by wow/effort)
1. **3D extruded H3 hexes** on dark CARTO basemap: height = heat, color = canopy. "Rise" animation on load. (deck.gl `H3HexagonLayer`, `extruded: true`, transitions.)
2. **Bivariate 3×3 choropleth** (Joshua Stevens palette `#e8e8e8 #ace4e4 #5ac8c8 #dfb0d6 #a5add3 #5698b9 #be64ac #8c62aa #3b4994`), tabs: canopy×heat, canopy×income, canopy×asthma. Animated color transitions between tabs; rotated-45° legend.
3. **Layer toggles:** HOLC redlining overlay (outline polygons A–D), existing trees (point cloud at high zoom), empty pits, cooling centers, 3D buildings (OpenFreeMap `fill-extrusion` at zoom ≥14).
4. **Time-lapse 2013 → 2018 → 2022** canopy (Chesapeake rasters) with play button and big year ticker.
5. **Swipe compare:** satellite imagery (Esri World Imagery) vs. canopy layer.
6. **Camera fly-tos** + idle auto-orbit "attract mode" for the demo table.

### Collapsible stats panel — what to show
- **Linked scatter**: neighborhood canopy % vs. afternoon temp, OLS line + r² (Observable Plot `linearRegressionY`). Hover a dot ↔ highlight neighborhood on map (shared Zustand `hoveredId`).
- **Correlation matrix** (canopy, heat, income, % POC, asthma, impervious, HOLC grade) — small heatmap.
- **"Redlining still matters" bar chart:** mean canopy & temp by HOLC grade A/B/C/D. Very compelling for Community track.
- **Neighborhood card on click:** canopy %, gap to 40%, temp vs. city mean, median income, asthma rate, # empty pits, Tree Equity Score, sparkline of canopy over time, rank among 279.
- **Headline stats:** city canopy, # neighborhoods below 20%, temperature spread, # empty pits.
- Optional stats rigor: Moran's I (PySAL `esda`) to show heat/canopy cluster spatially; spatial-lag regression coefficient "°F per 10% canopy".

---

## 5. Tab 2 — "Plan" (optimizer)

### Recommended model (3 layers, all local, no LLM)
1. **ML heat model** — LightGBM predicting temperature per H3 res-10 cell (~14k cells) from canopy %, impervious %, building %, NDVI, distance to water, elevation, neighbor-averaged canopy (k-ring lag). Target: Heat Watch air temp (validate) and/or Landsat summer LST.
   - `monotone_constraints` → temp non-increasing in canopy (plausible counterfactuals).
   - Spatial CV (GroupKFold by H3 res-7 parent). Report random vs. spatial R².
   - **Counterfactual:** add n trees × ~50 m² crown to a cell → re-predict → ΔT curve per cell (n = 1..capacity). Smooth to concave (isotonic). Precompute and ship ~10 floats/cell.
   - **SHAP** (`TreeExplainer`) → "why this spot?" waterfall on click.
2. **Priority weights** — user sliders: heat, equity (income/poverty), health (asthma/SVI), redlining history, stormwater (floodplain), population density.
   `benefit_c(n) = ΔT_c(n) × (w_heat·pop_c + w_eq·vuln_c) + w_eco·n·(i-Tree $)`.
3. **Greedy optimizer in a Web Worker (JS)** — lazy greedy by marginal benefit per dollar. With concave per-cell curves this is optimal for a single budget constraint (and (1−1/e) with spillover). <50 ms for 14k cells → recompute on every slider move.
   - Hard equity quota: two-pass greedy (fill X% from low-income cells first).
   - Snap chosen trees to **real empty pits** in each cell (inventory), prefer tree-lawn sites without overhead utilities; use small species under wires.
   - Optional "exact solve" button: HiGHS in-browser (`highs-js` WASM) or PuLP/HiGHS FastAPI.

**Lower-risk fallback (~12 h):** skip the heat model; use MCDA score (Tree Equity Score style) × literature cooling slope (0.8°C per +10% canopy, capped at 40%/cell). Same greedy + UI.

### Plan-tab features
- **Budget slider** ($ or # trees, toggle) → trees **sprout** on map (staggered spring radius / tree icon, `delay = rank × 4ms`).
- **Animated impact counters:** trees, −°F in target neighborhoods, residents within 100 m, tons CO₂/yr, gallons stormwater/yr, $ benefits/yr, % benefit to low-income/redlined blocks.
- **Priority sliders / presets:** "Max cooling", "Equity first", "Stormwater", "Health (asthma)", "Balanced". Live re-rank.
- **Avoid areas:** draw polygon (deck.gl / `@deck.gl-community/editable-layers` or terra-draw) or toggle neighborhoods/parks/floodplains off.
- **Constraints:** min trees per neighborhood (spread), exclude sites under utilities, cost per site type ($1k pit vs $2k concrete cut).
- **Pareto curve chart** (hero visual): x = % of cooling going to low-income residents, y = total population-weighted cooling. Sweep α 0→1 (20 greedy runs ≈ 200 ms). Mark current plan, "pure cooling", "Tree Equity Score ranking", "random". Story: *"the first ~30–40% equity share costs almost no cooling."*
- **Before/after swipe:** current vs. planned canopy.
- **Projection slider** "years from now" (0/10/20): benefits grow with tree maturity (small → large crown); include ~66% survival rate.
- **Baselines comparison table:** your plan vs. random vs. lowest-canopy-first vs. Tree Equity ranking.
- **Robustness layer:** sites chosen in ≥80% of runs with weights perturbed ±20% ("robust picks").
- **Export:** CSV/GeoJSON of chosen pits (address, neighborhood, suggested species) for Forestry crews; one-page PDF neighborhood report for community associations (`react-pdf` or print CSS).
- **Species suggestion per site:** rule-based on `SPACEWIDTH` + `UTILITIES` (small tree under wires, large where space allows) from a native Maryland list.

---

## 6. Tab 3 — "Learn"

> **Decision (2026-09-25):** Learn tab = (1) animated scroll story as the main experience → (2) "How to help / donate" page at the end → (3) AI chat opened via a floating button (slide-over drawer), loaded only on demand.
> Story beats: heat hook (16°F spread) → 1937 redlining overlay → canopy gap by HOLC grade → human cost (asthma, heat, energy bills) → goal gap (28% vs 40% by 2037) → **turn: same # of trees, random vs strategic placement (numbers from our optimizer)** → city cools as trees sprout → call to action.

### Local chatbot ("Canopy Guide")
- **Runtime:** WebLLM `@mlc-ai/web-llm` in a Web Worker, model **`Qwen3.5-2B-q4f16_1-MLC`** (~2.2 GB VRAM); `Qwen3.5-0.8B` for weak laptops; `Qwen3.5-4B` for quality. Disable thinking mode. Check `navigator.gpu`; **pre-cache model before the demo** (venue Wi-Fi).
- Backend alternative/measurement path: Ollama `qwen3.5:4b` or `gemma4:e4b` (tool calling), energy measured by `zeus-apple-silicon`.
- **RAG:** curate 30–100 docs (TreeBaltimore, USFS Baltimore reports, i-Tree, Code Red, key papers, native species list). Chunk 300–500 tokens → embed at build time (`Xenova/all-MiniLM-L6-v2` or `onnx-community/embeddinggemma-300m-ONNX` via transformers.js) → ship `corpus.json`. Search with **Orama** hybrid (vector + keyword — important for neighborhood names). Answers cite `[1]` → source cards.
- **Tools (hand-written loop, no LangGraph):** regex/keyword router →
  - `get_neighborhood_stats(name)` from app JSON (fuzzy match),
  - `explain_recommendation(site_id)` (optimizer score + SHAP → LLM just narrates),
  - `search_docs(q)`,
  - `recommend_species(conditions)`.
  WebLLM tool-calling for Qwen: use JSON-schema `response_format` and dispatch yourself.
- **Footprint badge per answer:** "≈0.01 Wh · 0 mL data-center water · runs on your device" vs. cloud reference, with caveat tooltip. Translate into tree terms ("a mature oak offsets this in ~X seconds").

### Other Learn features
- **Scrollytelling story** (Scrollama + same map): 1937 redlining map → today's heat → canopy gap → asthma → "what if we planted 5,000 trees here?" (flyTo per step). Reference: Howard Center "Code Red".
- **Tree benefit calculator:** pick species + age → CO₂, stormwater, energy, $ (lookup table from USFS guide).
- **"What tree fits my block?"** species recommender (deterministic filter over native list: Willow Oak, Swamp White Oak, Red Maple, Blackgum, Serviceberry, Eastern Redbud, American Hornbeam, Sweetbay Magnolia, River Birch, Tulip Poplar) + LLM explanation.
- **Quiz** generated from corpus (JSON-schema output, validated, cached).
- **Local voice:** Kokoro TTS (`kokoro-js`) read-aloud; Whisper (transformers.js) voice questions. Accessibility win.
- **Tree ID from photo:** local Gemma 4 E2B / Qwen3.5 vision in browser (opt-in Pl@ntNet "verify").
- **Take action:** enter address → nearest empty pit + link to request a free street tree (https://www.treebaltimore.org/street-tree-request-form), free tree giveaways (https://www.treebaltimore.org/tree-order), volunteer with TreeBaltimore, Baltimore Tree Trust (https://www.baltimoretreetrust.org/get-involved/volunteer/), Blue Water Baltimore, Parks & People (https://parksandpeople.org/volunteer), upcoming events (https://www.treebaltimore.org/treeevents).
- **Multilingual** (Spanish) for community reach — small models handle it.

---

## 7. Impact & evaluation plan (critical for Community track)

Put this on a slide and ideally as a panel in the app.

**Outputs (immediate):** # trees planned, cost, % in priority neighborhoods, residents within 100 m.

**Outcome metrics & how measured:**
| Metric | Data source | Cadence |
|---|---|---|
| Canopy % change per neighborhood | Chesapeake 1 m land cover (next edition), city UTC assessments | every 3–5 yrs |
| Street-level heat | Repeat NOAA/CAPA Heat Watch campaign; Baltimore UHI sensors | annual summer |
| Trees planted & surviving | Forestry inventory `SPP`/`CONDITION` diff (it's live) | quarterly |
| Equity share | % of new trees/benefit in low-income + HOLC C/D blocks | quarterly |
| Health proxies | CDC PLACES asthma, heat-related ER visits (MDH) | annual (long lag) |
| Community engagement | tree requests, volunteer signups via app referral links | monthly |

**Validation of the model itself:**
- Spatial CV of heat model; physical plausibility vs. literature (°C per 10% canopy).
- **Backtest:** 2013→2021 canopy change vs. Landsat temp change — did cells that gained canopy cool as the model predicts?
- Sensitivity analysis (weights, crown size, cost) + rank stability.
- Compare against Tree Equity Score priorities.

**Pilot plan (realistic):** share with TreeBaltimore/Baltimore Tree Trust; pilot one Tree Trust season (e.g. 100 wells) in 2–3 neighborhoods; compare survival/heat/engagement vs. business-as-usual siting. Community input loop: residents flag pits or request trees; associations get neighborhood PDF.

**Ethics/risks to acknowledge:** green gentrification (trees can raise rents — pair with anti-displacement partners), resident consent (some residents refuse street trees due to maintenance/sidewalk concerns — Baltimore's tree-refusal history), maintenance burden, data limits (single heat day, LST vs air temp).

---

## 8. Stack & architecture

```
[Python offline pipeline]  geopandas, h3 (v4), rasterio/rasterstats|exactextract, lightgbm, shap, codecarbon
   ├─ fetch → clean → aggregate to H3 res 10 + neighborhoods
   ├─ train heat model → benefit curves per cell → SHAP top-3
   └─ export static: hexes.json, sites.json (~66k pts, or PMTiles), neighborhoods.topo.json, corpus.json
[Frontend, static]  Vite + React + TS + Tailwind + shadcn/ui + Framer Motion
   ├─ react-map-gl/maplibre + deck.gl 9 (interleaved) on CARTO Dark Matter + OpenFreeMap 3D buildings
   ├─ Web Worker: greedy optimizer; Web Worker: WebLLM
   ├─ Observable Plot / visx charts, Zustand shared state, Scrollama
   └─ transformers.js (embeddings, Whisper), kokoro-js, Orama
[Optional backend]  FastAPI: exact ILP, Ollama path + zeus energy, Tiger Data queries
[Deploy]  DigitalOcean App Platform (static, free) + GoDaddy Registry domain
```

Payload budget: keep < ~3–5 MB excluding the LLM (cached separately).

Basemap: `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json` (no token). Avoid Mapbox (token/billing), Leaflet (no 3D), kepler.gl (hard to customize).

GeoPandas = data pipeline only; OSM data comes via the basemap tiles.

---

## 9. Sponsor prizes that fit
| Prize | Fit | How |
|---|---|---|
| **GoDaddy Registry domain** | Easy win | Register e.g. `shadebmore.co`, `coolerblocks.co`, `canopy.study`, `baltishade.co` (check availability; promo MLH0926HU) |
| **DigitalOcean** | Easy | Host on App Platform (static free); FastAPI droplet if needed |
| **Tiger Data** | Good, meaningful | PostGIS + TimescaleDB hypertable of UHI sensor readings / heat traverse points → continuous aggregate "24-hour heat pulse" animation; `canopy_by_year` time-lapse; `ST_DWithin` residents near sites. 30-day free trial. Keep static fallback. |
| ElevenLabs | Conflicts with local pitch | Only as opt-in "narrated tour" with cached audio; default to Kokoro. |
| Gemini / Snowflake | Conflicts | Skip — contradicts the "no cloud LLM" story. |
| Backboard | Weak | Skip. |

---

## 10. On LangGraph / "multiple AI agents"
- **Inside the app:** LangGraph is overkill for 1 agent with 3–4 tools and doesn't run in the browser. Hand-roll a ~50-line router/tool loop.
- **For building the project:** if you meant using AI coding agents in parallel, that's a dev workflow (e.g. separate Claude Code sessions/worktrees for data pipeline, map UI, optimizer, Learn tab). Disclose AI use per hackathon rules.

---

## 11. Suggested build plan (24–36 h, 3–4 people)
| Person | Focus |
|---|---|
| A — Data/ML | Fetch & clean data (START IMMEDIATELY — biggest risk), H3 aggregation, heat model, benefit curves, validation |
| B — Map | deck.gl/MapLibre, hex layer, bivariate, sprouting sites, fly-tos |
| C — UI/Charts/Plan | shadcn layout, sliders, optimizer worker, counters, Pareto chart, export |
| D — Learn | WebLLM + RAG corpus, scrollytelling, action links, footprint badges |

**Milestones:** H0–6 data in static JSON + map skeleton · H6–14 Current State done, MCDA-based Plan working end-to-end · H14–22 heat model replaces MCDA, Learn chatbot, Pareto · H22–28 polish, animations, eval panel · **feature freeze ~8 h before deadline** · scripted 2-min demo with fly-tos, rehearse, record backup video.

**Scope cuts if behind:** res 9 instead of 10; MCDA fallback instead of LightGBM; drop backtest; drop time-lapse; drop voice.

> Check hackUMBC rules on pre-hackathon work. Downloading/exploring public data beforehand is usually fine; pre-written code usually isn't.

---

## 12. Prior art & differentiation
- **American Forests Tree Equity Score Analyzer** — mature, block-group, scenario planner; 2D, form-heavy, not Baltimore-specific.
- **Google Tree Canopy Lab** — AI canopy detection, descriptive only, no optimization.
- **NYC Tree Map** — inventory + i-Tree benefits.
- **TreeBaltimore ArcGIS viewer** — functional, not engaging, no prioritization.
- **Treepedia (MIT)** — street-level Green View Index.
- **Nyelele & Kroll 2021** (Bronx LP planting optimization) — closest academic analog; cite as what you extend.
- Devpost: few strong direct matches → space is open for a polished decision tool.

**Your differentiators:** real empty pits as candidates · live budget→impact optimization with sprouting animation · ML counterfactual cooling + SHAP · equity Pareto frontier · redlining lens · in-browser AI with honest footprint accounting · actionable exports + evaluation plan.

### Stretch "how did they do that?!" feature
In-browser street-level greenery: click a point → fetch Mapillary image → run SegFormer (`Xenova/segformer-b0-finetuned-cityscapes-1024-1024`) via transformers.js → overlay green mask + Green View Index. Medium–high effort; starter code: `AmericanRedCross/street-view-green-view`.

---

## 13. Code snippets

### deck.gl + MapLibre hex map
```tsx
import {Map, useControl} from 'react-map-gl/maplibre';
import {MapboxOverlay} from '@deck.gl/mapbox'; // works with MapLibre
import {H3HexagonLayer} from '@deck.gl/geo-layers';
import {ScatterplotLayer} from '@deck.gl/layers';

function DeckGLOverlay(props) {
  const overlay = useControl(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

const layers = [
  new H3HexagonLayer({
    id: 'hex', data: hexes, getHexagon: d => d.h3, extruded: true, coverage: 0.92,
    elevationScale: 40 * grow, getElevation: d => d.heat_anom,
    getFillColor: d => canopyRamp(d.canopy), pickable: true, autoHighlight: true,
    transitions: {getElevation: 900, getFillColor: 900},
  }),
  new ScatterplotLayer({
    id: 'sites', data: sites, getPosition: d => d.pos, radiusUnits: 'meters',
    getRadius: d => (selected.has(d.id) ? 18 : 0), getFillColor: [74, 222, 128],
    transitions: {getRadius: {duration: 600, type: 'spring', stiffness: 0.08, damping: 0.4}},
    updateTriggers: {getRadius: selectedVersion},
  }),
];

<Map initialViewState={{longitude: -76.615, latitude: 39.30, zoom: 11.3, pitch: 55, bearing: -20}}
     mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json">
  <DeckGLOverlay layers={layers} interleaved />
</Map>
```

### Lazy greedy (JS, Web Worker)
```js
// cells: [{id, cost, cap, gains:[g1,g2,...] (marginal benefit of 1st, 2nd... tree), lowInc}]
function allocate(cells, budget, w) {
  const heap = new MaxHeap(); const alloc = new Map(); let spent = 0;
  for (const c of cells) if (c.cap > 0) heap.push({c, k: 0, v: score(c, 0, w) / c.cost});
  while (heap.size && spent < budget) {
    const {c, k} = heap.pop();
    if (spent + c.cost > budget) continue;
    alloc.set(c.id, k + 1); spent += c.cost;
    if (k + 1 < c.cap) heap.push({c, k: k + 1, v: score(c, k + 1, w) / c.cost});
  }
  return alloc;
}
const score = (c, k, w) => c.gains[k] * (w.heat * c.pop + w.equity * c.vuln) + w.eco * c.ecoValue;
```

### Heat model + counterfactual (Python)
```python
import lightgbm as lgb, numpy as np
feats = ['canopy','impervious','bldg','ndvi','dist_water','elev','canopy_lag']
mono  = [-1, 0, 0, 0, 0, 0, -1]
model = lgb.LGBMRegressor(n_estimators=600, learning_rate=0.03, num_leaves=31,
                          monotone_constraints=mono).fit(X[feats], y)
CROWN, AREA = 50, 15000  # m²
def curve(row, cap):
    base = model.predict(row[feats].to_frame().T)[0]; out = []
    for n in range(1, cap + 1):
        r = row.copy(); r['canopy'] = min(r['canopy'] + n*CROWN/AREA, 1)
        out.append(base - model.predict(r[feats].to_frame().T)[0])
    return np.maximum.accumulate(out)  # monotone
```

### WebLLM
```js
import { CreateWebWorkerMLCEngine } from "@mlc-ai/web-llm";
const engine = await CreateWebWorkerMLCEngine(new Worker(new URL('./llm.worker.js', import.meta.url), {type:'module'}),
  "Qwen3.5-2B-q4f16_1-MLC", { initProgressCallback: p => setStatus(p.text) });
const stream = await engine.chat.completions.create({
  messages: [{role:"system", content: SYSTEM + context}, {role:"user", content: q}],
  stream: true, stream_options: {include_usage: true}, temperature: 0.3 });
```

---

## 14. Sources (selected)
- Baltimore Tree Inventory: https://data.baltimorecity.gov/datasets/baltimore-tree-inventory
- Chesapeake land cover: https://www.sciencebase.gov/catalog/item/68011bd8d4be0263cab0ff37
- NOAA Baltimore heat maps: https://www.climate.gov/news-features/features/detailed-maps-urban-heat-island-effects-washington-dc-and-baltimore
- Tree Equity Score methodology: https://www.treeequityscore.org/methodology
- USFS Baltimore's Urban Forest 2020: https://research.fs.usda.gov/treesearch/69884
- USFS Northeast Community Tree Guide: https://www.itreetools.org/documents/443/PSW_GTR202_Northeast_CTG.pdf
- Howard Center Code Red: https://howard-center-investigations.github.io/code-red-baltimore-climate-divide/
- Ziter 2019: https://www.pnas.org/doi/10.1073/pnas.1817561116
- Zaerpour 2025: https://www.nature.com/articles/s42949-025-00277-x
- McDonald 2021: https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0249715
- Hoffman 2020: https://www.mdpi.com/2225-1154/8/1/12
- Zhou 2017: https://www.sciencedirect.com/science/article/abs/pii/S0034425717301463
- Nyelele & Kroll 2021: https://www.esf.edu/ere/kroll/documents/Nyelele_Kroll_2021.pdf
- Google AI footprint: https://arxiv.org/abs/2508.15734
- Epoch AI: https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use
- Li et al.: https://arxiv.org/abs/2304.03271
- Luccioni et al.: https://arxiv.org/abs/2311.16863
- WebLLM: https://github.com/mlc-ai/web-llm · transformers.js v4: https://huggingface.co/blog/transformersjs-v4 · Orama: https://github.com/oramasearch/orama
- zeus-apple-silicon: https://github.com/ml-energy/zeus-apple-silicon · CodeCarbon: https://codecarbon.io
- deck.gl + MapLibre: https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre
- OpenFreeMap: https://openfreemap.org/quick_start/
- highs-js: https://github.com/lovasoa/highs-js
- Tiger Data PostGIS: https://www.tigerdata.com/docs/deploy/tiger-cloud/tiger-cloud-azure/tiger-cloud-extensions/postgis
- SegFormer (transformers.js): https://huggingface.co/Xenova/segformer-b0-finetuned-cityscapes-1024-1024
