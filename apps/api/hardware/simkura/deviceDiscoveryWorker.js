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
const { bindValue } = require('./hardwareProfile');
const boardCatalog = require('./boardCatalog');
const { query } = require('../../database/db');

// Hardware-profile columns the list spine carries (migration 085). The full
// resource adds card_formats / power_type / connectivity_transport, which
// the state-sync worker fills in on its first pass.
const PROFILE_COLUMNS = ['manufacturer', 'hardware_version', 'num_doors', 'deployed',
                         'capabilities', 'features', 'supported'];

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
 * status + lastSeen plus the hardware profile (manufacturer, revision,
 * door count, capabilities / features / supported), so new rows start with
 * real values; door/power detail arrives with the state-sync worker's first
 * pass.
 */
function rowFromSimkura(s) {
  if (!s?.device_id) return null;
  const STATUSES = new Set(['online', 'offline']); // column CHECK has no 'unknown'
  const profile = s.profile ?? {};
  const row = {
    device_id:        s.device_id,
    device_type:      s.device_type || 'sb6',
    firmware_version: s.firmware_version || null,
    device_name:      defaultName(s.device_id),
    status:           STATUSES.has(s.status) ? s.status : 'offline',
    door_state:       'unknown',
    power_mode:       'active',
    last_seen:        s.last_seen || null,
  };
  for (const col of PROFILE_COLUMNS) {
    row[col] = profile[col] ?? null;
  }
  return row;
}

/**
 * Insert one Simkura device as unclaimed. Returns 'inserted' if a new
 * row was created, 'skipped' if a row already existed for that hardware
 * id (claimed or otherwise — we don't touch existing rows; the state-sync
 * worker keeps their profile current).
 */
async function upsertUnclaimed(row) {
  const cols = ['device_id', 'device_type', 'firmware_version', 'device_name',
                'status', 'door_state', 'power_mode', 'last_seen', ...PROFILE_COLUMNS];
  const r = await query(
    `INSERT INTO devices (${cols.join(', ')})
     VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     ON CONFLICT (device_id) DO NOTHING
     RETURNING id`,
    cols.map((col) => bindValue(col, row[col]))
  );
  return r.rowCount > 0 ? 'inserted' : 'skipped';
}

/**
 * One sync cycle. Refreshes the board catalog, then pulls every device in
 * the Simkura account and INSERTs any unknowns. Returns counts; throws on
 * upstream failure (the timer loop catches and logs).
 */
async function tick() {
  if (running) return { fetched: 0, inserted: 0, skipped: 0, busy: true };
  running = true;
  try {
    if (!simkuraClient.isAvailable()) {
      return { fetched: 0, inserted: 0, skipped: 0, skipped_reason: 'not_configured' };
    }

    // Board catalog first: it is what a device row falls back to for
    // feature gating, so it should exist before the device does. A catalog
    // failure is logged but never blocks device discovery.
    let boards = 0;
    try {
      boards = await boardCatalog.refreshFromSimkura(simkuraClient);
    } catch (err) {
      console.error('[simkura-discovery] board catalog refresh failed:', err.message);
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
      console.log(`[simkura-discovery] ${list.length} from Simkura · ${inserted} new · ${skipped} already known · ${boards} board(s) in catalog`);
    }
    return { fetched: list.length, inserted, skipped, boards };
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
