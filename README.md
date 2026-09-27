# A Tree Grows in Baltimore

hackUMBC 2026. Shows where Baltimore is hottest and least shaded, and plans where new street trees would cool the most people for a given budget.

- `web/`: React + Vite frontend (`cd web && npm install && npm run dev`)
- `pipeline/`: Python data pipeline and heat model; writes static JSON to `web/public/data/`
- `backend/`: FastAPI + Ollama chat service
- `deploy/`: droplet setup
- `CONTRACTS.md`: data formats shared by all parts

`web/public/data/` currently holds **mock data** (`python -m pipeline.mock.make_mock`).
