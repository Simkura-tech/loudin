# Deployment Overview

This document describes the production deployment architecture for Loudin — what runs where, why it was designed that way, and what to consider when making infrastructure changes. For the step-by-step operational runbook, see [`deploy/README.md`](../../deploy/README.md).

---

## Infrastructure at a Glance

Loudin runs on **Google Cloud Platform** across two small VMs and a managed database. There are no container orchestrators, no load balancers, and no cloud build pipelines — deployments are intentionally simple git-pull-and-restart operations run over SSH.

| Component | GCP Resource | Purpose |
|-----------|-------------|---------|
| Frontend | e2-micro VM | Serves the React SPA as static files via Nginx |
| API | e2-small VM | Runs the Node.js Express API as a systemd service |
| Database | Cloud SQL (PostgreSQL) | Managed PostgreSQL — no self-hosted DB |
| SSL | Let's Encrypt (Certbot) | Free TLS certificates, auto-renewing |
| DB Tunnel | Cloud SQL Auth Proxy | Secure, IAM-authenticated DB connection — no exposed DB port |

---

## Architecture

```
Internet
  │
  ├─ app.yourdomain.com ──► Frontend VM (e2-micro)
  │                          ├─ Nginx :80  → redirect to HTTPS
  │                          └─ Nginx :443 → serves /opt/loudin/apps/web/dist (static files)
  │
  └─ api.yourdomain.com ──► API VM (e2-small)
                             ├─ Nginx :80  → redirect to HTTPS
                             ├─ Nginx :443 → proxy_pass 127.0.0.1:3000
                             ├─ systemd: loudin-api.service (Node :3000, Express + Socket.io)
                             └─ systemd: cloud-sql-proxy.service
                                  └─ Listens on 127.0.0.1:5432
                                       └─ IAM-authenticated tunnel → Cloud SQL
```

### Why two VMs instead of one?

The frontend only serves static files — the Vite build output is just HTML, CSS, and JS. Separating it from the API means:

- Frontend deploys never touch the API (no downtime risk to API during a UI-only change)
- The frontend VM can be a cheaper e2-micro since it does very little compute
- If the API VM has an issue, the static frontend can still load (and show a helpful error)

### Why systemd instead of Docker?

The repo ships a `docker-compose.yml`, but that is for local evaluation and development. Production deliberately runs bare systemd instead:

- **Faster deploys** — no image build step; `git pull && npm ci --omit=dev && systemctl restart` finishes in seconds
- **Fewer moving parts** — no Docker daemon, no image registry, no `--add-host` gymnastics to reach the Cloud SQL proxy
- **Simpler logs** — `journalctl -u loudin-api` is the single source of truth
- **Smaller VM footprint** — no Docker overhead

The trade-off is less environment isolation, but in practice each VM only runs one application, so isolation was providing little value.

### Why Nginx in front of Node?

Node binds to `127.0.0.1:3000` only — never to a public port. The host Nginx is the only thing that faces the internet and handles:

- **SSL termination** — Certbot/Let's Encrypt certificates
- **HTTP → HTTPS redirect**
- **WebSocket proxying** — the `Upgrade`/`Connection` headers needed for Socket.io

SSL cert management is therefore independent of application deploys.

---

## How Each Piece Connects

### Frontend → API

The React app communicates with the API via `VITE_API_BASE_URL`, which is baked into the static build at build time (Vite replaces all `import.meta.env.VITE_*` references at compile). The value is read from `apps/web/.env.production`, which is written once by `setup-frontend-vm.sh`.

**This means**: changing the API URL requires rebuilding and redeploying the frontend.

### API → Database

The API does not reach Cloud SQL directly. Instead:

1. The **Cloud SQL Auth Proxy** runs as a systemd service on the API VM, listening on `127.0.0.1:5432`
2. It authenticates to GCP using the VM's attached service account IAM identity — no DB password in the tunnel
3. The API connects to `127.0.0.1:5432` (i.e. `DB_HOST=127.0.0.1` in `.env`)
4. The systemd unit declares `Requires=cloud-sql-proxy.service`, so the proxy is guaranteed to be up before the API starts

**This means**: the database is never exposed to the public internet, and there are no DB credentials in the connection tunnel — only IAM.

### API → External Services

All outbound connections from the API (e.g. the Simkura REST API) are standard HTTPS calls. No special networking is needed. Loudin does not connect to MQTT or any device cloud directly — device traffic flows through Simkura's HTTPS API.

### Socket.io (WebSockets)

Socket.io provides real-time progress updates during device configuration commands. The host Nginx `api.conf` includes `proxy_http_version 1.1`, `Upgrade`, and `Connection` headers; `proxy_read_timeout 86400` prevents long-lived connections from being dropped.

---

## Deployment Process

### How a deploy works

Both deployment scripts follow the same pattern:

