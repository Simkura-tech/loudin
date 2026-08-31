# Adding a Platform Integration

Platform integrations are the settings cards on the platform-admin
**API access → Integrations** tab: external services (email, SMS, device
gateways, …) whose connection settings a platform admin can view, override,
and test from the UI — with the server's env vars as the always-working
fallback.

Adding one takes **one descriptor module and one registry line**. Everything
else — storage, env fallback, secret masking, the admin UI card, the REST
endpoints, audit logging — is generic and comes for free.

## 1. Write a descriptor

Pick a location by convention:

- **Hardware** (device/lock platforms): `apps/api/hardware/<name>/integration.js`
- **Services** (everything else): `apps/api/integrations/<name>/integration.js`

Worked examples to copy from:

- `apps/api/integrations/resend/integration.js` — simple service (email)
- `apps/api/integrations/twilio/integration.js` — service with multi-field credentials
- `apps/api/hardware/simkura/integration.js` — hardware, with a `reconfigure()` hook

The contract:

```js
'use strict';

module.exports = {
  // Slug: used in platform_config keys ("integration.<name>.<field>") and
  // URLs (/api/platform/integrations/<name>). Lowercase [a-z0-9_-].
  name: 'acme',

  // Shown on the admin card.
  label: 'Acme (widgets)',
  description: 'One or two sentences on what routes through this service.',
  docsUrl: 'https://acme.example/docs', // optional; rendered as a "Docs" link

  // Ordered — the UI renders fields in this order.
  fields: [
    {
      field: 'api_key',            // slug, [a-z0-9_]
      label: 'API key',
      secret: true,                // write-only: UI only ever sees "…abcd"
      env: ['ACME_API_KEY'],       // ordered env-var fallbacks (first non-empty wins)
      placeholder: 'ak_…',         // optional input placeholder
      help: 'Optional help text shown under the label.',
    },
    { field: 'base_url', label: 'Base URL', secret: false, env: ['ACME_BASE_URL'] },
  ],

  // Cheap and synchronous — called on every GET of the settings page.
  // `configured` drives the card's pill; any extra STRING values you add
  // are rendered as additional pills (make them display-ready, e.g.
  // region: 'EU').
  status() {
    return { configured: /* bool */ true };
  },

  // Live probe with the currently-effective settings ("Test connection"
  // button). Return { ok: true, latency_ms } or
  // { ok: false, reason?: 'not_configured' | 'bad_credentials', status?, error? }.
  // Throwing is fine too — the controller turns it into { ok: false, error }.
  // Keep timeouts short (axios `timeout: 8000` or less).
  async test() {
    return { ok: true, latency_ms: 42 };
  },

  // OPTIONAL. Called after settings are saved from the UI. Only needed if
  // your integration snapshots credentials at construction (like the
  // Simkura client singleton). If you resolve settings at call time
  // (recommended — see below), omit it.
  reconfigure() {},
};
```

## 2. Register it

Add one `require()` line to
`apps/api/services/platform/integrationRegistry.js`:

```js
const integrations = [
  require('../../hardware/simkura/integration'),
  require('../../integrations/resend/integration'),
  require('../../integrations/twilio/integration'),
  require('../../integrations/acme/integration'),   // ← yours
];
```

The list is explicit on purpose — no directory autoscan. List order is UI
card order. The registry validates every descriptor at boot and throws on
mistakes (bad slug, missing label/status/test, …), so a broken descriptor
fails fast instead of half-rendering.

## 3. Resolve your settings where you use them

In the code that actually talks to the service, resolve each field through
`integrationSettings` **at call time**:

```js
const settings = require('../../services/platform/integrationSettings');

const apiKey = settings.get('acme', 'api_key');
// → platform_config override if set, else ACME_API_KEY, else null
```

Resolving at call time means a value saved in the admin UI takes effect on
the next request with no restart and no `reconfigure()` hook — this is how
the notifier (`apps/api/services/notifications/notifier.js`) consumes the
`resend` and `twilio` integrations. Only reach for `reconfigure()` when a
client object caches credentials at construction.

Note: before `integrationSettings.init()` has completed (it runs at API
boot), `get()` only sees env vars. Standalone scripts/workers that want DB
overrides should `await settings.init()` first.

## What you get automatically

- A card on **API access → Integrations** with your label, description,
  docs link, status pill(s), one input per field with "env" / "override"
  source badges, save, clear-override, and a Test connection button.
- REST endpoints (platform-admin only, cookie auth):
  `GET /api/platform/integrations`, `PUT /api/platform/integrations/<name>`,
  `POST /api/platform/integrations/<name>/test`.
- Storage in `platform_config` (`integration.<name>.<field>`), with
  clearing a field reverting to env.
- Audit logging of updates (field names only — never values).
- Secret handling: `secret: true` fields are never echoed back; the UI only
  ever receives a masked hint (last 4 characters).

No frontend changes are needed — `PlatformIntegrationsPanel.tsx` renders
entirely from the GET response.

## Boundaries — read before adding fields

1. **Infra/bootstrap env must never become UI-editable.** Database
   connection settings, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`, `NODE_ENV`,
   and anything else the process needs *before* it can read the database
   stay env-only. Integrations are for external services the running app
   talks to — not for the app's own plumbing.
2. **Secrets are stored plaintext in `platform_config`.** That is the same
   trust level as `apps/api/.env` on the VM — acceptable today because the
   DB and the env file share an audience. Encryption-at-rest for these rows
   is a known hardening option; don't put anything in an integration field
   that you wouldn't put in `.env`.
