# Loudin Application

Multi-tenant access-control platform for managing IoT door locks via Simkura's REST API. Node.js/Express backend, React frontend, PostgreSQL, with two company types (platform / end-user).

For deeper docs, the authoritative index is **[`docs/README.md`](./docs/README.md)**. This file is the quick-start orientation only.

---

## Quick Start

### Tech Stack

- **Backend**: Node.js 20+ (production VMs run 22), Express 5, PostgreSQL
- **Frontend**: React 18, Vite 5
- **Devices**: Simkura REST API (`SIMKURA_API_URL` / `SIMKURA_API_KEY`) — commands out, webhooks + polling in. Loudin does not connect to MQTT directly.

### Running locally

```bash
# Backend (port 3000)
cd apps/api && npm start

# Frontend (port 8081)
cd apps/web && npm run dev
```

### Seeded development users

The seed (`apps/api/database/seeds/seed.sql`) creates one Admin per company:

| Role / Context | Email | Company |
|----------------|-------|---------|
| Platform admin | `platform-admin@loudin.com` | Loudin Platform (`platform`) |
| End-user company admin | `admin@democorp.example` | Demo Customer Co (`end_user`) |
| Second end-user admin | `admin@brookline.example` | Brookline Coworking (`end_user`) |

---

## Role & Company Model

Two user types. What kind of admin a user is (platform / end-user) is determined by their **company's** `company_type`, not by a separate user_type_id.

| user_type_id | Name | Scope |
|--------------|------|-------|
| 1 | **Admin** | Company-scoped — UI / permissions depend on `company.company_type` |
| 2 | **User** | Regular logged-in user (non-admin) |

**Company types** (`companies.company_type`) — there are exactly two:

- `platform` — the platform operator (a software provider/integrator, or a single company running its own doors). An Admin here is the "platform admin", who administers every end-user company directly.
- `end_user` — Customer companies that own and use the locks.

There is **no reseller tier** — it was removed in migration `090_remove_reseller_type.sql`. The `companies.parent_company_id` / `parent_locked_at` columns remain but are unused (always NULL), reserved for a possible future parent/child relationship.

Door-access **credential holders** (people who just need a PIN or card to open a door, with no software login) live in the `people` table, not `users`.

---

## Project Structure

```
Loudin/
├── apps/
│   ├── api/                 # Backend (Express 5)
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── services/
│   │   ├── hardware/        # Simkura device integration (see hardware/README.md)
│   │   ├── integrations/    # Non-hardware integrations (Google OAuth, webhook events)
│   │   └── database/
│   │       ├── migrations/  # see database/README.md
│   │       ├── seeds/
│   │       │   └── seed.sql
│   │       └── scripts/
│   │           ├── migrate.js
│   │           └── init-db.js
│   └── web/                 # React + Vite
├── deploy/                  # Production deploy (systemd, no Docker)
├── docs/
│   ├── integrations/        # Outbound webhooks reference
│   └── operations/          # Deployment architecture
└── CLAUDE.md
```

---

## Background jobs

Two scheduling patterns coexist:

- **External systemd timers** (`deploy/systemd/`, deploy-independent, `Persistent` catch-up, runnable by hand) — e.g. outbound-webhook delivery retries (`apps/api/scripts/deliver-webhooks.js`, every minute) and nightly maintenance jobs such as processing scheduled company cancellations.
- **Inline in the API process** (started from `server.js`) — Simkura device discovery and Simkura state sync. These restart with every deploy and would need leader election if the API is ever HA'd.

If consolidating, prefer moving inline workers out to timers, not the reverse.

---

## Deployment

Production reference setup runs on **GCP VMs with systemd** (no Docker).

- See [`docs/operations/deployment.md`](./docs/operations/deployment.md) for architecture
- See [`deploy/README.md`](./deploy/README.md) for the operational runbook
- API service unit: `deploy/systemd/loudin-api.service`
- Deploy scripts: `deploy/scripts/deploy-api.sh`, `deploy-frontend.sh` (migrations run as part of `deploy-api.sh`)

---

## Environment Variables (`apps/api/.env`)

Copy `apps/api/.env.example` to `.env` and fill in values. Key variables:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=loudin
DB_USER=postgres
DB_PASSWORD=...

# JWT
JWT_SECRET=...
JWT_EXPIRE=24h

# Simkura (platform-level credentials)
SIMKURA_API_URL=https://api.simkura.com
SIMKURA_API_KEY=...
SIMKURA_WEBHOOK_SECRET=...

# URLs
FRONTEND_URL=http://localhost:8081
CORS_ORIGIN=http://localhost:8081

# Server
PORT=3000
NODE_ENV=development
```

See `apps/api/.env.example` for the full annotated list.

---

## Troubleshooting

### Role / company-type access

```sql
SELECT u.id, u.first_name, u.last_name, u.email,
       ut.name AS user_role, c.name AS company, c.company_type
FROM users u
JOIN user_types ut ON ut.id = u.user_type_id
JOIN companies  c  ON c.id  = u.company_id
ORDER BY c.company_type, u.id;
```

A user's permission tier comes from BOTH `user_type_id` (Admin or User) AND the user's `company.company_type` (platform / end_user). The combination is what determines UI and access.

### Inspecting credentials and devices

```sql
-- People in a company and what credentials they hold
SELECT p.first_name, p.last_name, p.email, c.credential_type, c.status
FROM people p
LEFT JOIN credentials c ON c.person_id = p.id
WHERE p.company_id = $1;

-- Which credentials/shifts/holidays are pushed to each device
SELECT d.device_name,
       COUNT(DISTINCT dc.credential_id) AS credential_count,
       COUNT(DISTINCT ds.shift_id)      AS shift_count,
       COUNT(DISTINCT dh.holiday_id)    AS holiday_count
FROM devices d
LEFT JOIN device_credentials dc ON dc.device_id = d.id
LEFT JOIN device_shifts      ds ON ds.device_id = d.id
LEFT JOIN device_holidays    dh ON dh.device_id = d.id
WHERE d.company_id = $1
GROUP BY d.id, d.device_name;
```

### Fresh local database

```bash
cd apps/api
node database/scripts/init-db.js --reset --seed
```

This drops the database named in `.env`, recreates it, runs all migrations, and applies `seeds/seed.sql`.

### Browser caching after route changes

Hard refresh (`Ctrl+Shift+R`) or DevTools → Network → "Disable cache". Express route ordering matters — specific routes must be declared before generic ones.

### Vite cache after frontend reorganization

```bash
rm -rf apps/web/node_modules/.vite
```
