#!/usr/bin/env bash
# Set up the Canopy Guide chat backend on a fresh Ubuntu 24.04 droplet (plan §12.3). Run as root:
#
#   curl -fsSL https://raw.githubusercontent.com/allisonylee/hackumbc2026/main/deploy/setup_droplet.sh -o setup.sh
#   SITE_URL=https://your-app.ondigitalocean.app bash setup.sh
#
# Settings (environment variables; all optional except SITE_URL):
#   SITE_URL   the frontend's origin, allowed by CORS (comma-separate several)
#   API_HOST   hostname for HTTPS; default <ip-with-dashes>.sslip.io, which needs no DNS setup
#   BRANCH     git branch to deploy (default main)
#   REGION     label shown in the chat header (default Toronto)
# Safe to re-run: it updates config and code in place.
set -euo pipefail

SITE_URL="${SITE_URL:?set SITE_URL to the frontend origin, e.g. https://your-app.ondigitalocean.app}"
BRANCH="${BRANCH:-main}"
REGION="${REGION:-Toronto}"
REPO="${REPO:-https://github.com/allisonylee/hackumbc2026.git}"
MODEL="qwen3.5:2b"
EMBED_MODEL="embeddinggemma"
APP_DIR=/opt/app
APP_USER=canopy

if [[ $EUID -ne 0 ]]; then echo "run as root" >&2; exit 1; fi

# The droplet's public IPv4, from DigitalOcean's metadata service (falls back to an outside lookup).
IP="$(curl -fsS --max-time 3 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address \
      || curl -fsS --max-time 5 https://api.ipify.org)"
API_HOST="${API_HOST:-${IP//./-}.sslip.io}"
echo "==> public IP $IP, API host $API_HOST"

echo "==> packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q python3-venv python3-pip git curl ufw
if ! apt-get install -y -q caddy; then  # not in the Ubuntu archive: use Caddy's official repository
  apt-get install -y -q debian-keyring debian-archive-keyring apt-transport-https gnupg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y -q caddy
fi

echo "==> ollama"
command -v ollama >/dev/null || curl -fsSL https://ollama.com/install.sh | sh
mkdir -p /etc/systemd/system/ollama.service.d
cat > /etc/systemd/system/ollama.service.d/override.conf <<EOF
[Service]
# Keep models in memory between questions; Ollama stays on 127.0.0.1 (its default).
Environment=OLLAMA_KEEP_ALIVE=30m
EOF
systemctl daemon-reload
systemctl enable --now ollama
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:11434/api/version >/dev/null && break; sleep 1; done
ollama pull "$MODEL"
ollama pull "$EMBED_MODEL"

echo "==> app code ($BRANCH)"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
if [[ -d $APP_DIR/.git ]]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch -q origin "$BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" checkout -q "$BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" reset -q --hard "origin/$BRANCH"
else
  mkdir -p "$APP_DIR" && chown "$APP_USER:" "$APP_DIR"
  sudo -u "$APP_USER" git clone -q --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
sudo -u "$APP_USER" python3 -m venv "$APP_DIR/.venv"
sudo -u "$APP_USER" "$APP_DIR/.venv/bin/pip" install -q --no-cache-dir --upgrade pip
sudo -u "$APP_USER" "$APP_DIR/.venv/bin/pip" install -q --no-cache-dir -r "$APP_DIR/backend/requirements.txt"

# Energy can't be measured on a droplet, so each answer is estimated as Ollama's time × this wattage.
# Cloud Carbon Footprint coefficients (cloudcarbonfootprint.org/docs/methodology): the mean of AWS, GCP and
# Azure maximum watts per vCPU (3.5, 4.26, 3.76 → 3.84 W; generation keeps every vCPU busy), 0.392 W per GB
# of memory, and a PUE of 1.14 (mean of 1.135, 1.1, 1.185). DigitalOcean publishes no such figures.
VCPUS="$(nproc)"
MEM_GB="$(awk '/MemTotal/ {printf "%.1f", $2 / 1048576}' /proc/meminfo)"
ESTIMATE_WATTS="$(awk -v c="$VCPUS" -v m="$MEM_GB" 'BEGIN {printf "%.1f", (c * 3.84 + m * 0.392) * 1.14}')"
echo "==> $VCPUS vCPUs, $MEM_GB GB → ESTIMATE_WATTS=$ESTIMATE_WATTS"

mkdir -p /etc/canopy
cat > /etc/canopy/api.env <<EOF
OLLAMA_URL=http://127.0.0.1:11434
MODEL=$MODEL
EMBED_MODEL=$EMBED_MODEL
REGION_LABEL=$REGION
ALLOWED_ORIGINS=$SITE_URL
APP_URL=${SITE_URL%%,*}
MEASURE_ENERGY=0
ESTIMATE_WATTS=$ESTIMATE_WATTS
EOF

install -m 644 "$APP_DIR/deploy/api.service" /etc/systemd/system/api.service
systemctl daemon-reload
systemctl enable api
systemctl restart api

echo "==> caddy (HTTPS for $API_HOST)"
mkdir -p /etc/caddy
sed "s/{\$API_HOST}/$API_HOST/" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl enable caddy
systemctl restart caddy

echo "==> firewall"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "==> warm-up (loads both models; the first answer takes a while)"
for i in $(seq 1 60); do curl -fsS http://127.0.0.1:8000/api/health >/dev/null && break; sleep 1; done
curl -fsS -X POST http://127.0.0.1:8000/api/chat -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"What is an urban heat island?"}]}' | tail -1 || true

cat <<EOF

Done. Check from your laptop:
  curl https://$API_HOST/api/health
Then in App Platform set VITE_API_URL=https://$API_HOST (build-time variable) and redeploy the site.
Logs: journalctl -u api -f     Update later: bash $APP_DIR/deploy/update.sh
EOF
