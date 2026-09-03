/**
 * Inbound webhooks. Currently just Simkura's device-event push.
 *
 * The raw-body middleware for /api/webhooks/simkura is registered in
 * server.js BEFORE express.json(), so req.body here is a Buffer — that's
 * load-bearing: HMAC verification has to run against the exact bytes
 * Simkura signed, not a re-stringified parse.
 *
 * Envelope (see docs.simkura.com/webhooks): Loudin registers with
 * payload_version 'v2', so deliveries normally arrive as the v2 envelope
 * { apiVersion: 'v2', id: 'evt_…', type, category, deviceId, door,
 * timestamp, severity, data } signed with the timestamp-bound scheme
 * (X-Webhook-Signature: t=<unix>,v2=<hmac of "t.rawBody">). The legacy v1
 * envelope ({ webhook_id, event_id, event_type, … , metadata: { severity } },
 * body-only hex signature) is still accepted: retries enqueued before a
 * payload_version flip arrive in their original shape+scheme, and
 * self-hosted deployments may not have flipped yet. normalizeEvent() maps
 * v2 onto the internal (v1-named) shape the pipeline was built on.
 *
 * Both shapes may carry `isTest: true` on synthetic test events fired from
 * the Simkura dashboard (stored for the feed, but never allowed to mutate
 * device state).
 */

const express = require('express');
const crypto  = require('crypto');
const { query } = require('../database/db');
const events  = require('../integrations/events');
const commandAck = require('../services/access/commandAck');

const router = express.Router();

const settings = require('../services/platform/integrationSettings');

/**
 * The signing secret resolves per request through the platform integration
 * settings (Integrations tab override → SIMKURA_WEBHOOK_SECRET env → null),
 * so a secret saved from the admin UI — or stored by register-webhook.js —
 * takes effect immediately, no restart.
 */
function webhookSecret() {
  return settings.get('simkura', 'webhook_secret');
}

let warnedMissingSecret = false;
function warnMissingSecretOnce() {
  if (warnedMissingSecret) return;
  warnedMissingSecret = true;
  console.error(
    '[webhooks/simkura] No webhook secret configured (Integrations tab or ' +
    'SIMKURA_WEBHOOK_SECRET) — every delivery is being rejected with 401.'
  );
}

// Max |now − t| for the v2 timestamp-bound signature (replay window).
const V2_TOLERANCE_S = parseInt(process.env.SIMKURA_WEBHOOK_TOLERANCE_S, 10) || 300;

