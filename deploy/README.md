# Deploying the chat backend

The site is a static build on DigitalOcean App Platform. The chat backend (FastAPI + Ollama) runs on one droplet:

```
Browser ─HTTPS─▶ App Platform static site (web/)
   └───HTTPS─▶ droplet: Caddy :443 → uvicorn 127.0.0.1:8000 → Ollama 127.0.0.1:11434
```

| File | What it does |
|---|---|
| `setup_droplet.sh` | One-time setup on Ubuntu 24.04 (safe to re-run): Ollama + models, app code, venv, systemd service, Caddy, firewall |
| `api.service` | systemd unit for uvicorn (user `canopy`, env from `/etc/canopy/api.env`) |
| `Caddyfile` | HTTPS reverse proxy; `flush_interval -1` so answers stream line by line |
| `update.sh` | Pull the latest code and restart the API |

## 1. Create the droplet
DigitalOcean → Create → Droplets: **Ubuntu 24.04**, region **Toronto (TOR1)**, **8 GB RAM / 4 vCPU** (CPU-Optimized if credits allow), your SSH key.

## 2. Run the setup script
The site's URL is needed for CORS. If the App Platform site doesn't exist yet, create it first (step 3), or use a placeholder and re-run later.

```bash
ssh root@<droplet-ip>
curl -fsSL https://raw.githubusercontent.com/allisonylee/hackumbc2026/main/deploy/setup_droplet.sh -o setup.sh
SITE_URL=https://<your-app>.ondigitalocean.app bash setup.sh
```

It prints the API address, `https://<ip-with-dashes>.sslip.io` by default. sslip.io resolves that name to the droplet's IP, so HTTPS works with no domain or DNS setup. With your own domain, add an A record `api` → the droplet IP and pass `API_HOST=api.<domain>`. To allow several origins, comma-separate them: `SITE_URL=https://a.example,https://b.example`.

Check from your laptop: `curl https://<api-host>/api/health` should return `{"model": "qwen3.5:2b", ..., "energy": "estimated"}`.

## 3. Point the site at it (App Platform)
- Create the app from the GitHub repo: **Static Site**, source directory `web`, build command `npm run build`, output directory `dist`.
- Add a **catch-all** route to `index.html` (Settings → the static site component → Custom Pages → Catchall document `index.html`) so `/plan` and `/learn` work on refresh.
- Add the environment variable **`VITE_API_URL=https://<api-host>`**, scoped to **build time**. Vite bakes it into the JavaScript, so redeploy after setting or changing it.

## Updating
`ssh root@<droplet-ip> bash /opt/app/deploy/update.sh`. To change settings, edit `/etc/canopy/api.env` and run `systemctl restart api`.

## Energy on the droplet
A droplet has no energy counters, so answers report `measured: false`, estimated as Ollama's generation time × `ESTIMATE_WATTS`. The setup script computes that from the droplet's size with the Cloud Carbon Footprint coefficients (see the comment in `setup_droplet.sh`); about 21 W for 4 vCPUs and 8 GB. Measured figures come from the Mac (`backend/calibrate_energy.py`).

## Troubleshooting
- `journalctl -u api -f` (backend), `journalctl -u caddy -f` (HTTPS), `journalctl -u ollama -f` (models).
- Answers arrive all at once: something between the browser and Caddy is buffering; the backend already sends `X-Accel-Buffering: no`.
- CORS error in the browser: `ALLOWED_ORIGINS` in `/etc/canopy/api.env` must exactly match the site's origin (scheme + host, no trailing slash).
- Certificate errors: check `journalctl -u caddy`. Ports 80 and 443 must be open (the script opens them in ufw; check any DigitalOcean cloud firewall too).

## After judging
Snapshot and destroy the droplet, and unset `VITE_API_URL` (the chat shows its offline message).
