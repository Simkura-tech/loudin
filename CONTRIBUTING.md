# Contributing

Thanks for your interest in contributing. This document covers local setup, how to run the tests, and what we look for in pull requests.

## Development setup

Prerequisites: **Node.js 20+** and **PostgreSQL**.

```bash
# API (Express, port 3000)
cd apps/api
npm install
cp .env.example .env                              # fill in your DB credentials
node database/scripts/init-db.js --reset --seed   # drops, recreates, migrates, seeds
npm start                                         # or: npm run dev (nodemon)

# Web (React + Vite, port 8081) — in a second terminal
cd apps/web
npm install
cp .env.example .env
npm run dev
```

The seed creates working development logins (one admin per company type) — see the README and `apps/api/database/seeds/seed.sql` for the accounts.

You don't need Simkura API credentials to work on most of the codebase; device commands will fail gracefully without them.

## Running tests

**API** — the test suite hits a real local PostgreSQL and expects the seeded database:

```bash
cd apps/api
npm run db:reset    # fresh seeded DB
npm test            # node --test (pretest runs pending migrations)
```

**Web** — there is no unit test suite yet; the checks are the type-check and a production build:

```bash
cd apps/web
npx tsc --noEmit    # or: npm run typecheck
npm run build
```

Please run the relevant checks before opening a PR.

## Database changes

The schema is built entirely from `apps/api/database/migrations/`, applied in filename order. To change the schema, **add a new migration file** (`NNN_short_description.sql`, next number after the highest existing one). **Never edit an already-committed migration** — the runner records a content hash for each applied file, so edited migrations will be flagged on every existing install. See `apps/api/database/README.md`.

## Pull requests

- **Keep PRs small and focused.** One change per PR is much easier to review than a grab-bag.
- **Explain the why**, not just the what, in the PR description.
- **Behavior changes need tests.** If you change what the API does, extend the tests in `apps/api/test/`.
- New features that touch multi-tenant boundaries (company scoping, auth) get extra scrutiny — see [SECURITY.md](./SECURITY.md).

For anything substantial, consider opening an issue first to discuss the approach before writing code.

## Where contributions are most welcome

The most common contribution surface is **integrations** — connecting this platform to other systems via its outbound webhooks and REST API. Start with [docs/integrations/adding-an-integration.md](./docs/integrations/adding-an-integration.md).

## Security issues

Do **not** open a public issue for vulnerabilities — see [SECURITY.md](./SECURITY.md) for the private reporting path.
