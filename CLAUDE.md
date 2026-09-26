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
- Web dev server: `cd web && npm run dev`. Tests: `cd web && npx vitest`.
- Production build: `cd web && npm run build`. This is the same build DigitalOcean runs, so it must pass before every push to `main`.
- Preview the production build in a browser: `cd web && npm run build && npx vite preview`. Use this to confirm the built app works, including SPA routes like `/plan` and `/learn` on refresh.
- Backend: `cd backend && uvicorn main:app --reload`.
- Pipeline export: `python -m pipeline.export.export_web`.
- Mock data (until the real export exists): `python -m pipeline.mock.make_mock`.

## Rules
- Only edit your lane's folder: session A → `web/` (and root docs), session B (`feat/pipeline`) → `pipeline/`, session C (`feat/backend`) → `backend/`, `deploy/`, plus `web/src/tabs/plan/` for the optimizer.
- `CONTRACTS.md` changes happen only on `main`. Update `pipeline/mock/make_mock.py` in the same commit.
- Commit after every working step.
- `main` must always build: every push to `main` redeploys (once App Platform is connected). Before pushing or merging to `main`, run `cd web && npm run build` and fix any errors. For UI changes, also open the preview and check the browser console for errors.
- No cloud LLM APIs. The chat uses local Ollama only.
- Keep `web/public/data` under ~5 MB gzipped.
- Never hardcode numbers in the UI, story or pitch; read them from `stats.json`.

## Handoffs
Write a handoff document whenever work may be picked up by someone without this session's memory (the user, or a fresh chat):
- the session is about to end, or the task is finished;
- the context window is getting full;
- work is being paused, interrupted or blocked.

Don't wait to be asked. Write it while there's still room in the context to do it well.

**Where:** always the main checkout, `/Users/allisonlee/Desktop/AI/hackumbc2026/handoffs/`, including from worktrees, so every session finds them in one place. The folder is gitignored. Name files `YYYY-MM-DD-HHMM-<lane>-<short-slug>.md`, where lane is `main`, `pipeline` or `backend`.

**At session start:** read the newest handoff for your lane, if there is one, before doing anything else.

**Template** (fill every section; write "none" rather than deleting one):
```markdown
# Agent Report: [Brief Description]

**Date**: YYYY-MM-DD
**Status**: IN_PROGRESS | INTERRUPTED | BLOCKED | COMPLETED
**Reason**: [why this handoff is being created]

## Context In
- Input artifacts used (paths)
- Plan document, if working from one (path)

## Actions
- Files created/modified (exact paths, what was done to each)
- Commands run (exact commands, purpose, outcome)
- Current phase/task and how far along it is

## Evidence
- Test/check outputs, verbatim
- Errors, warnings, partial results
- Pointers to logs/plots/artifacts

## Context Out
- All created/modified artifacts (full paths)
- What's partial vs complete

## Next
- What the next agent (or the user) should do — a single next task if possible
- Blockers and what's needed to clear them, if any
```

Also include the branch/worktree and the last commit hash, and note any uncommitted changes.

## Frontend layout (`web/src/`)
- `store.ts`: the one zustand store (data, tab, map toggles, hover/selection, per-tab slices, chat, dialogs, camera `flyTo`/`fitBounds`).
- `lib/`: `types.ts` (TypeScript mirror of CONTRACTS.md), `data.ts` (loader + indexes; `loadTrees()` and `loadOptional()` are lazy), `colors.ts`, `format.ts`, `views.ts`, `maplibre.ts`.
- `map/`: `MapCanvas.tsx` (one persistent map behind every tab), `useLayers.ts` (base layers + the active tab's layers), `baseLayers.ts` (city mask), `types.ts` (`TabLayers`, `before()` for label ordering).
- `components/`: shared UI (`Panel`, `StatTile`, `AnimatedNumber`, `Legend`, `LoadingScreen`, `NavBar`) and shadcn in `components/ui/`.
- `tabs/current|plan|learn/`: each tab's `layers.ts` (`use<Tab>Layers(active)`) and panel component. The optimizer lives in `tabs/plan/` (`optimizer.ts`, worker, `optimizerClient.ts`).
- `features/chat`, `features/footprint`: global chat drawer and dialogs, rendered once by `App.tsx`.
- Data-derived numbers come from the data files or optimizer results, never hardcoded.

## Gotchas
- MapLibre must be imported via `@/lib/maplibre` and passed as `<Map mapLib={maplibregl}>`. The default build's inline worker breaks under Vite's dev prebundling.
- MapLibre is pinned to v5, the version deck.gl 9.x is known to work with. deck.gl's interleaved overlay threw errors on v6.
- `pipeline/data/raw/` is gitignored (~390 MB). Worktrees get it through a symlink to the main checkout.
