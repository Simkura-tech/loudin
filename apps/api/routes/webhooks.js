/**
 * Inbound webhooks. Currently just Simkura's device-event push.
 *
 * The raw-body middleware for /api/webhooks/simkura is registered in
 * server.js BEFORE express.json(), so req.body here is a Buffer — that's
 * load-bearing: HMAC verification has to run against the exact bytes
 * Simkura signed, not a re-stringified parse.
 *
 * Doc reference: RECEIVING_DEVICE_EVENTS.md + WEBHOOKS.md at the repo root.
 */

const express = require('express');
const crypto  = require('crypto');
const { query } = require('../database/db');

const router = express.Router();

const SECRET = process.env.SIMKURA_WEBHOOK_SECRET;

if (!SECRET && process.env.NODE_ENV === 'production') {
  // Don't crash dev where it isn't set, but yell loudly so it can't be
  // overlooked when this ships.
  console.error('FATAL: SIMKURA_WEBHOOK_SECRET is not set in production. The /api/webhooks/simkura receiver will reject every request.');
}

/**
 * Constant-time HMAC compare against the raw request bytes.
 * Returns false rather than throwing on any malformed input.
 */
function verifySignature(rawBuffer, signatureHex) {
  if (!SECRET) return false;
  if (!signatureHex || typeof signatureHex !== 'string') return false;
  let expectedHex;
  try {
    expectedHex = crypto.createHmac('sha256', SECRET).update(rawBuffer).digest('hex');
  } catch {
    return false;
  }
  const a = Buffer.from(signatureHex, 'utf8');
  const b = Buffer.from(expectedHex, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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
      payload.severity ?? 'info',
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
  // already in whatever state the original delivery left it in.
  if (result.rowCount === 0) return;

  await applyEventToDeviceState(payload);
}

/**
 * Mirror an event onto the `devices` row's live-state columns.
 *
 * Per INTEGRATION_REST.md the event taxonomy is:
 *   lock.state_changed     â†’ door_state (from data.lockState or numeric data.state)
 *   device.wake            â†’ power_mode='active'
 *   device.sleep           â†’ power_mode='sleep'
 *   device.restart         â†’ bumps last_seen / status only
 *   access.granted/denied  â†’ bumps last_seen / status only
 *   command.sent           â†’ bumps last_seen / status only (device confirmed)
 *   command.failed         â†’ no device mutation (it's a queue/Simkura issue)
 *
 * Every branch that updates also sets status='online' + last_seen=NOW(),
 * because receiving any event from the device is itself a liveness signal.
 */
async function applyEventToDeviceState(payload) {
  const hwId = payload.device_id;
  if (!hwId) return;
  const data = payload.data || {};

  switch (payload.event_type) {
    case 'lock.state_changed': {
      const numericMap = { 0: 'locked', 1: 'unlocked', 2: 'lockdown' };
      const newState = data.lockState || numericMap[data.state];
      if (!['locked', 'unlocked', 'lockdown'].includes(newState)) return;
      await query(
        `UPDATE devices
            SET door_state = $1,
                status     = 'online',
                last_seen  = NOW(),
                updated_at = NOW()
          WHERE device_id = $2 AND deleted_at IS NULL`,
        [newState, hwId]
      );
      return;
    }
    case 'device.wake':
      await query(
        `UPDATE devices
            SET power_mode = 'active',
                status     = 'online',
                last_seen  = NOW(),
                updated_at = NOW()
          WHERE device_id = $1 AND deleted_at IS NULL`,
        [hwId]
      );
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
    case 'device.restart':
    case 'command.sent':
    case 'access.granted':
    case 'access.denied':
      await query(
        `UPDATE devices
            SET status     = 'online',
                last_seen  = NOW(),
                updated_at = NOW()
          WHERE device_id = $1 AND deleted_at IS NULL`,
        [hwId]
      );
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

  if (!payload.event_type) {
    return res.status(400).json({ error: 'Missing event_type' });
  }

  // ACK fast. Simkura's spec asks for a 2xx within 10s and explicitly says
  // "process events asynchronously" — fire the insert and return.
  res.status(200).json({ received: true, event_id: payload.event_id ?? null });

  // Insert is fire-and-forget; any error is logged but doesn't trigger a
  // retry from Simkura (we already ack'd).
  insertEvent(payload).catch((err) => {
    console.error('[webhooks/simkura] insert failed:', err);
  });
});

module.exports = router;
