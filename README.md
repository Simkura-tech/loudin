# Loudin

Open-source access control management platform for IoT door locks.

Loudin is a multi-tenant web application for managing smart door locks, the people who use them, and the credentials that open them. It works with [Simkura](https://simkura.com) lock hardware: device communication happens over the Simkura REST API — commands go out over HTTPS, and device state comes back via webhooks and polling. Loudin never talks to devices directly, so there is no MQTT broker or device firmware to operate.

**Getting hardware:** Simkura locks and production API access are available at [simkura.com](https://simkura.com). You don't need hardware to evaluate Loudin — the app runs fully without it (device features sit inert), and a Simkura-hosted mock API for hardware-free device testing is planned.

**Who this is for:** self-hosters managing their own doors, and software providers / security integrators who want to run a branded access-control service for their customers without building a platform from scratch — see [white-labeling](#white-labeling) and [docs/deployment-shapes.md](./docs/deployment-shapes.md).

## Why "Loudin"?

The project is named in honor of **Frederick J. Loudin** (1836–1904), who
patented the key fastener — the ancestor of the keychain — in 1894
([US Patent 512,308](https://patents.google.com/patent/US512308A/en)). His
invention wasn't a convenience gadget: its stated purpose was keeping keys
secure and stopping intruders from tampering with locks. Loudin was also the
world-touring leader of the Jubilee Singers and a manufacturer in Ravenna,
Ohio — an inventor and entrepreneur who built all of it against the
headwinds of his era. Software that keeps keys safe seemed like a fitting
tribute.

## Features

- **Multi-tenant companies** — a three-tier hierarchy of platform, reseller, and end-user companies, each with scoped admin access
- **Device management** — claim, configure, and monitor IoT door locks through the Simkura REST API
- **People & credentials** — manage credential holders and their PIN codes and cards, and push them to specific devices
- **Schedules** — shifts and holidays control when credentials are valid, per device
- **Real-time events** — device events stream in via inbound webhooks and reach the UI over WebSocket (Socket.io); signed outbound webhooks let external systems subscribe to lifecycle events
- **Reseller tier** — optional partner companies that onboard and manage end-user customers via invite links; per-reseller Simkura account routing is designed into the schema (roadmap)

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20+ / Express 5 |
| Frontend | React 18 + Vite |
| Database | PostgreSQL |
| Devices | Simkura REST API (webhooks in, HTTPS commands out) |

## Deployment shapes

Loudin serves two deployments from one codebase — an operator **hosting it
as a service** for many companies, or a single company **managing its own
doors**. See [docs/deployment-shapes.md](./docs/deployment-shapes.md) for
what to configure for each and how an own-doors install grows into a
service provider.

## White-labeling

The frontend is built to ship under your brand: one typed config file
(`apps/web/src/branding.ts`) drives every product-name string, contact
email, and brand asset in the UI — edit it, swap three image files,
rebuild. The MIT license permits closed-source branded distributions.
[docs/white-label.md](./docs/white-label.md) is the step-by-step guide.

## Quick start

### Docker (one command)

The fastest way to evaluate Loudin — no local Node or PostgreSQL needed:

```bash
docker compose up --build
```

Then open **http://localhost:8081** and log in with the seeded platform admin:

| Email | Password |
|---|---|
| `platform-admin@loudin.com` | `Password123!` |

The seed also creates a reseller admin (`admin@acme-dist.example`) and an
end-user company admin (`admin@democorp.example`) with the same password,
plus demo people, devices, and credentials — see
`apps/api/database/seeds/seed.sql`.

First boot runs migrations and the dev seed automatically (both are
idempotent, so restarting the stack is safe). The web container's nginx
reverse-proxies `/api`, `/uploads`, and `/socket.io` to the API container,
so everything is served from the one port. The compose stack uses an
insecure development `JWT_SECRET` and is for evaluation only — see
[docs/operations/deployment.md](./docs/operations/deployment.md) for real
deployments.

### Manual setup

Prerequisites: Node.js 20+ (see `.nvmrc`), PostgreSQL.

```bash
# 1. Configure the API
cd apps/api
cp .env.example .env    # then fill in your values

# 2. Initialize the database (drops + recreates, runs migrations, seeds)
node database/scripts/init-db.js --reset --seed

# 3. Start the API (port 3000)
npm install
npm start

# 4. Start the frontend (port 8081)
cd ../web
npm install
npm run dev
```

### Production bootstrap

The dev seed above is for local hacking (fixture users, demo devices). On a
real deployment, run migrations and create the first platform admin with the
bootstrap script — it asks which deployment shape you're running and
configures the signup toggle accordingly:

```bash
cd apps/api
node database/scripts/migrate.js
node scripts/create-admin.js \
  --email you@example.com \
  --password 'a-strong-password1' \
  --company-name 'Your Company' \
  --shape own-doors    # or: service
```

## Optional services & degraded features

The core app (companies, people, credentials, schedules, the full admin UI)
runs with just Node and PostgreSQL. Integrations are optional, and each one
degrades predictably when unconfigured:

| Service | Without it |
|---|---|
| **Resend** (`RESEND_API_KEY`) | No real emails are sent. In development, password-reset links, verification codes, and login OTPs are printed to the API console/log instead, so those flows remain testable. |
| **Twilio** (`TWILIO_*`) | No SMS two-factor codes. Email-based 2FA still works. |
| **Simkura** (`SIMKURA_API_URL` / `SIMKURA_API_KEY`) | Device features are inert: no device discovery, state sync, or lock commands (`/api/health/simkura` reports `not_configured`). The rest of the UI works normally. Credentials can also be configured at runtime from the platform-admin **API access → Integrations** tab, which overrides the env vars. A mock Simkura API for hardware-free local development is planned. |
| **Google OAuth** (`GOOGLE_*`) | "Sign in with Google" is unavailable; email + password login still works. |

The API validates required configuration at boot
(`apps/api/config/validateEnv.js`): it fails fast with a clear message if
`DB_NAME`, `DB_PASSWORD`, or `JWT_SECRET` is missing, and refuses to start
in production with a known-placeholder `JWT_SECRET`. Optional services above
are never required.

## Documentation

See [docs/README.md](./docs/README.md) for the documentation index, including the outbound webhooks reference and the production deployment architecture. The operational deploy runbook lives in [deploy/README.md](./deploy/README.md).

## Contributing

Contributions are welcome — issues and pull requests appreciated.

## License

MIT — see [LICENSE](./LICENSE).
