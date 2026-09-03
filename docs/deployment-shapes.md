# Deployment shapes

Loudin serves two kinds of deployment from one codebase — there is no
"single-tenant mode" fork or build flag. The difference is a handful of
small configuration choices made at bootstrap time, and either shape can
grow into the other later without migration.

| | **Own doors** | **Service provider** |
|---|---|---|
| Who runs it | One company managing its own locks | An operator hosting the platform for many companies |
| Companies | Just the platform company | Platform + end-user companies |
| Open signup | Disabled (invite-only instance) | Enabled — companies self-register or arrive via invite |
| Bootstrap | `create-admin.js --shape own-doors` | `create-admin.js --shape service` |

## Shape 1 — your own doors

A single company self-hosts Loudin to manage its own locks, people, and
credentials. One company, one login, no tenant machinery in the way.

**Setup**

```bash
cd apps/api
node database/scripts/migrate.js
node scripts/create-admin.js \
  --email you@example.com \
  --password 'a-strong-password1' \
  --company-name 'Your Company' \
  --shape own-doors
```

`--shape own-doors` disables open self-service signup (it writes
`platform_config` key `signups.enabled='false'`, which overrides the
`SIGNUPS_ENABLED` env var). The instance is invite-only from first boot:
the signup page shows an "invite-only" notice, the login page hides its
"create account" link, and `POST /api/auth/register` (plus the Google
OAuth account-creation path) returns 403.

**Day-to-day**

You work signed in as the platform company's admin:

- **Devices → "Our devices"** — the same claim/manage view every tenant
  company gets, scoped to your own workspace: claim locks, name them, push
  credentials and schedules, send commands. The "Fleet" tab (all devices
  across the install) is still there but shows the same devices until a
  second company exists.
- **People** — your credential holders (the people who hold PINs and
  cards, no software login needed) and their credentials.
- Directory, Device Testing, API access, and the rest of the
  platform-admin surface remain available; they simply have nothing
  multi-tenant to show yet.

**What sits unused**

The multi-tenant machinery (Directory of companies, impersonation) is
present but idle. It costs nothing and does not get in the way — the
backend was already generically company-scoped, so "own doors" is just the
platform company using the same paths every tenant uses.

## Shape 2 — a service for other companies

An operator (typically a software provider or integrator) hosts Loudin as
a product. End-user companies own the locks; the operator's platform
company administers every one of them directly.

**Setup**

```bash
cd apps/api
node database/scripts/migrate.js
node scripts/create-admin.js \
  --email admin@your-platform.example \
  --password 'a-strong-password1' \
  --company-name 'Your Platform' \
  --shape service
```

`--shape service` leaves open signup enabled (`SIGNUPS_ENABLED` defaults
to `true`). From there:

- End-user companies **self-register** at `/signup`, or a platform admin
  creates them from the Directory.
- The platform company can still manage doors of its own (People +
  Devices → "Our devices") — for example the locks on the operator's own
  office.

If you host a service but onboard customers manually, you can close open
signup (`SIGNUPS_ENABLED=false` or a `platform_config` row
`signups.enabled='false'`) and create each company from the Directory.

## Growing from own-doors into a service provider

No migration, no re-deploy — the shapes differ only in config:

1. **Re-open signups** (if you want self-registration): delete the
   override row —
   ```sql
   DELETE FROM platform_config WHERE key = 'signups.enabled';
   ```
   — or set it to `'true'`. Ensure `SIGNUPS_ENABLED` in `apps/api/.env`
   isn't `false`. Alternatively keep signups closed and create each
   company from the Directory.
2. **Add companies**: they self-register at `/signup`, or you create them
   from the platform Directory.
3. **Your existing doors stay where they are** — they belong to the
   platform company and remain manageable under Devices → "Our devices".
   If you'd rather they live in a separate end-user company (e.g. to dogfood
   the tenant experience), release them and re-claim from that company.

## Related

- [`/README.md`](../README.md) — quick start
- [`apps/api/scripts/create-admin.js`](../apps/api/scripts/create-admin.js) — first-admin bootstrap
- `apps/api/.env.example` — `SIGNUPS_ENABLED` and friends
