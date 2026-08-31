/**
 * Simkura device-state sync worker.
 *
 * Polls GET /api/v1/devices/:hwId/state for every live device row and
 * mirrors the snapshot into `devices`:
 *
 *   status              ← state.status ('online' | 'offline'; other values ignored)
 *   door_state          ← state.lock.state
 *   power_mode          ← state.power.mode
 *   battery_percent     ← state.batteryPct   (the % is authoritative — the
 *                          sibling `battery` label is ignored by product decision)
 *   firmware_version    ← state.firmware    (keeps OTA updates visible)
 *   carrier             ← state.connectivity.carrier   (newer firmwares only)
 *   signal_strength     ← state.connectivity.signal    (newer firmwares only)
 *   last_seen           ← state.lastSeen    (never moved backwards — a webhook
 *                          event may have bumped it more recently)
 *
 * This complements the webhook feed (routes/webhooks.js), which is
 * event-driven and only carries door/power/liveness. The poll is what keeps
 * battery + firmware fresh and is the only path that can mark a device
 * OFFLINE — webhooks by definition only arrive from devices that are up.
 *
 * Old firmwares report an empty carrier and signal 0; that combination is
 * stored as NULL/NULL rather than pretending we measured no signal.
 *
 * Devices the platform credentials can't see (another account's, or deleted
 * upstream) return 403/404 — skipped quietly, everything else is logged.
 *
 * Same inline-worker pattern as deviceDiscoveryWorker. If the api is ever
 * HA'd, gate behind leader election.
 *
 * Env knobs:
 *   SIMKURA_STATE_SYNC_ENABLED       'false' to disable (default: enabled)
 *   SIMKURA_STATE_SYNC_INTERVAL_MS   how often to run (default: 10 min)
 */

const { client: simkuraClient } = require('./');
const { query } = require('../../database/db');
const events = require('../../integrations/events');

const INTERVAL_MS    = parseInt(process.env.SIMKURA_STATE_SYNC_INTERVAL_MS, 10) || 10 * 60 * 1000;
const ENABLED        = process.env.SIMKURA_STATE_SYNC_ENABLED !== 'false';
const START_DELAY_MS = 25_000; // after discovery's first tick so new devices get state on boot

// device.offline_extended fires when a claimed device hasn't been seen for
// this many hours (once per offline episode — see sweepOfflineAlerts).
const OFFLINE_ALERT_HOURS = parseInt(process.env.SIMKURA_OFFLINE_ALERT_HOURS, 10) || 48;

let timer = null;
let running = false;
let lastLoggedError = null;

const STATUSES    = new Set(['online', 'offline']);
const DOOR_STATES = new Set(['locked', 'unlocked', 'lockdown']);
const POWER_MODES = new Set(['active', 'sleep', 'deep_sleep']);

/**
 * Map a /state payload onto the `devices` columns we mirror. Fields the
 * payload doesn't carry (or carries with an unusable value) are omitted so
 * the UPDATE never nulls out data we already have.
 */
