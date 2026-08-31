## What & why

What does this PR change, and why? Link the related issue if there is one.

## How was this tested?

e.g. `npm test` in `apps/api` against a seeded local DB, `npm run typecheck` / `npm run build` in `apps/web`, manual steps in the UI.

## Checklist

- [ ] Tests pass locally (`cd apps/api && npm test`; `cd apps/web && npx tsc --noEmit && npm run build`)
- [ ] Behavior changes are covered by tests
- [ ] No secrets, real credentials, or personal data in the diff
- [ ] Schema changes are **new** migration files only (existing migrations are hash-checked — never edited)