**`deploy/scripts/deploy-api.sh`** (API VM):
1. `git pull origin main`
2. `npm ci --omit=dev`
3. Run pending migrations (`node database/scripts/migrate.js` with `NODE_ENV=production`)
4. `systemctl restart loudin-api`
5. Health check `http://localhost:3000/health`

**`deploy/scripts/deploy-frontend.sh`** (frontend VM):
1. `git pull origin main`
2. `npm ci`
3. `npm run build` (Vite outputs to `dist/`)
4. `systemctl reload nginx` (serves the new `dist/` directly)

API downtime during a restart is ~2–5 seconds. Frontend has effectively zero downtime — Nginx swaps to the new `dist/` on reload.

### Environment variables

The API reads its environment from `EnvironmentFile=/opt/loudin/apps/api/.env` in the systemd unit. This file lives on the VM only and is never committed (covered by `.gitignore`). The template is `apps/api/.env.example`.

The frontend's only env var (`VITE_API_BASE_URL`) is written to `apps/web/.env.production` during VM setup. Vite picks it up automatically at build time.

### Database migrations

Migrations run automatically as part of `deploy-api.sh` (step 3 above). They go through the Cloud SQL Auth Proxy on `127.0.0.1:5432`, just like normal API traffic.

**Convention**: always merge the migration commit before (or in the same PR as) the code that depends on it. The deploy script will then apply both in the correct order.

---

## Key Files Reference

| File | What it does |
|------|-------------|
| `apps/api/.env.example` | Template for all required env vars |
| `apps/web/.env.production` | Sets `VITE_API_BASE_URL` (written by `setup-frontend-vm.sh`) |
| `deploy/systemd/loudin-api.service` | systemd unit for the API |
| `deploy/nginx/api.conf` | Host Nginx for API VM — HTTPS, WebSocket headers |
| `deploy/nginx/frontend.conf` | Host Nginx for frontend VM — HTTPS, SPA fallback |
| `deploy/scripts/setup-api-vm.sh` | One-time VM setup: Node, Nginx, Certbot, Cloud SQL Proxy, systemd unit |
| `deploy/scripts/setup-frontend-vm.sh` | One-time VM setup: Node, Nginx, Certbot, build, reload |
| `deploy/scripts/deploy-api.sh` | git pull → npm ci → migrations → systemctl restart |
| `deploy/scripts/deploy-frontend.sh` | git pull → npm ci → vite build → nginx reload |

---

## Upgrade Considerations

### Changing the API domain

1. Update DNS A record to point to the new IP (or update existing IP)
2. Update `CORS_ORIGIN` and `FRONTEND_URL` in `.env` on the API VM
3. Update `VITE_API_BASE_URL` in `apps/web/.env.production` on the frontend VM and redeploy
4. Re-run `certbot --nginx -d new.domain.com` if the domain name itself changes

### Changing the database

1. Create the new Cloud SQL instance and run all migrations on it
2. Update `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` in `.env`
3. Update the Cloud SQL Auth Proxy systemd unit (`/etc/systemd/system/cloud-sql-proxy.service`) with the new connection name
4. `systemctl daemon-reload && systemctl restart cloud-sql-proxy`
5. `systemctl restart loudin-api`

### Upgrading Node.js version

1. Update the nodesource install line in `deploy/scripts/setup-api-vm.sh` and `setup-frontend-vm.sh` (currently `setup_22.x`)
2. Update `"engines": { "node": ">=20.0.0" }` in both `package.json` files
3. On each VM: `curl -fsSL https://deb.nodesource.com/setup_NN.x | sudo bash - && sudo apt-get install -y nodejs`
4. Restart services: `systemctl restart loudin-api` (API) / nothing extra (frontend — next deploy will pick up the new toolchain)

### Adding a new environment variable

1. Add it to `apps/api/.env.example` with a description
2. Add the real value to `.env` on the API VM
3. `systemctl restart loudin-api` — systemd re-reads `EnvironmentFile` on each start

### Scaling up (if needed in future)

The current architecture has a clear upgrade path if load grows:

- **API**: upgrade VM size (e2-small → e2-medium) with no architecture change; or add a second API VM behind a GCP Load Balancer and use Redis for Socket.io adapter state
- **Frontend**: migrate static files to Cloud Storage + Cloud CDN — zero VMs needed
- **Database**: Cloud SQL scales vertically (CPU/RAM) and supports read replicas

---

## Security Notes

- Node binds to `127.0.0.1` only — the API port is never directly reachable from the internet
- The API `.env` is never committed to git; secrets should also be stored in GCP Secret Manager as a backup
- The database has no public IP; the only path in is through Cloud SQL Auth Proxy + IAM
- SSL certificates auto-renew via Certbot's systemd timer (runs twice daily)
- The API VM's service account has only the `Cloud SQL Client` role — it cannot create/delete databases or access other GCP resources
- systemd runs the API as root currently — moving it to a dedicated user is a known hardening step (contributions welcome)
