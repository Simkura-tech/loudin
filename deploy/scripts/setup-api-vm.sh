#!/usr/bin/env bash
# =============================================================================
# One-time setup for the API VM (Node.js + systemd, no Docker)
# Run as root on a fresh Debian/Ubuntu GCP VM.
#
# Usage: bash setup-api-vm.sh <domain> <email> <cloud-sql-connection>
# Example: bash setup-api-vm.sh api.example.com admin@example.com myproject:us-central1:mydb
# =============================================================================
set -euo pipefail

DOMAIN="${1:-api.yourdomain.com}"
EMAIL="${2:-you@yourdomain.com}"
CLOUD_SQL_CONNECTION="${3:-your-project:us-central1:your-instance}"
REPO_DIR="/opt/loudin"

echo "=== [1/6] Installing Node.js 22 ==="
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

echo "=== [2/6] Installing Nginx and Certbot ==="
apt-get install -y nginx certbot python3-certbot-nginx
systemctl enable nginx

echo "=== [3/6] Installing Cloud SQL Auth Proxy ==="
curl -fsSL -o /usr/local/bin/cloud-sql-proxy \
  https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.1/cloud-sql-proxy.linux.amd64
chmod +x /usr/local/bin/cloud-sql-proxy

cat > /etc/systemd/system/cloud-sql-proxy.service << EOF
[Unit]
Description=Cloud SQL Auth Proxy
After=network.target

[Service]
ExecStart=/usr/local/bin/cloud-sql-proxy \
  --address=127.0.0.1 \
  --port=5432 \
  ${CLOUD_SQL_CONNECTION}
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cloud-sql-proxy

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable cloud-sql-proxy
systemctl start cloud-sql-proxy
echo "Cloud SQL Proxy status:"
systemctl status cloud-sql-proxy --no-pager

echo "=== [4/6] Installing API dependencies ==="
cd "${REPO_DIR}/apps/api"
npm ci --omit=dev

echo "=== [5/6] Installing systemd units (API service + worker timers) ==="
cp "${REPO_DIR}"/deploy/systemd/loudin-*.service /etc/systemd/system/
cp "${REPO_DIR}"/deploy/systemd/loudin-*.timer   /etc/systemd/system/
systemctl daemon-reload
systemctl enable loudin-api
# Worker timers (webhook retries, scheduled cancellations). Enabled now;
# they start doing useful work once .env exists and the first deploy has run.
for timer in "${REPO_DIR}"/deploy/systemd/loudin-*.timer; do
  systemctl enable "$(basename "$timer")"
done

echo "=== [6/6] Configuring Nginx and SSL ==="
sed "s|api.yourdomain.com|${DOMAIN}|g" \
  "${REPO_DIR}/deploy/nginx/api.conf" \
  > /etc/nginx/sites-available/loudin-api
ln -sf /etc/nginx/sites-available/loudin-api \
       /etc/nginx/sites-enabled/loudin-api
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}"
systemctl reload nginx

echo ""
echo "=== Setup complete ==="
echo "Next steps:"
echo "  1. Copy ${REPO_DIR}/apps/api/.env.example"
echo "         → ${REPO_DIR}/apps/api/.env  and fill in real secrets."
echo "  2. Run: bash ${REPO_DIR}/deploy/scripts/deploy-api.sh"