function fieldsFromState(state) {
  const out = {};

  if (STATUSES.has(state?.status)) out.status = state.status;

  // A device that has never checked in (lastSeen null) returns a
  // default-shaped state — batteryPct 0, power.mode 'sleep', etc. Those are
  // placeholders, not measurements: mirroring them would show a factory-new
  // lock as "0% battery". Status (above) is still meaningful; skip the rest.
  const lastSeen = state?.lastSeen ? new Date(state.lastSeen) : null;
  if (!lastSeen || Number.isNaN(lastSeen.getTime())) return out;

  const doorState = state?.lock?.state;
  if (DOOR_STATES.has(doorState)) out.door_state = doorState;

  const powerMode = state?.power?.mode;
  if (POWER_MODES.has(powerMode)) out.power_mode = powerMode;

  const pct = Number(state?.batteryPct);
  if (Number.isFinite(pct)) {
    out.battery_percent = Math.max(0, Math.min(100, Math.round(pct)));
  }

  if (typeof state?.firmware === 'string' && state.firmware.trim()) {
    out.firmware_version = state.firmware.trim();
  }

  // Connectivity: an empty carrier with signal 0 is old firmware saying
  // "not reported" — store NULLs. A named carrier makes signal meaningful
  // (even 0). Values are the firmware's raw units, no conversion.
  const carrier = typeof state?.connectivity?.carrier === 'string'
    ? state.connectivity.carrier.trim()
    : '';
  const signal = Number(state?.connectivity?.signal);
  out.carrier = carrier || null;
  out.signal_strength = carrier && Number.isFinite(signal) ? Math.round(signal) : null;

  // Override flag: firmware sends 0/1. True = door pinned by bwState,
  // schedule suppressed until a bwState 'normal' clears it.
  const override = state?.lock?.override;
  if (override === 0 || override === 1 || typeof override === 'boolean') {
    out.door_override = !!override;
  }

  const deepSleep = Number(state?.power?.deepSleepDuration);
  if (Number.isFinite(deepSleep) && deepSleep >= 0) {
    out.deep_sleep_duration_s = Math.round(deepSleep);
  }

  // OSDP reader link stage (0=Root … 3=Connected).
  const osdp = Number(state?.osdpStage);
  if (Number.isInteger(osdp) && osdp >= 0 && osdp <= 3) out.osdp_stage = osdp;

  // Record counts as reported BY the firmware — the device-side truth the
  // sync UI can hold up against our junction tables.
  const countCols = {
    fw_credential_count:  state?.counts?.credentials,
    fw_shift_count:       state?.counts?.shifts,
    fw_holiday_count:     state?.counts?.holidays,
    fw_door_shift_count:  state?.counts?.doorShifts,
  };
  for (const [col, raw] of Object.entries(countCols)) {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) out[col] = n;
  }

  const cardType = Number(state?.config?.cardType);
  if ([0, 1, 2].includes(cardType)) out.config_card_type = cardType;

  const latch = Number(state?.config?.latchInterval);
  if (Number.isInteger(latch) && latch >= 1 && latch <= 255) out.latch_interval_s = latch;

  out.last_seen = lastSeen;

  return out;
}

/**
 * Fetch one device's state from Simkura and mirror it onto its row.
 * Returns 'updated', 'skipped' (403/404 or nothing usable in the payload),
 * or throws on other upstream errors.
 */
async function refreshDevice(hwId) {
  if (!simkuraClient.isAvailable()) return 'skipped';

  let state;
  try {
    state = await simkuraClient.getDeviceState(hwId);
  } catch (err) {
    const status = err.response?.status;
    if (status === 403 || status === 404) return 'skipped';
    throw err;
  }

  const fields = fieldsFromState(state ?? {});
  if (Object.keys(fields).length === 0) return 'skipped';

  // Freshness stamp for the mirrored state columns (webhooks bump
  // last_seen, but only this poll moves the richer state fields).
  const sets = ['state_synced_at = NOW()'];
  const params = [hwId];
  for (const [col, value] of Object.entries(fields)) {
    if (col === 'last_seen') {
      // Webhook events also bump last_seen — never move it backwards.
      params.push(value);
      sets.push(`last_seen = GREATEST(COALESCE(last_seen, 'epoch'::timestamptz), $${params.length})`);
    } else {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    }
  }

  await query(
    `UPDATE devices
        SET ${sets.join(', ')}, updated_at = NOW()
      WHERE device_id = $1 AND deleted_at IS NULL`,
    params
  );
  return 'updated';
}

/**
 * Emit device.offline_extended for claimed devices whose last_seen has gone
 * stale past OFFLINE_ALERT_HOURS — once per offline episode, tracked by
 * devices.offline_alerted_at (migration 073):
 *
 *   clear pass — a device seen again within the threshold gets its stamp
 *                cleared, so its NEXT offline episode alerts afresh
 *   alert pass — stale + unstamped devices are stamped and emitted, both in
 *                one UPDATE so concurrent runs can't double-fire
 *
 * Never-seen devices (last_seen NULL) don't alert — they were never online
 * to go offline. Runs even when Simkura is unconfigured: last_seen is also
 * maintained by the webhook receiver.
 */
