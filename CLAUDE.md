# Baltimore Tree Planting Planner (hackUMBC 2026)

A web app that shows where Baltimore is hottest and least shaded, and plans where new street trees would cool the most people for a given budget. It uses an ML heat model, an equity-aware optimizer, and a small local-LLM chat for learning.

Plans: [planning/implementation_plan.md](planning/implementation_plan.md) (how to build it) and [planning/research.md](planning/research.md) (data sources, citations). `planning/` is gitignored, so in a worktree read it from the main checkout: `/Users/allisonlee/Desktop/AI/hackumbc2026/planning/`.
Data shapes: [CONTRACTS.md](CONTRACTS.md). Raw data inventory: [pipeline/data/README.md](pipeline/data/README.md).

## Stack
- **Pipeline** (`pipeline/`): Python. geopandas, rasterio/rasterstats, h3, LightGBM, SHAP, CodeCarbon. Runs offline and writes static JSON to `web/public/data/`.
- **Web** (`web/`): React + Vite + TypeScript, Tailwind v4 + shadcn/ui, MapLibre (v5) + deck.gl via `react-map-gl/maplibre`, zustand, motion, Observable Plot, scrollama. The optimizer runs in a Web Worker.
- **Backend** (`backend/`): FastAPI, Ollama (`qwen3.5:2b`, `embeddinggemma`). Used only by the chat.
- **Deploy**: DigitalOcean App Platform (static site from `web/`, auto-deploys on push to `main`); droplet for the backend (`deploy/`).

## Running things
Python always uses the project venv at `/Users/allisonlee/Desktop/AI/hackumbc2026/.venv` (also from worktrees). Run Python modules from the repo root.
- Web dev server: `cd web && npm run dev`. Build: `cd web && npm run build`. Tests: `cd web && npx vitest`.
- Backend: `cd backend && uvicorn main:app --reload`.
- Pipeline export: `python -m pipeline.export.export_web`.
- Mock data (until the real export exists): `python -m pipeline.mock.make_mock`.

## Rules
- Only edit your lane's folder: session A → `web/` (and root docs), session B (`feat/pipeline`) → `pipeline/`, session C (`feat/backend`) → `backend/`, `deploy/`, plus `web/src/tabs/plan/` for the optimizer.
- `CONTRACTS.md` changes happen only on `main`. Update `pipeline/mock/make_mock.py` in the same commit.
- Commit after every working step.
- `main` must always build (`cd web && npm run build`): every push to `main` redeploys.
- No cloud LLM APIs. The chat uses local Ollama only.
- Keep `web/public/data` under ~5 MB gzipped.
- Never hardcode numbers in the UI, story or pitch; read them from `stats.json`.

## Gotchas
- MapLibre must be imported via `@/lib/maplibre` and passed as `<Map mapLib={maplibregl}>`. The default build's inline worker breaks under Vite's dev prebundling.
- MapLibre is pinned to v5, the version deck.gl 9.x is known to work with. deck.gl's interleaved overlay threw errors on v6.
- `pipeline/data/raw/` is gitignored (~390 MB). Worktrees get it through a symlink to the main checkout.
