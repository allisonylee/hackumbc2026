# Raw data inventory

Downloaded 2026-09-26. All files are in `pipeline/data/raw/`, which is gitignored (~390 MB total). Everything is public data. Unless noted, vector files are GeoJSON in EPSG:4326.

## trees/
| File | Records | Source |
|---|---|---|
| `vacant_sites.geojson` | 70,156 | Baltimore Forestry tree inventory (`baltegis.../Forestry/Trees/MapServer/0`), `SPP IN ('Vacant Site','Vacant Potential','Vacant Site Not Suitable')` |
| `trees_all_other.geojson` | 122,773 | Same layer, all other records: live trees, stumps, dead |

**Field values observed in `vacant_sites`:**
- `SPP`: Vacant Site 44,781 · Vacant Potential 21,541 · Vacant Site Not Suitable 3,834 (drop these).
- `SPACE_TYPE`: Tree Lawn 38,777 · **Potential Well/Pit 21,586** (needs a new well cut, so use the $2,000 cost) · Well/Pit 6,320 · Median/Island 2,783 · Open/Unrestricted 599 · others < 50.
- `UTILITIES`: None 63,553 · Both 4,773 · Electric 1,472 · Communication 353. **Overhead lines = anything other than "None"** → small species.
- `SPACEWIDTH` is a string in feet: "0" (21k, mostly potential pits), "3", "4", "5" … ">20". Parse ">20" as 20.
- `PRIORITY` and `PLANTING_POTENTIAL` are **empty**, so they can't be used.
- `HARD_SCAPE`: mostly "None".

**`trees_all_other`:**
- `CONDITION`: Good 74.7k · Fair 29.1k · Stump 8.8k · Poor 6.9k · Dead 2.6k.
- Useful fields: `COMMON`, `GENUS`, `DBH`, `TREE_HT`.

## boundaries/
| File | Records | Notes |
|---|---|---|
| `neighborhoods.geojson` | 279 | Official neighborhood statistical areas. Fields: `Name`, `Population` (2020), race counts, `Total_Units`. Dissolve for the city boundary. |
| `csas.geojson` | 56 | Community Statistical Areas (BNIA), 2020 |

## heat/
NOAA/CAPA Heat Watch, car-mounted air temperature, **2018-08-29**. Exported from `gis.nnvl.noaa.gov/.../HINDZ/*_Air_Temperature_in_Cities/ImageServer` (raster id 2 = Baltimore).
- GeoTIFF, float32, EPSG:4326, 2227×2116 px (~10 m), nodata −9999, bbox (−76.72, 39.19, −76.52, 39.38).

| File | Valid px | Min / median / max °F |
|---|---|---|
| `baltimore_afternoon_air_temperature_20180829.tif` (3–4 pm) | 96% | 86.6 / 94.2 / 102.8 → **16.2°F spread** |
| `baltimore_evening_air_temperature_20180829.tif` (7–8 pm) | 96% | 81.2 / 88.4 / 95.5 |
| `baltimore_morning_air_temperature_20180829.tif` (6–7 am) | 96% | 73.5 / 77.2 / 83.0 |

The heat-index service has no Baltimore raster; only air temperature is available.

## landcover/
Chesapeake Bay Program **1 m Land Use/Land Cover, 2024 edition**, Baltimore City (24510).
- **Download route:** the ScienceBase item pages point to a browser-only file manager. The direct public URLs are `https://prod-is-usgs-sb-prod-publish.s3.amazonaws.com/<itemId>/<filename>` (item `68011bd8d4be0263cab0ff37` for LULC and `68011c83d4be0263cab101c8` for change).
- Files:
  - `balt_24510_lulc_{2013,2018,2021}_2024-Edition.tif`: uint8, LZW, 18877×19548 px, **projected CRS (check with rasterio; likely USA Contiguous Albers)**.
  - `balt_24510_lulc-change_2013-2021_2024-Edition.tif`: uint16 change codes (see `lulcc_2024-Edition.xml`).
  - `lulc_2024-Edition.xml` and `lulcc_2024-Edition.xml`: metadata.

**Class codes** (from the metadata; these differ from the older 1–12 land-cover scheme):
| Group | Codes |
|---|---|
| NoData | 0 |
| Water | 10 tidal · 11 lakes · 12 riverine ponds · 13 terrene ponds · 14 streams (15 bare shore) |
| Impervious | 20 roads · 21 structures · 22 other impervious · 31 extractive impervious |
| **Tree canopy** | 23 over roads · 24 over structures · 25 over other impervious · 26 over turf · 40 forest · 41 forested other · 53/54 riverine wetland forest · 63/64 terrene wetland forest · 73/74 tidal wetland forest |
| Low vegetation | 27 turf grass · 34/37/43 herbaceous · 35/38/44 shrubland |
| Barren | 28 bare developed · 30, 33, 36, 42 |

Suggested derived fractions:
- `canopy` = {23,24,25,26,40,41,53,54,63,64,73,74}
- `imperv` = {20,21,22,31}; optionally add 23–25 as "impervious under canopy"
- `road` = {20} (+23)
- `bldg` = {21} (+24)
- `water` = {10–14}
- `lowveg` = {27,34,35,37,38,43,44}

## census/
- `cb_2024_24_tract_500k.zip` and `cb_2024_24_bg_500k.zip`: TIGER cartographic boundaries for Maryland. Filter `COUNTYFP == '510'`.
- **Still needed:** ACS 5-year tables (B19013 income, B17001 poverty, B03002 race, B01003 population). The Census API key is in the repo-root `.env` as `CENSUS_API_KEY` (gitignored; worktrees must read it from the main checkout).
  - Stopgap: CDC SVI (below) already has tract population, poverty (150%), minority share and more. Only median income needs ACS.

## health/
| File | Records | Notes |
|---|---|---|
| `cdc_places_tract_baltimore.json` | 7,920 rows, 198 tracts | CDC PLACES (2022/2023 data years). Filter `measureid == 'CASTHMA'` for asthma; `data_value` is %. Join on `locationname` (tract FIPS). |
| `cdc_svi_2022_baltimore.geojson` | 199 tracts | CDC/ATSDR SVI 2022. `RPL_THEMES` overall percentile, `EP_POV150`, `EP_MINRTY`, `E_TOTPOP`, etc. −999 = missing. |

## history/
| File | Records | Notes |
|---|---|---|
| `mappinginequality_us.json` | whole US (10.5 MB) | Filter `properties.city == 'Baltimore'` → 60 polygons (A 6, B 22, C 22, D 9, 1 ungraded) |
| `tes_maryland_mirror_baltimore.geojson` | 618 block groups | Tree Equity Score from an **unofficial** ArcGIS mirror, filtered `GEOID LIKE '24510%'`. Fine for prototyping; cite the official download (treeequityscore.org) in the submission. |

## context/
| File | Records | Notes |
|---|---|---|
| `parks_2023.geojson` | 373 | Recreation & Parks; has `perTreeCover18` |
| `floodplain.geojson` | 554 | FEMA flood zones (`FLD_ZONE`), 32 MB. Simplify before use. |
| `cooling_centers.geojson` | 29 | Code Red cooling centers |
| `bnia_tree_canopy_csa.geojson` | 55 | BNIA canopy % by CSA, `trees11` and `trees17` (UVM). Useful for validating our canopy numbers. |

## Not downloaded (optional)
- Landsat land surface temperature: needs Earth Engine or Planetary Computer processing.
- ACS tables: need an API key (see above).
- Baltimore UHI sensor time series: only needed for the Tiger Data prize.
- 3DEP elevation: optional model feature.