async function sweepOfflineAlerts() {
  await query(
    `UPDATE devices
        SET offline_alerted_at = NULL
      WHERE offline_alerted_at IS NOT NULL
        AND last_seen >= NOW() - make_interval(hours => $1)`,
    [OFFLINE_ALERT_HOURS]
  );

  const { rows } = await query(
    `UPDATE devices d
        SET offline_alerted_at = NOW()
       FROM companies c
      WHERE c.id = d.company_id
        AND d.deleted_at IS NULL
        AND d.offline_alerted_at IS NULL
        AND d.last_seen IS NOT NULL
        AND d.last_seen < NOW() - make_interval(hours => $1)
      RETURNING d.device_id, d.last_seen, d.company_id,
                c.company_type, c.parent_company_id`,
    [OFFLINE_ALERT_HOURS]
  );

  for (const r of rows) {
    void events.emit('device.offline_extended', {
      company:  { id: r.company_id, type: r.company_type },
      reseller: r.parent_company_id ? { company_id: r.parent_company_id } : undefined,
      device: {
        device_id:     r.device_id,
        last_seen:     r.last_seen instanceof Date ? r.last_seen.toISOString() : r.last_seen,
        offline_hours: OFFLINE_ALERT_HOURS,
      },
    });
  }
  return rows.length;
}

/**
 * One sync cycle over every live device row (claimed and unclaimed — the
 * platform fleet view shows both). Sequential on purpose: fleet sizes are
 * small and Simkura's retry/backoff lives in the client. The offline-alert
 * sweep runs afterwards either way — it's DB-only.
 */
async function tick() {
  if (running) return { fetched: 0, updated: 0, skipped: 0, busy: true };
  running = true;
  try {
    let fetched = 0;
    let updated = 0;
    let skipped = 0;

    if (simkuraClient.isAvailable()) {
      const { rows } = await query(
        `SELECT device_id FROM devices WHERE deleted_at IS NULL ORDER BY id`
      );
      fetched = rows.length;
      for (const { device_id: hwId } of rows) {
        try {
          const verdict = await refreshDevice(hwId);
          if (verdict === 'updated') updated += 1;
          else                       skipped += 1;
        } catch (err) {
          console.error('[simkura-state] refresh failed for', hwId, '—', err.message);
          skipped += 1;
        }
      }
    }

    let offlineAlerts = 0;
    try {
      offlineAlerts = await sweepOfflineAlerts();
    } catch (err) {
      console.error('[simkura-state] offline sweep failed:', err.message);
    }

    lastLoggedError = null;
    if (process.env.NODE_ENV !== 'production' || updated > 0 || offlineAlerts > 0) {
      console.log(`[simkura-state] ${fetched} devices · ${updated} updated · ${skipped} skipped · ${offlineAlerts} offline alert(s)`);
    }
    return { fetched, updated, skipped, offline_alerts: offlineAlerts };
  } catch (err) {
    const msg = err.message || String(err);
    if (msg !== lastLoggedError) {
      console.error('[simkura-state] cycle failed:', msg);
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
    console.log('[simkura-state] disabled via SIMKURA_STATE_SYNC_ENABLED=false');
    return;
  }
  if (timer) return;
  const mins = Math.round(INTERVAL_MS / 60_000 * 10) / 10;
  console.log(`[simkura-state] starting — every ${mins}m, first tick in ${START_DELAY_MS / 1000}s`);
  scheduleNext(START_DELAY_MS);
}

function stop() {
  if (timer) { clearTimeout(timer); timer = null; }
}

module.exports = { start, stop, tick, refreshDevice, sweepOfflineAlerts };