/** Constant-time compare of two strings as buffers. */
function timingSafeEq(a, b) {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Verify the delivery signature against the raw request bytes. Two schemes:
 *
 *   v2 — `t=<unix>,v2=<hex HMAC-SHA256 of "<t>.<rawBody>">`: the timestamp
 *        is authenticated and bounded by V2_TOLERANCE_S, so a captured
 *        delivery cannot be replayed later.
 *   v1 — bare hex HMAC-SHA256 of the raw body (legacy; kept so in-flight
 *        retries from before the payload_version flip still verify).
 *
 * Returns false rather than throwing on any malformed input.
 */
function verifySignature(rawBuffer, signatureHeader) {
  const secret = webhookSecret();
  if (!secret) {
    warnMissingSecretOnce();
    return false;
  }
  if (!signatureHeader || typeof signatureHeader !== 'string') return false;
  try {
    const v2 = /^t=(\d+),v2=([0-9a-f]{64})$/.exec(signatureHeader);
    if (v2) {
      const t = parseInt(v2[1], 10);
      if (Math.abs(Math.floor(Date.now() / 1000) - t) > V2_TOLERANCE_S) return false;
      const expected = crypto.createHmac('sha256', secret)
        .update(`${t}.`).update(rawBuffer).digest('hex');
      return timingSafeEq(v2[2], expected);
    }
    const expectedHex = crypto.createHmac('sha256', secret).update(rawBuffer).digest('hex');
    return timingSafeEq(signatureHeader, expectedHex);
  } catch {
    return false;
  }
}

/**
 * Normalize a delivery to the internal event shape (the v1 field names the
 * rest of this pipeline was built on). The v2 envelope is camelCase, drops
 * webhook_id/company_id (the X-Webhook-ID header carries the former),
 * hoists severity, and adds a top-level door (folded into metadata — the
 * single-door schema has no column for it yet). The `evt_` prefix is
 * stripped from the id so dedupe still matches if the same event reaches
 * us once in each shape across the payload_version cutover.
 */
function normalizeEvent(payload, { webhookId = null } = {}) {
  if (payload?.apiVersion !== 'v2') return payload;
  return {
    event_type:     payload.type,
    event_category: payload.category ?? null,
    device_id:      payload.deviceId ?? null,
    event_id:       payload.id != null ? String(payload.id).replace(/^evt_/, '') : null,
    webhook_id:     webhookId ?? null,
    timestamp:      payload.timestamp ?? null,
    data:           payload.data ?? {},
    metadata: {
      ...(payload.severity != null ? { severity: payload.severity } : {}),
      ...(payload.door     != null ? { door: payload.door }         : {}),
    },
    ...(payload.isTest === true ? { isTest: true } : {}),
  };
}

/**
 * Look up our company_id from a device's hardware id (Simkura sends
 * payload.device_id but their company_id is THEIR id for us — useless
 * for tenant routing on our side). Returns null if the device isn't
 * known yet (event will still be stored for forensics).
 */
async function lookupCompanyId(deviceId) {
  if (!deviceId) return null;
  try {
    const { rows } = await query(
      'SELECT company_id FROM devices WHERE device_id = $1 AND deleted_at IS NULL LIMIT 1',
      [deviceId]
    );
    return rows[0]?.company_id ?? null;
  } catch (err) {
    console.error('[webhooks/simkura] device lookup failed:', err.message);
    return null;
  }
}

/**
 * Pull the presented credential value out of an access event's data. The
 * carrier is `credential` (granted) or `attemptedCredential` (denied), and
 * is either an object or a flat PIN string:
 *   { pin: [1,2,3,4] }            — PIN as digit array
 *   { pin: "1234" }               — PIN as string
 *   { cardNumber, facilityCode }  — card
 *   "1234"                        — legacy flat PIN string
 */
function presentedCredential(data) {
  const cred = data?.credential ?? data?.attemptedCredential;
  let pin = null, cardNumber = null, facilityCode = null;
  if (cred && typeof cred === 'object') {
    if (Array.isArray(cred.pin)) {
      if (cred.pin.length) pin = cred.pin.join('');
    } else if (cred.pin != null && cred.pin !== '') {
      pin = String(cred.pin);
    }
    if (cred.cardNumber   != null) cardNumber   = String(cred.cardNumber);
    if (cred.facilityCode != null) facilityCode = String(cred.facilityCode);
  } else if (typeof cred === 'string' && cred) {
    pin = cred;
  }
  return { pin, cardNumber, facilityCode };
}

/**
 * Match a webhook event's presented PIN/card value to one of the owning
 * company's credentials so the activity feed can name the person instead
 * of showing a masked value. Simkura sends only the raw value (no
 * credential id — provisioning doesn't push ours), so this is a value
 * match, scoped to the company.
 *
 * Not gated on event type: any event that carries a credential (an admit,
 * a denied attempt, whatever the device calls it) gets matched. Events
 * without a presented credential yield no pin/card and fall straight
 * through. Best-effort — an unknown value or any failure stores the event
 * unlinked, which is fine.
 */
async function resolveCredential(companyId, data) {
  const noMatch = { credentialId: null, personId: null };
  if (!companyId) return noMatch;

  const { pin, cardNumber, facilityCode } = presentedCredential(data);
  if (!pin && !cardNumber) return noMatch;

  try {
    const { rows } = await query(
      `SELECT id, person_id
         FROM credentials
        WHERE company_id = $1
          AND deleted_at IS NULL
          AND (
                ($2::text IS NOT NULL AND credential_type = 'pin' AND credential_value = $2)
             OR ($3::text IS NOT NULL AND card_number = $3
                 AND ($4::text IS NULL OR facility_code IS NULL OR facility_code = $4))
              )
        ORDER BY id
        LIMIT 1`,
      [companyId, pin, cardNumber, facilityCode]
    );
    if (!rows[0]) return noMatch;
    return { credentialId: rows[0].id, personId: rows[0].person_id ?? null };
  } catch (err) {
    console.error('[webhooks/simkura] credential resolve failed:', err.message);
    return noMatch;
  }
}

/**
 * Insert one event. Idempotent via ON CONFLICT on simkura_event_id —
 * Simkura retries deliver the same event_id, so dedupe is automatic.
 *
 * Access events get their presented PIN/card value resolved to a
 * credential/person (see resolveCredential) so the feed can show who.
 *
 * On a NEW insert (not a redelivery), also mirror the event into the
 * `devices` row's live-state columns (door_state, status, last_seen,
 * power_mode) so the device-detail UI reflects what just happened
 * without needing a separate refresh path.
 */
const SEVERITIES = new Set(['info', 'warning', 'error']);

/** v2 carries severity in metadata; tolerate the old top-level spot too,
 *  and clamp anything outside the column's CHECK constraint to 'info'. */
function eventSeverity(payload) {
  const s = payload.metadata?.severity ?? payload.severity;
  return SEVERITIES.has(s) ? s : 'info';
}

async function insertEvent(payload) {
  const companyId = await lookupCompanyId(payload.device_id);
  const { credentialId, personId } =
    await resolveCredential(companyId, payload.data ?? {});
  const result = await query(
    `INSERT INTO device_events (
       company_id, device_id,
       event_type, event_category, severity,
       event_data, metadata,
       simkura_event_id, simkura_webhook_id,
       event_timestamp,
       credential_id, person_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (simkura_event_id) DO NOTHING`,
    [
      companyId,
      payload.device_id ?? null,
      payload.event_type,
      payload.event_category ?? null,
      eventSeverity(payload),
      payload.data     ?? {},
      payload.metadata ?? {},
      payload.event_id != null ? String(payload.event_id) : null,
      payload.webhook_id ?? null,
      payload.timestamp ?? null,
      credentialId,
      personId,
    ]
  );

  // Skip the device-row update on redelivered events — the device is
  // already in whatever state the original delivery left it in. Synthetic
  // test events (Simkura dashboard → Testing) go through the real pipeline
  // and are stored for the feed, but must never mutate device state.
  if (result.rowCount === 0 || payload.isTest === true) return;

  await applyEventToDeviceState(payload, companyId);
}

/** Liveness bump: any device-originated event proves the device is up. */
async function bumpLiveness(hwId, extraSets = '', params = []) {
  await query(
    `UPDATE devices
        SET status     = 'online',
            last_seen  = NOW(),
            updated_at = NOW()${extraSets ? ', ' + extraSets : ''}
      WHERE device_id = $1 AND deleted_at IS NULL`,
    [hwId, ...params]
  );
}

/**
 * Relay a battery-health transition to Loudin's own outbound webhooks so
 * external systems (ops tooling, a CRM) can act on it. Claimed devices
 * only — an unclaimed pool device has no tenant to alert about. Simkura
 * fires each threshold crossing once (with an all-clear counterpart), so
 * relaying 1:1 needs no episode tracking on our side.
 */
async function emitBatteryTransition(type, hwId, companyId, batteryPct) {
  if (!companyId) return;
  try {
    const { rows: [co] } = await query(
      `SELECT company_type, parent_company_id FROM companies WHERE id = $1`,
      [companyId]
    );
    if (!co) return;
    void events.emit(type, {
      company:  { id: companyId, type: co.company_type },
      reseller: co.parent_company_id ? { company_id: co.parent_company_id } : undefined,
      device:   {
        device_id: hwId,
        ...(Number.isFinite(batteryPct) ? { battery_percent: batteryPct } : {}),
      },
    });
  } catch (err) {
    console.error('[webhooks/simkura] battery transition emit failed:', err.message);
  }
}

/**
 * Mirror an event onto the `devices` row's live-state columns.
 *
 * Per the v2 event catalog (docs.simkura.com/webhooks):
 *   lock.state_changed         → door_state (from data.lockState or numeric data.state)
 *   device.wake                → power_mode='active'
 *   device.sleep               → power_mode='sleep'
 *   device.online              → status='online' (platform-derived reachability edge)
 *   device.offline             → status='offline' ONLY — the one event that is
 *                                NOT a liveness signal; last_seen untouched so
 *                                the offline-alert sweep still measures staleness
 *   device.reconnect/restart   → liveness bump
 *   access.granted/denied      → liveness bump (guaranteed events — persisted
 *                                on-device, delivered on next check-in)
 *   command.sent               → liveness bump; data.commandRef (the id from
 *                                the push's 202) confirms the matching
 *                                credential/shift rows as delivered
 *                                (services/access/commandAck)
 *   command.failed             → no device mutation; data.commandRef un-submits
 *                                the matching rows so the next push re-sends
 *   health.battery_low/dead/
 *     recovered                → battery_health ('low'/'dead'/'ok') + batteryPct
 *                                when carried; dead/recovered also relay to
 *                                Loudin's outbound webhooks
 *   health.reader_wedged/
 *     recovery_boot            → liveness bump (stored; alarm shows in the feed)
 *   device.deployed/undeployed → stored only (platform billing transitions)
 *
 * Every device-originated branch also sets status='online' + last_seen=NOW(),
 * because receiving the event is itself a liveness signal.
 */
async function applyEventToDeviceState(payload, companyId = null) {
  const hwId = payload.device_id;
  if (!hwId) return;
  const data = payload.data || {};

  switch (payload.event_type) {
    case 'lock.state_changed': {
      const numericMap = { 0: 'locked', 1: 'unlocked', 2: 'lockdown' };
      const newState = data.lockState || numericMap[data.state];
      if (!['locked', 'unlocked', 'lockdown'].includes(newState)) return;
      await bumpLiveness(hwId, 'door_state = $2', [newState]);
      return;
    }
    case 'device.wake':
      await bumpLiveness(hwId, `power_mode = 'active'`);
      return;
    case 'device.sleep':
      await query(
        `UPDATE devices
            SET power_mode = 'sleep',
                last_seen  = NOW(),
                updated_at = NOW()
          WHERE device_id = $1 AND deleted_at IS NULL`,
        [hwId]
      );
      return;
    case 'device.online':
      await bumpLiveness(hwId);
      return;
    case 'device.offline':
      // Platform-derived: the device went quiet. Do NOT touch last_seen.
      await query(
        `UPDATE devices
            SET status     = 'offline',
                updated_at = NOW()
          WHERE device_id = $1 AND deleted_at IS NULL`,
        [hwId]
      );
      return;
    case 'health.battery_low':
    case 'health.battery_dead':
    case 'health.battery_recovered': {
      const health = payload.event_type === 'health.battery_low'  ? 'low'
                   : payload.event_type === 'health.battery_dead' ? 'dead'
                   :                                                'ok';
      const pct = Number(data.batteryPct);
      const sets = ['battery_health = $2'];
      const params = [health];
      if (data.batteryPct != null && Number.isFinite(pct)) {
        params.push(Math.max(0, Math.min(100, Math.round(pct))));
        sets.push(`battery_percent = $${params.length + 1}`);
      }
      await bumpLiveness(hwId, sets.join(', '), params);
      if (payload.event_type !== 'health.battery_low') {
        await emitBatteryTransition(
          health === 'dead' ? 'device.battery_dead' : 'device.battery_recovered',
          hwId, companyId, pct
        );
      }
      return;
    }
    case 'command.sent':
      // Shape A (queue dispatch) carries commandRef — the id from the push's
      // 202 — so the junction rows that command queued can be confirmed as
      // delivered. Shape B (device-side confirmation) has no ref: liveness only.
      await bumpLiveness(hwId);
      if (data.commandRef) await commandAck.markSent(data.commandRef);
      return;
    case 'command.failed':
      // The queue gave up (device unreachable, retries exhausted): the record
      // never reached the lock. Roll the rows back to "pending add".
      if (data.commandRef) await commandAck.markFailed(data.commandRef);
      return;
    case 'device.reconnect':
    case 'device.restart':
    case 'access.granted':
    case 'access.denied':
    case 'health.reader_wedged':
    case 'health.recovery_boot':
      await bumpLiveness(hwId);
      return;
    default:
      return;
  }
}

// â”€â”€ POST /api/webhooks/simkura â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/simkura', async (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const rawBody   = req.body; // Buffer (express.raw() in server.js)

  // Reject before we do anything else if the signature doesn't match.
  if (!Buffer.isBuffer(rawBody) || !verifySignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const event = normalizeEvent(payload, { webhookId: req.headers['x-webhook-id'] ?? null });

  if (!event || !event.event_type) {
    return res.status(400).json({ error: 'Missing event_type' });
  }

  // ACK fast. Simkura's spec asks for a 2xx within 10s and explicitly says
  // "process events asynchronously" — fire the insert and return.
  res.status(200).json({ received: true, event_id: event.event_id ?? null });

  // Insert is fire-and-forget; any error is logged but doesn't trigger a
  // retry from Simkura (we already ack'd).
  insertEvent(event).catch((err) => {
    console.error('[webhooks/simkura] insert failed:', err);
  });
});

module.exports = router;
module.exports._internal = { insertEvent, applyEventToDeviceState, eventSeverity, verifySignature, normalizeEvent }; // for tests
