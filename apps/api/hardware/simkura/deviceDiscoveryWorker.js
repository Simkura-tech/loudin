/**
 * Simkura device-discovery worker.
 *
 * Once a day, pulls the full device list from Simkura
 *   GET /api/v2/devices  (normalized by simkuraClient.getDevices())
 * and INSERTs any device we don't already know about into our `devices`
 * table as **unclaimed** rows (company_id IS NULL). End-user admins can
 * then claim them through the existing add-device search flow — the
 * claim controller picks up an unclaimed row and assigns it to their
 * company in place (no duplicate row created).
 *
 * Idempotent: INSERT … ON CONFLICT (device_id) DO NOTHING means a re-run
 * never duplicates rows; rows already claimed by any tenant are left
 * completely untouched.
 *
 * Lives inline in the api process — same pattern as eventsWorker. If we
 * ever HA the api, gate this behind a leader election so only one
 * instance pulls.
 *
 * Env knobs:
 *   SIMKURA_DISCOVERY_ENABLED       'false' to disable (default: enabled)
 *   SIMKURA_DISCOVERY_INTERVAL_MS   how often to run (default: 24h)
 */

const { client: simkuraClient } = require('./');
const { query } = require('../../database/db');

const INTERVAL_MS    = parseInt(process.env.SIMKURA_DISCOVERY_INTERVAL_MS, 10) || 24 * 60 * 60 * 1000;
const ENABLED        = process.env.SIMKURA_DISCOVERY_ENABLED !== 'false';
const START_DELAY_MS = 15_000; // give the api a moment to settle; runs after eventsWorker's first tick

let timer = null;
let running = false;             // re-entrancy guard
let lastLoggedError = null;      // dedupe repeated identical errors

/** Default display name for a freshly discovered device. Hardware ids are
 *  usually UUID-shaped — last 6 chars are the most human-friendly handle. */
function defaultName(hwId) {
  if (!hwId) return 'Unclaimed device';
  return hwId.length > 6 ? `Device ${hwId.slice(-6)}` : `Device ${hwId}`;
}

/**
 * Map a normalized v2 list item (from simkuraClient.getDevices()) into the
 * row shape our `devices` table expects. The v2 list spine carries live
 * status + lastSeen, so new rows start with real values; door/power detail
 * arrives with the state-sync worker's first pass.
 */
function rowFromSimkura(s) {
  if (!s?.device_id) return null;
  const STATUSES = new Set(['online', 'offline']); // column CHECK has no 'unknown'
  return {
    device_id:        s.device_id,
    device_type:      s.device_type || 'sb6',
    firmware_version: s.firmware_version || null,
    device_name:      defaultName(s.device_id),
    status:           STATUSES.has(s.status) ? s.status : 'offline',
    door_state:       'unknown',
    power_mode:       'active',
    last_seen:        s.last_seen || null,
  };
}

/**
 * Insert one Simkura device as unclaimed. Returns 'inserted' if a new
 * row was created, 'skipped' if a row already existed for that hardware
 * id (claimed or otherwise — we don't touch existing rows).
 */
async function upsertUnclaimed(row) {
  const r = await query(
    `INSERT INTO devices
       (device_id, device_type, firmware_version, device_name,
        status, door_state, power_mode, last_seen)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (device_id) DO NOTHING
     RETURNING id`,
    [
      row.device_id,
      row.device_type,
      row.firmware_version,
      row.device_name,
      row.status,
      row.door_state,
      row.power_mode,
      row.last_seen,
    ]
  );
  return r.rowCount > 0 ? 'inserted' : 'skipped';
}

/**
 * One sync cycle. Pulls every device in the Simkura account and INSERTs
 * any unknowns. Returns counts; throws on upstream failure (the timer
 * loop catches and logs).
 */
async function tick() {
  if (running) return { fetched: 0, inserted: 0, skipped: 0, busy: true };
  running = true;
  try {
    if (!simkuraClient.isAvailable()) {
      return { fetched: 0, inserted: 0, skipped: 0, skipped_reason: 'not_configured' };
    }

    const { devices } = await simkuraClient.getDevices();
    const list = Array.isArray(devices) ? devices : [];

    let inserted = 0;
    let skipped  = 0;
    for (const s of list) {
      const row = rowFromSimkura(s);
      if (!row) { skipped += 1; continue; }
      try {
        const verdict = await upsertUnclaimed(row);
        if (verdict === 'inserted') inserted += 1;
        else                        skipped  += 1;
      } catch (err) {
        console.error('[simkura-discovery] insert failed for', row.device_id, '—', err.message);
        skipped += 1;
      }
    }

    lastLoggedError = null;
    if (inserted > 0 || process.env.NODE_ENV !== 'production') {
      console.log(`[simkura-discovery] ${list.length} from Simkura · ${inserted} new · ${skipped} already known`);
    }
    return { fetched: list.length, inserted, skipped };
  } catch (err) {
    const msg = err.message || String(err);
    if (msg !== lastLoggedError) {
      console.error('[simkura-discovery] cycle failed:', msg);
      lastLoggedError = msg;
    }
    throw err;
  } finally {
    running = false;
  }
}

function scheduleNext(delay = INTERVAL_MS) {
  if (!ENABLED) return;
  timer = setTimeout(() => {
    tick().catch(() => { /* logged inside tick */ }).finally(() => scheduleNext());
  }, delay);
}

function start() {
  if (!ENABLED) {
    console.log('[simkura-discovery] disabled via SIMKURA_DISCOVERY_ENABLED=false');
    return;
  }
  if (timer) return;
  const hrs = Math.round(INTERVAL_MS / 3600_000 * 10) / 10;
  console.log(`[simkura-discovery] starting — every ${hrs}h, first tick in ${START_DELAY_MS / 1000}s`);
  scheduleNext(START_DELAY_MS);
}

function stop() {
  if (timer) { clearTimeout(timer); timer = null; }
}

module.exports = { start, stop, tick };
