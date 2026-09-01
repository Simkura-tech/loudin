# Simkura Device Integration

How Loudin talks to [Simkura](https://simkura.com) lock hardware. All device
traffic flows through Simkura's cloud REST API — Loudin never speaks MQTT or
connects to a device directly. Three channels:

1. **Outbound REST** — commands and reads against the Simkura API
2. **Inbound webhooks** — device events pushed to Loudin, signature-verified
3. **Polling workers** — device discovery and state sync, inline in the API process

Integration code lives in [`apps/api/hardware/simkura/`](../../apps/api/hardware/simkura/).

> **Status note:** Simkura's API is mid-transition from v1 (legacy, frozen)
> to v2 (resource-style — see [docs.simkura.com](https://docs.simkura.com)).
> Loudin's **reads run on v2**; **commands and webhook management remain on
> v1** until Simkura's v2 command surface leaves draft, then migrate too.

---

## Configuration

| Variable | Purpose |
|---|---|
| `SIMKURA_API_URL` | Base URL of the Simkura API |
| `SIMKURA_API_KEY` | Static API key, sent as `Authorization: Bearer …` on every call. Defaults to Simkura's **public sandbox key** (`sk_demo_simkura_sandbox` — read-only, three fixture devices, [documented here](https://docs.simkura.com/authentication/)); use your `sk_live_…` key for real hardware |
| `SIMKURA_WEBHOOK_SECRET` | HMAC secret for verifying inbound webhooks (from webhook registration) |
| `SIMKURA_API_TIMEOUT` | Per-request timeout, ms (default 10000) |
| `SIMKURA_RETRY_MAX_ATTEMPTS` / `_BASE_DELAY_MS` / `_MAX_DELAY_MS` / `_JITTER_MS` | Retry tuning (defaults 3 / 1000 / 8000 / 500) |

URL and key can also be set at runtime from the platform-admin
**API access → Integrations** tab; a value saved there (stored in
`platform_config`) wins over the env var, and clearing it reverts to env.
Timeout and retry knobs are env-only.

With no URL/key configured the client is inert: device features sit idle,
command endpoints return `503`, and the rest of the app works normally.

**Health check:** `GET /api/health/simkura` probes the API with the effective
credentials and reports `connected` / `not_configured` / an upstream status.

**Retry policy:** only network errors, timeouts, and HTTP ≥ 500 are retried
(exponential backoff with jitter). 4xx responses fail immediately — a bad
API key surfaces as an instant 401, not a hung request.

## Device identity

The canonical identifier everywhere is Simkura's **`device.id`** — an opaque
string (e.g. `nrf-352656…`) that matches the id in URLs and webhook
payloads. Loudin stores it as `devices.device_id` and uses it in all REST
paths below.

## Outbound REST calls

Reads use v2, commands and webhook management still v1:

| Method & path | Used for |
|---|---|
| `GET /api/v2/devices?limit&page` | Fleet list (paginated ×100 internally) — each item is the device "spine" (`meta`, `device`, `capabilities`); also the reachability probe |
| `GET /api/v2/devices/:id` | Full device resource **with state embedded** (v2 has no separate `/state` endpoint): per-door lock state and counts, power/battery, connectivity, firmware |
| `POST /api/v1/devices/:id/commands` | Enqueue a `bw*` command — **asynchronous**: 200 means accepted by Simkura, not delivered to the device. Migrates to v2's resource-style command endpoints when they leave draft |
| `GET /api/v1/devices/:id/queue` | The device's pending/processing command queue (Simkura-owned) |
| `GET/POST/PUT/DELETE /api/v1/webhooks…` | Webhook registration management, plus `/test`, `/regenerate-secret`, `/deliveries` (`/v2/webhooks` is not drafted yet) |

Commands are queued by Simkura and delivered when the device wakes — a
sleeping lock holds its queue until its next check-in.

## Inbound webhooks

Simkura POSTs device events to **`POST /api/webhooks/simkura`**.

- **Verification**: the `X-Webhook-Signature` header must equal the
  hex-encoded HMAC-SHA256 of the **raw request body**, keyed with
  `SIMKURA_WEBHOOK_SECRET`. Invalid or missing signature → `401`. This is
  the only gate — the route has no session auth.
- **Response contract**: Loudin ACKs `200 {"received": true}` immediately
  and processes the event asynchronously (Simkura expects a 2xx within 10s).
- **Idempotency**: events are inserted with
  `ON CONFLICT (simkura_event_id) DO NOTHING`, so Simkura's delivery retries
  never duplicate rows.

Every event is stored in `device_events`, routed to the owning company by
the device's hardware id. For access events, the presented PIN or
card number is value-matched against the company's `credentials` so the
activity feed can show *who* opened the door.

| Event type | Effect on the device row |
|---|---|
| `lock.state_changed` | Updates `door_state` (`locked`/`unlocked`/`lockdown`), marks online |
| `device.wake` | `power_mode='active'`, marks online |
| `device.sleep` | `power_mode='sleep'` |
| `device.restart`, `access.granted`, `access.denied`, `command.sent` | Liveness bump (`last_seen`) |
| `command.failed` | Stored only — treated as a queue problem, not device state |
| anything else | Stored for the event feed; no device mutation (new Simkura event types need no migration) |

**Registering the receiver**: `node apps/api/scripts/register-webhook.js`
(idempotent; needs `SIMKURA_WEBHOOK_PUBLIC_URL`; `--regenerate` rotates the
secret). The secret is returned **once** at creation — put it in
`SIMKURA_WEBHOOK_SECRET`.

## Background sync workers

Both run inline in the API process (started from `server.js`):

- **Device discovery** — every 24h (`SIMKURA_DISCOVERY_INTERVAL_MS`), lists
  the fleet and inserts unknown devices as **unclaimed** rows
  (`company_id IS NULL`); existing rows are never touched. Trigger manually
  with `POST /api/platform/devices/sync`. Disable:
  `SIMKURA_DISCOVERY_ENABLED=false`.
- **State sync** — every 10min (`SIMKURA_STATE_SYNC_INTERVAL_MS`), polls
  each device's v2 resource and mirrors it onto the row (status, lock state
  and override, battery percentage and **health** — `dead` means the motor
  can't actuate — firmware, signal, latch interval, firmware-reported record
  counts). Multi-door devices are mirrored as door 1 only for now. This
  poll is the **only** path that can mark a device offline — webhooks only
  arrive from live devices. `last_seen` never moves backwards (webhooks and
  polls both bump it). Also refreshed on demand when a device detail page
  loads. Disable: `SIMKURA_STATE_SYNC_ENABLED=false`.

An **offline alert sweep** rides along with state sync: a claimed device
unseen for `SIMKURA_OFFLINE_ALERT_HOURS` (default 48) emits one
`device.offline_extended` [outbound webhook](./webhooks.md) per offline
episode.

## Provisioning lifecycle

How a lock goes from Simkura's cloud to an end-user company:

1. **Exists in Simkura** — provisioned on the Simkura side; discovery (or a
   direct claim) makes it visible to Loudin as an unclaimed device.
2. **Search** — `GET /api/devices/unclaimed?suffix=…`: an admin types the
   last 3–6 characters of the device serial; Loudin live-queries Simkura's
   fleet, subtracts already-claimed ids, and returns up to 25 matches (short
   suffixes return nothing, so the whole pool is never listable).
3. **Claim** — `POST /api/devices/claim {device_id, device_name}`: Loudin
   confirms the device exists upstream (404 if Simkura doesn't know it),
   then assigns it to the caller's company. Claiming an already-claimed
   device is a `409`. Emits the `device.added` outbound webhook.
4. **Push** — credentials and schedules are pushed explicitly (below).
5. **Release** — `POST /api/devices/:id/release` soft-deletes the claim and
   emits `device.removed`. **The hardware is not touched** — the lock keeps
   operating with whatever is installed until physically serviced; the
   device returns to the unclaimed pool for re-claiming.

## Pushing credentials & schedules

Attaching credentials or shifts to a device only marks intent in the
database; the push to hardware is an explicit action (**Update device** in
the UI, `POST /api/devices/:id/push`).

- **Delta push** (default) — sends only what changed: `bwCredDeactivate`
  for each removed credential, `bwCred` for each new one, and — because
  firmware has no per-shift delete — a wholesale schedule rebuild
  (`bwClear` → `bw_shift_clear` → `bwShift` ×N → `bwDoorSched`) only when
  a shift changed.
- **Force rebuild** (`{force: true}`) — wipes and re-sends everything.
- **Clear** (`POST /api/devices/:id/clear`) — removes all credentials and
  schedules from the device; the claim survives.

Before a push, Loudin checks the device's Simkura queue and refuses to
double-queue if a rebuild is already pending on a sleeping device (Simkura
does not dedupe these command types). Each command is an independent HTTP
call — there is no transaction. On a mid-sequence failure the completed
steps are kept and the next push resumes; already-delivered credentials are
never re-sent (firmware has no upsert).

Junction rows carry a three-stage sync trail: `applied_at` (recorded in
Loudin) → `submitted_at` (accepted by Simkura) → `synced_at` (confirmed on
device). The device's own firmware-reported counts
(`fw_credential_count` etc., from state sync) are the ground truth for
verifying what a lock actually holds.

Ad-hoc commands (`POST /api/devices/:hardware_id/commands`) accept an
allowlisted subset: `bwUnlock`, `bwState` (lock / unlock / lockdown /
`normal` to clear an override), `bwProvision` (card type, latch interval),
`bwReset`, `bwCount`, and the credential/schedule commands the push
orchestrator uses.

## Current limitations

- **Commands still speak v1** (`bw*` vocabulary) while Simkura's v2 command
  surface is in draft. The public sandbox key is read-only, so lock commands
  require a real `sk_live_…` key until then.
- **Holidays** are modeled in the database and counted by firmware, but are
  not yet pushed to devices (v2's `holidays.add` will lift this with the
  command migration).
- **Multi-door devices**: v2 models `doors[]` as first-class; Loudin
  currently mirrors door 1 only.
- **Per-reseller Simkura accounts**: the schema (`companies.simkura_api_key`
  / `simkura_api_url`) and client support per-reseller credentials, but the
  current release routes all device traffic through the platform
  credentials. Roadmap.
