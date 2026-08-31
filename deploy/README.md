# Loudin — GCP Deployment Runbook

Operational runbook for deploying Loudin to GCP. For the *why* behind the architecture, see [`../docs/operations/deployment.md`](../docs/operations/deployment.md).

This production deployment uses **systemd + Nginx + Node directly** — no Docker in production (the repo's `docker-compose.yml` is for local evaluation/development only).

---

## Architecture (TL;DR)

```
Internet
  │
  ├─ app.yourdomain.com ──► Frontend VM (e2-micro)
  │                          └─ Nginx :443 → serves /opt/loudin/apps/web/dist/
  │
  └─ api.yourdomain.com ──► API VM (e2-small)
                             ├─ Nginx :443 → 127.0.0.1:3000
                             ├─ systemd: loudin-api.service (Node)
                             └─ systemd: cloud-sql-proxy.service → Cloud SQL
```

---

## Prerequisites

- GCP project with billing enabled
- Two GCP VM instances (see VM Setup below)
- Cloud SQL PostgreSQL instance
- Domain name with DNS access
- SSH access to both VMs

---

## Step 1 — GCP Setup

### Create Cloud SQL Instance

1. GCP Console → SQL → Create Instance → PostgreSQL
2. Choose the region closest to your VMs
3. Note the **connection name** (format: `project:region:instance`)
4. Under "Connections" → enable **Private IP** and/or allow the API VM's IP under "Authorized networks"
5. Create a database (e.g. `loudin`)
6. Set a strong password for the `postgres` user

### Create VM Instances

**Frontend VM** (e2-micro, ~$6/month):
- Boot disk: Debian 12
- Allow HTTP and HTTPS traffic
- No special service account needed

**API VM** (e2-small, ~$17/month):
- Boot disk: Debian 12
- Allow HTTPS traffic
- **Service account**: attach one with the `Cloud SQL Client` IAM role
  - GCP Console → IAM → Service Accounts → Create
  - Grant role: `Cloud SQL Client`
  - Attach to the VM under "Identity and API access"

### Create Static IPs

GCP Console → VPC Network → External IP addresses → Reserve. Assign one to each VM.

---

## Step 2 — DNS

| Record | Type | Value |
|--------|------|-------|
| `app.yourdomain.com` | A | `<frontend-vm-static-ip>` |
| `api.yourdomain.com` | A | `<api-vm-static-ip>` |

Verify with `dig app.yourdomain.com` before continuing.

---

## Step 3 — Clone Repo on Both VMs

SSH into each VM:

```bash
sudo mkdir -p /opt/loudin
sudo chown $USER:$USER /opt/loudin
git clone https://github.com/simkura-tech/loudin.git /opt/loudin
```

---

## Step 4 — One-Time VM Setup

### Frontend VM

```bash
sudo bash /opt/loudin/deploy/scripts/setup-frontend-vm.sh \
  app.yourdomain.com \
  you@yourdomain.com \
  https://api.yourdomain.com
```

This installs Node.js 22, Nginx, and Certbot; writes `apps/web/.env.production` with the API URL; builds the frontend; configures Nginx with Let's Encrypt SSL.

### API VM

```bash
# CLOUD_SQL_CONNECTION format: project:region:instance
sudo bash /opt/loudin/deploy/scripts/setup-api-vm.sh \
  api.yourdomain.com \
  you@yourdomain.com \
  your-project:us-central1:your-instance
```

This installs Node.js 22, Nginx, Certbot, and the Cloud SQL Auth Proxy; installs and enables the `loudin-api` systemd unit; configures Nginx with SSL.

Then create the env file on the API VM:

```bash
cp /opt/loudin/apps/api/.env.example \
   /opt/loudin/apps/api/.env
nano /opt/loudin/apps/api/.env
```

Required values (override the dev defaults in `.env.example`):
- `NODE_ENV=production`
- `DB_HOST=127.0.0.1` (the Cloud SQL Auth Proxy)
- `DB_PORT=5432` (the Cloud SQL Auth Proxy's local port)
- `DB_PASSWORD` — your Cloud SQL postgres password
- `JWT_SECRET` — generate with `openssl rand -base64 48`
- `CORS_ORIGIN=https://app.yourdomain.com`
- `FRONTEND_URL=https://app.yourdomain.com`
- Your live Simkura API credentials (and any other API keys your deployment uses)

---

## Step 5 — First Deploy

The API VM's first deploy runs migrations and starts the service:

```bash
bash /opt/loudin/deploy/scripts/deploy-api.sh
```

The frontend VM is already serving content from `setup-frontend-vm.sh`, but you can re-run the deploy script any time to pull and rebuild:

```bash
bash /opt/loudin/deploy/scripts/deploy-frontend.sh
```

---

## Step 6 — Verify

```bash
# API VM
systemctl status loudin-api --no-pager
systemctl status cloud-sql-proxy --no-pager
systemctl list-timers 'loudin-*' --no-pager   # webhook retries + nightly workers
curl http://localhost:3000/health

# From browser
# https://app.yourdomain.com  → frontend loads
# https://api.yourdomain.com/health  → { "status": "ok" }
```

Log in with seeded test credentials to confirm DB + auth are working.

---

## Ongoing Deployments

```bash
# API
ssh api-vm "bash /opt/loudin/deploy/scripts/deploy-api.sh"

# Frontend
ssh frontend-vm "bash /opt/loudin/deploy/scripts/deploy-frontend.sh"
```

`deploy-api.sh` runs migrations automatically — no separate migration step needed.

---

## Troubleshooting

### API won't start

```bash
systemctl status loudin-api --no-pager
journalctl -u loudin-api -n 100 --no-pager
```

Common causes:
- Missing `.env` or missing required vars → check `apps/api/.env.example` for the full list
- DB connection refused → check the Cloud SQL Proxy (next section)
- Port 3000 in use → `ss -tlnp | grep 3000`

### Cloud SQL Proxy not connecting

```bash
systemctl status cloud-sql-proxy --no-pager
journalctl -u cloud-sql-proxy -n 50 --no-pager

# Verify the VM service account has the right role
gcloud projects get-iam-policy YOUR_PROJECT --flatten="bindings[].members" \
  --filter="bindings.role=roles/cloudsql.client"

# Verify the proxy is listening
ss -tlnp | grep 5432
```

### SSL certificate issues

```bash
sudo certbot certificates           # status of all certs
sudo certbot renew --dry-run        # test the renewal path
systemctl list-timers | grep certbot # confirm the renewal timer is active
```

### Database connection refused (from the API)

```bash
# Check the proxy is up
ss -tlnp | grep 5432

# Test directly from the API VM
node -e "require('/opt/loudin/apps/api/database/db').pool.query('SELECT 1').then(r => console.log('OK', r.rows)).catch(console.error)"
```

### CORS errors in the browser

Verify `CORS_ORIGIN` in `.env` exactly matches `https://app.yourdomain.com` (no trailing slash). Restart the API: `systemctl restart loudin-api`.

---

## File Structure

```
deploy/
├── nginx/
│   ├── frontend.conf         # Host Nginx for frontend VM
│   └── api.conf              # Host Nginx for API VM (WebSocket support)
├── scripts/
│   ├── setup-frontend-vm.sh  # One-time VM setup
│   ├── setup-api-vm.sh       # One-time VM setup + Cloud SQL Proxy
│   ├── deploy-frontend.sh    # git pull → npm ci → vite build → nginx reload
│   └── deploy-api.sh         # git pull → npm ci → migrations → systemctl restart
├── systemd/
│   ├── loudin-api.service                      # The API itself
│   ├── loudin-deliver-webhooks.{service,timer} # Webhook delivery retries (every minute)
│   └── loudin-scheduled-cancellations.{service,timer} # Due cancellations (02:00 UTC)
└── README.md                 # This file
```

All units are installed by `setup-api-vm.sh` and kept in sync on every
`deploy-api.sh` run (which also enables the timers, so VMs set up before the
timers existed pick them up on their next deploy).

### Worker timers

| Timer | Schedule | What it runs |
|-------|----------|--------------|
| `loudin-deliver-webhooks` | every minute | Retries failed outbound webhook deliveries (`apps/api/scripts/deliver-webhooks.js`) |
| `loudin-scheduled-cancellations` | 02:00 UTC nightly | Flips companies whose `cancel_effective_at` has passed (`apps/api/scripts/process-scheduled-cancellations.js`) |

```bash
# Inspect a worker's last run
journalctl -u loudin-deliver-webhooks -n 50 --no-pager
systemctl list-timers 'loudin-*' --no-pager
```

> **Note:** two more background workers run *inline in the API process*
> (not as timers): Simkura device discovery and Simkura state sync — started
> from `server.js`, logged under `loudin-api`. See "Background jobs" in the
> root `CLAUDE.md` for the consolidation direction.
