# A Tree Grows in Baltimore

Link: https://a-tree-grows-in-baltimore-nq9o8.ondigitalocean.app/ 

Devpost: https://devpost.com/software/a-tree-grows-in-baltimore?_gl=1*wkxice*_gcl_au*ODY0MjUxNzA4LjE3ODc0MzMxMjc.*_ga*ODMwNDc5NzczLjE3ODc0MzMxMjg.*_ga_0YHJK3Y10M*czE3OTA5OTgyMTEkbzIwJGcxJHQxNzkwOTk4MjY5JGoyJGwwJGgw 

Best Environmental Hack, HackUMBC 2026. Shows where Baltimore is hottest and least shaded, and plans where new street trees would cool the most people for a given budget.

- `web/`: React + Vite frontend (`cd web && npm install && npm run dev`)
- `pipeline/`: Python data pipeline and heat model; writes static JSON to `web/public/data/`
- `backend/`: FastAPI + Ollama chat service
- `deploy/`: droplet setup
- `CONTRACTS.md`: data formats shared by all parts
