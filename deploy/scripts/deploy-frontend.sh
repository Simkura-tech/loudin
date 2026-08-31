#!/usr/bin/env bash
# =============================================================================
# Deploy script for the Frontend VM
# Pulls latest code, builds, reloads Nginx.
# API URL is read from apps/web/.env.production (set during initial setup).
# =============================================================================
set -euo pipefail

REPO_DIR="/opt/loudin"

echo "=== Pulling latest code from main ==="
cd "${REPO_DIR}"
git pull origin main

echo "=== Installing dependencies ==="
cd "${REPO_DIR}/apps/web"
npm ci

echo "=== Building frontend ==="
npm run build

echo "=== Reloading Nginx ==="
sudo systemctl reload nginx

echo ""
echo "=== Deploy complete ==="
