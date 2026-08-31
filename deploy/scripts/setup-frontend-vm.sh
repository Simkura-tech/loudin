#!/usr/bin/env bash
# =============================================================================
# One-time setup for the Frontend VM (Nginx serving static files, no Docker)
# Run as root on a fresh Debian/Ubuntu GCP VM.
#
# Usage: bash setup-frontend-vm.sh <domain> <email> <api-url>
# Example: bash setup-frontend-vm.sh app.example.com admin@example.com https://api.example.com
# =============================================================================
set -euo pipefail

DOMAIN="${1:-app.yourdomain.com}"
EMAIL="${2:-you@yourdomain.com}"
API_URL="${3:-https://api.yourdomain.com}"
REPO_DIR="/opt/loudin"

echo "=== [1/4] Installing Node.js 22 ==="
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

echo "=== [2/4] Installing Nginx and Certbot ==="
apt-get install -y nginx certbot python3-certbot-nginx
systemctl enable nginx

echo "=== [3/4] Writing frontend env and building ==="
# Store the API URL so future deploys don't need it passed as an argument
echo "VITE_API_BASE_URL=${API_URL}" > "${REPO_DIR}/apps/web/.env.production"

cd "${REPO_DIR}/apps/web"
npm ci
npm run build

echo "=== [4/4] Configuring Nginx and SSL ==="
sed "s|app.yourdomain.com|${DOMAIN}|g; s|REPO_DIR|${REPO_DIR}|g" \
  "${REPO_DIR}/deploy/nginx/frontend.conf" \
  > /etc/nginx/sites-available/loudin-frontend
ln -sf /etc/nginx/sites-available/loudin-frontend \
       /etc/nginx/sites-enabled/loudin-frontend
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}"
systemctl reload nginx

echo ""
echo "=== Setup complete. Frontend is live at https://${DOMAIN} ==="
echo "Future deploys: bash ${REPO_DIR}/deploy/scripts/deploy-frontend.sh"
