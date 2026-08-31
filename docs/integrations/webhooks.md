# Outbound Webhooks

Loudin POSTs signed lifecycle events to URLs you register. This is the
**single** outbound webhook system — any external consumer receives events by
being registered here as an endpoint. Distinct from the inbound receivers
Loudin exposes (e.g. for Simkura, `apps/api/routes/webhooks.js`).

Manage endpoints under **Platform → API access & webhooks**.

---

## How it works

- An admin registers an **endpoint** (`webhook_endpoints`): a name, an https URL,
  a subscribed set of event types, and a generated signing secret.
- When a subscribed event fires, `integrations/events.js` builds one envelope and
  fans it out to every subscribed endpoint. Each endpoint gets a row in
  `webhook_deliveries`.
- Delivery is attempted immediately. Failures are retried by
  `scripts/deliver-webhooks.js` (run every minute via cron / systemd timer) with
  backoff **30s → 2m → 10m → 1h → 6h**, up to `max_attempts` (default 6), then the
  row is marked `exhausted`. Admins can **redeliver** a failed/exhausted row.

The single source of new event types is `services/platform/webhookEndpoints.js`
(`ALLOWED_EVENT_TYPES`) — keep it in sync with the emit sites.

## Request

`POST <your endpoint URL>`

**Headers**
- `Content-Type: application/json`
- `X-Loudin-Signature: sha256=<hex>` — HMAC-SHA256 of the raw body, keyed with the
  endpoint's signing secret
- `X-Loudin-Event: <event.type>`
- `X-Loudin-Event-Id: <uuid>` — stable across all endpoints for one event; use as
  your idempotency key
- `X-Loudin-Delivery: <int>` — the delivery-attempt-set id (changes per endpoint)

**Envelope**
```json
{
  "event_id":    "<uuid>",
  "type":        "<event.type>",
  "occurred_at": "<ISO-8601>",
  "company":     { "id": 0, "type": "platform|reseller|end_user" },
  "reseller":    { "company_id": 0 },
  "actor":       { "user_id": 0 },
  "device":      { "device_id": "..." }
}
```
Sub-objects are present only when relevant to the event (see the catalog).

## Verifying the signature

```js
const crypto = require('crypto');
function verify(rawBody, header, secret) {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
```
Compute over the **raw** request body, before any JSON re-serialization.

Respond `2xx` to acknowledge. Any non-2xx (or a timeout, default 5s) is treated as
a failure and retried.

## Event catalog

| Event `type` | Extra payload | Fires when |
|--------------|---------------|------------|
| `company.signed_up` | — | a company self-registers |
| `company.first_person_added` | `person.person_id` | the company's first credential holder is created |
| `device.added` | `device.device_id` | a device is claimed |
| `device.removed` | `device.device_id` | a device is released |
| `device.offline_extended` | `device.{ device_id, last_seen, offline_hours }` | a claimed device hasn't been seen for `SIMKURA_OFFLINE_ALERT_HOURS` (default 48) — once per offline episode |

Door/access (`device_events`) subscriptions are deferred (higher volume).

There is deliberately **no `user.logged_in` event** — per-login webhooks are
too high-volume relative to the signal they carry.

## Env

```env
WEBHOOK_TIMEOUT=5000       # per-delivery HTTP timeout (ms)
WEBHOOK_BATCH_SIZE=100     # rows the retry worker claims per run
```

## Operational notes

- Retry worker: `node apps/api/scripts/deliver-webhooks.js` — idempotent,
  concurrency-safe (`FOR UPDATE SKIP LOCKED` + a 5-minute claim lease). Runs
  every minute in production via the `loudin-deliver-webhooks` systemd timer
  (`deploy/systemd/`, installed by setup and kept in sync by `deploy-api.sh`).
- Secrets are stored in plaintext (required to sign) and shown in the UI; rotate via
  the endpoint's **Rotate** action.
- Deleting an endpoint is a soft-disable — delivery history is retained; in-flight
  rows for a disabled endpoint are marked `exhausted` on the next worker pass.
