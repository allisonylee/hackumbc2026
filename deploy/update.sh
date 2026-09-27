#!/usr/bin/env bash
# Pull the latest code and restart the API. Run as root on the droplet: bash /opt/app/deploy/update.sh
set -euo pipefail
BRANCH="$(git -C /opt/app rev-parse --abbrev-ref HEAD)"
sudo -u canopy git -C /opt/app fetch -q origin "$BRANCH"
sudo -u canopy git -C /opt/app reset -q --hard "origin/$BRANCH"
sudo -u canopy /opt/app/.venv/bin/pip install -q --no-cache-dir -r /opt/app/backend/requirements.txt
systemctl restart api
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:8000/api/health && echo && exit 0; sleep 1; done
echo "api didn't come back; see: journalctl -u api -n 50" >&2; exit 1
