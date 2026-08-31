#!/usr/bin/env bash
# =============================================================================
# Deploy script for the API VM
# Pulls latest code, installs deps, runs migrations, restarts service.
# Also handles in-place infra updates (systemd unit refresh, env-file rename).
# =============================================================================
set -euo pipefail

REPO_DIR="/opt/loudin"

echo "=== Pulling latest code from main ==="
cd "${REPO_DIR}"
git pull origin main

echo "=== Installing dependencies ==="
cd "${REPO_DIR}/apps/api"
npm ci --omit=dev

# ── One-time migration: .env.production → .env ───────────────────────────────
# The API used to read .env.production; both server.js and migrate.js now
# read .env. The systemd unit's EnvironmentFile was updated to match. Rename
# the live env file once so the next service restart picks up the right path.
# Idempotent: no-op on every run after the first.
if [ -f "${REPO_DIR}/apps/api/.env.production" ] && [ ! -f "${REPO_DIR}/apps/api/.env" ]; then
  echo "=== Renaming .env.production → .env (one-time) ==="
  sudo mv "${REPO_DIR}/apps/api/.env.production" "${REPO_DIR}/apps/api/.env"
elif [ -f "${REPO_DIR}/apps/api/.env.production" ] && [ -f "${REPO_DIR}/apps/api/.env" ]; then
  echo "WARNING: both .env and .env.production exist. Using .env; .env.production is now ignored." >&2
fi

# ── Sync every systemd unit (API service + worker service/timer pairs) from
#    the repo so unit changes ship with ordinary deploys. cmp + conditional
#    reload avoids a needless daemon-reload when nothing changed.
UNITS_CHANGED=0
for unit in "${REPO_DIR}"/deploy/systemd/loudin-*.service \
            "${REPO_DIR}"/deploy/systemd/loudin-*.timer; do
  [ -e "${unit}" ] || continue
  name="$(basename "${unit}")"
  if ! cmp -s "${unit}" "/etc/systemd/system/${name}"; then
    echo "=== Refreshing systemd unit: ${name} ==="
    sudo cp "${unit}" "/etc/systemd/system/${name}"
    UNITS_CHANGED=1
  fi
done
if [ "${UNITS_CHANGED}" -eq 1 ]; then
  sudo systemctl daemon-reload
fi

# ── Make sure the worker timers are enabled and running. Idempotent, and
#    covers VMs set up before the timers existed (pre-2026-07 setup script).
for timer in "${REPO_DIR}"/deploy/systemd/loudin-*.timer; do
  [ -e "${timer}" ] || continue
  sudo systemctl enable --now "$(basename "${timer}")"
done

echo "=== Running database migrations ==="
NODE_ENV=production node database/scripts/migrate.js

echo "=== Restarting API service ==="
sudo systemctl restart loudin-api
sleep 2
sudo systemctl status loudin-api --no-pager

echo ""
echo "=== Health check ==="
sleep 3
curl -sf http://localhost:3000/health && echo " OK" \
  || echo " WARNING: health check failed — check logs with: journalctl -u loudin-api -n 50"

echo ""
echo "=== Deploy complete ==="
