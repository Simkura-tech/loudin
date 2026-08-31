# Integrations

External service integrations that are not device hardware. Hardware (Simkura)
lives in [`../hardware/`](../hardware/README.md).

```
integrations/
├── events.js   # lifecycle event emitter → outbound webhook dispatcher
├── google/     # Google OAuth (sign in with Google)
├── resend/     # Resend (transactional email) — integration descriptor
└── twilio/     # Twilio (SMS) — integration descriptor
```

## Adding an integration

Integrations with platform-admin-editable settings (the cards on the
**API access → Integrations** tab) are registry-driven: write one
`integrations/<name>/integration.js` descriptor and register it in
`services/platform/integrationRegistry.js`. See
[`docs/integrations/adding-an-integration.md`](../../../docs/integrations/adding-an-integration.md)
for the descriptor contract; `resend/` and `twilio/` are worked examples.

## Outbound webhooks

Outbound lifecycle events are delivered to endpoints registered on the
platform-admin **Webhooks** tab (durable + retried delivery via
`integrations/events.js` → `services/webhooks/dispatcher.js`).
