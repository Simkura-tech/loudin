/**
 * Webhook endpoint service (platform-scoped).
 *
 * CRUD for outbound webhook destinations, sibling of services/platform/apiKey.js.
 * Unlike API keys, the signing secret is stored in plaintext (we must have it
 * to SIGN each delivery) and is safe to show in the UI — it's a shared secret
 * the receiver also holds to verify X-Loudin-Signature.
 *
 * Endpoints are editable (name / url / event_types / active) and soft-deleted
 * (disabled_at) so their delivery history survives.
 */

const crypto = require('crypto');
const { query } = require('../../database/db');

// The event types an endpoint may subscribe to. Extend as we route more
// events through integrations/events.js. Keep in sync with the emit sites.
const ALLOWED_EVENT_TYPES = [
  'company.signed_up',
  'company.first_person_added',
  'company.subscription_cancelled',
  'device.added',
  'device.removed',
  'device.offline_extended',
  'device.battery_dead',      // relayed from Simkura health.battery_dead — lock in safe mode
  'device.battery_recovered', // the matching all-clear
];

const SECRET_BYTES = 24;

function urlSafeBase64(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function generateSecret() {
  return `whsec_${urlSafeBase64(crypto.randomBytes(SECRET_BYTES))}`;
}

/** Validate + normalize a caller-supplied event_types list. Throws on invalid. */
function cleanEventTypes(eventTypes) {
  if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
    throw new Error('pick at least one event type');
  }
  const cleaned = [...new Set(eventTypes)].filter((t) => ALLOWED_EVENT_TYPES.includes(t));
  if (cleaned.length === 0) throw new Error('no valid event types supplied');
  return cleaned;
}

/** Validate a destination URL. Throws on invalid. */
function cleanUrl(url) {
  let parsed;
  try { parsed = new URL(String(url)); } catch { throw new Error('url must be a valid URL'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('url must be http(s)');
  }
  // Allow http only for localhost dev receivers; require https otherwise.
  if (parsed.protocol === 'http:' && !/^(localhost|127\.0\.0\.1)$/.test(parsed.hostname)) {
    throw new Error('url must use https');
  }
  return parsed.toString();
}

/**
 * Create an endpoint. Returns the row INCLUDING the freshly generated secret
 * (the only time the caller should surface it prominently — though unlike API
 * keys it remains retrievable via rotate).
 */
async function createEndpoint({ name, url, eventTypes, createdBy }) {
  if (!name || typeof name !== 'string' || !name.trim()) throw new Error('name is required');
  const cleanName   = name.trim().slice(0, 120);
  const cleanedUrl  = cleanUrl(url);
  const types       = cleanEventTypes(eventTypes);
  const secret      = generateSecret();

  const { rows: [row] } = await query(
    `INSERT INTO webhook_endpoints (name, url, secret, event_types, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [cleanName, cleanedUrl, secret, types, createdBy ?? null]
  );
  return row;
}

async function listEndpoints() {
  const { rows } = await query(
    `SELECT * FROM webhook_endpoints
      ORDER BY disabled_at IS NULL DESC, created_at DESC`
  );
  return rows;
}

async function getEndpoint(id) {
  const { rows } = await query(`SELECT * FROM webhook_endpoints WHERE id = $1`, [id]);
  return rows[0] || null;
}

/**
 * Patch an endpoint. Accepts any of { name, url, eventTypes, active }.
 * Returns the updated row, or null if not found / already deleted.
 */
async function updateEndpoint(id, patch) {
  const sets = [];
  const vals = [];
  let i = 1;
  if (patch.name !== undefined) {
    if (!patch.name || !String(patch.name).trim()) throw new Error('name cannot be empty');
    sets.push(`name = $${i++}`); vals.push(String(patch.name).trim().slice(0, 120));
  }
  if (patch.url !== undefined) { sets.push(`url = $${i++}`); vals.push(cleanUrl(patch.url)); }
  if (patch.eventTypes !== undefined) {
    sets.push(`event_types = $${i++}`); vals.push(cleanEventTypes(patch.eventTypes));
  }
  if (patch.active !== undefined) { sets.push(`active = $${i++}`); vals.push(!!patch.active); }
  if (sets.length === 0) return getEndpoint(id);

  sets.push(`updated_at = NOW()`);
  vals.push(id);
  const { rows } = await query(
    `UPDATE webhook_endpoints SET ${sets.join(', ')}
      WHERE id = $${i} AND disabled_at IS NULL
      RETURNING *`,
    vals
  );
  return rows[0] || null;
}

/** Soft-delete (disable). Returns true if a live row was disabled. */
async function deleteEndpoint(id) {
  const { rowCount } = await query(
    `UPDATE webhook_endpoints SET disabled_at = NOW(), active = FALSE, updated_at = NOW()
      WHERE id = $1 AND disabled_at IS NULL`,
    [id]
  );
  return rowCount > 0;
}

/** Rotate the signing secret. Returns the updated row (with the new secret). */
async function rotateSecret(id) {
  const { rows } = await query(
    `UPDATE webhook_endpoints SET secret = $2, updated_at = NOW()
      WHERE id = $1 AND disabled_at IS NULL
      RETURNING *`,
    [id, generateSecret()]
  );
  return rows[0] || null;
}

/** Recent delivery attempts for an endpoint (newest first). */
async function listDeliveries(endpointId, limit = 50) {
  const { rows } = await query(
    `SELECT id, endpoint_id, event_id, event_type, status, attempt_count, max_attempts,
            next_attempt_at, last_status_code, last_error, response_snippet,
            created_at, updated_at, delivered_at
       FROM webhook_deliveries
      WHERE endpoint_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [endpointId, limit]
  );
  return rows;
}

/** Re-queue a single delivery for another attempt (manual redeliver). */
async function requeueDelivery(deliveryId) {
  const { rows } = await query(
    `UPDATE webhook_deliveries
        SET status = 'pending', next_attempt_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status IN ('failed', 'exhausted')
      RETURNING *`,
    [deliveryId]
  );
  return rows[0] || null;
}

module.exports = {
  ALLOWED_EVENT_TYPES,
  createEndpoint,
  listEndpoints,
  getEndpoint,
  updateEndpoint,
  deleteEndpoint,
  rotateSecret,
  listDeliveries,
  requeueDelivery,
};
