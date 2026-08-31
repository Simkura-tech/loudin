# Database

Single source of truth: **the migration files in `migrations/`**. No schema.sql snapshot — running the migrations in order is how the schema is built.

## Quick start

```bash
# From apps/api/, with a fresh empty Postgres DB matching .env's DB_NAME:
npm run db:migrate

# Or full bootstrap (drops the DB if it exists, recreates, migrates, seeds):
node database/scripts/init-db.js --reset --seed
```

## Layout

```
database/
├── migrations/                # The schema, one migration per file,
│                              #   applied in filename order
├── seeds/
│   └── seed.sql               # Development seed (idempotent — bails out
│                              #   if any companies exist)
├── scripts/
│   ├── migrate.js             # Migration runner (tracks via `migrations` table)
│   └── init-db.js             # Wrapper: optional --reset, migrate, optional --seed
└── README.md
```

The development seed creates 3 companies (one per company type) with 3 admin
logins, plus demo people, groups, devices, credentials, and shifts — see the
header comment in `seeds/seed.sql` for the full inventory and the shared dev
password.

## How migrations work

`migrate.js` reads every `.sql` file in `migrations/` in alphabetical order.
After a migration succeeds, its filename **and a SHA-256 content hash** are
recorded in a `migrations` tracking table: re-runs skip already-applied files,
and an applied file whose content has changed is flagged rather than silently
ignored.

To add a new migration, drop a new file in `migrations/` named like
`NNN_short_description.sql`, using the next sequence number after the highest
existing one. **Never edit an already-applied migration** — write a new one
instead.

## Current schema

**Core entities**
- `companies` — tenants (`platform` / `reseller` / `end_user`). Parent-company hierarchy for reseller ownership; per-reseller Simkura credential columns; cancellation scheduling.
- `users` — software users with logins. Two roles: `Admin` (1) and `User` (2). What kind of admin (platform / reseller / end-user) is determined by their company's `company_type`.
- `user_types` — lookup table for the two roles.
- `people` — door-access credential holders. No software login.
- `devices` — door lock hardware. Nullable `company_id` (unclaimed pool). Carries the Simkura hardware `device_id`, live state, and firmware-reported counts.
- `credentials` — PIN/HID/MIFARE access tokens, owned by people. Unique per company.

**Access logic**
- `shifts` — recurring time-based access windows.
- `holidays` — datetime-range access overrides.
- `people_groups` — flat groupings of people for access-rule bundling.

**Device junctions**
- `device_credentials`, `device_shifts`, `device_holidays` — what is installed on each device. `applied_at` = recorded by us, `submitted_at` = accepted by Simkura, `synced_at` = confirmed. Soft-deleted rows drive credential-deactivation pushes.

**Events & integrations**
- `device_events` — inbound Simkura webhook events (access, lock state, power), deduped on the Simkura event id, linked to credentials/people where resolvable.
- `webhook_endpoints` / `webhook_deliveries` — outbound webhook registrations and their durable, retried delivery log (see `docs/integrations/webhooks.md`).
- `api_keys` — `ldn_live_…` service-to-service keys with scopes, for `/api/external/*`.
- `platform_config` — key/value platform settings: integration credential overrides, the signup toggle, and similar.

**Auth & compliance**
- `verification_codes` — email/SMS one-time codes (2FA, verification).
- `audit_log` — admin action audit trail.
- `documents` / legal-acceptance columns — terms-of-service and privacy acceptance tracking.

**Tracker**
- `migrations` — written/read by `migrate.js`. Don't insert into manually.

## Environment

`migrate.js` and `init-db.js` read from `apps/api/.env`:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=loudin
DB_USER=postgres
DB_PASSWORD=…
```

## Troubleshooting

**Migration fails mid-run**: each migration runs in its own transaction. A failed migration leaves the DB at the previous state. Fix the SQL, re-run `npm run db:migrate`.

**"Database does not exist"**:
```bash
node database/scripts/init-db.js --reset
```

**Want a clean DB**:
```bash
node database/scripts/init-db.js --reset --seed
```
