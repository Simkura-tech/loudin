/**
 * Simkura device-state sync worker.
 *
 * Polls the v2 device resource (GET /api/v2/devices/:id — state is embedded,
 * no separate /state endpoint) for every live device row and mirrors it into
 * `devices`:
 *
 *   status              ← meta.status ('online' | 'offline'; 'unknown' ignored —
 *                          not in the column's CHECK constraint)
 *   last_seen           ← meta.lastSeen (never moved backwards — a webhook
 *                          event may have bumped it more recently)
 *   door_state          ← doors[0].lock.state
 *   door_position       ← doors[0].lock.position (open / closed; null unless
 *                          the board has door-position-sensing)
 *   door_override       ← doors[0].lock.override != 0 (boolean, kept for
 *                          older readers)
 *   door_override_mode  ← doors[0].lock.override (0 none / 1 command /
 *                          2 holiday — migration 089)
 *   reader_protocol     ← doors[0].reader.protocol (osdp / wiegand)
 *   reader_connection   ← doors[0].reader.connection (secure / insecure)
 *   reader_technology   ← doors[0].reader.technology (installer-recorded)
 *   latch_interval_s    ← doors[0].latchInterval
 *   fw_*_count          ← doors[0].counts (credentials / shifts / holidays)
 *   power_mode          ← power.state
 *   battery_percent     ← power.batteryPct (null for plug-in devices)
 *   battery_health      ← power.batteryHealth ('dead' = safe mode, motor
 *                          cannot actuate — surfaced so admins act on it)
 *   battery_chemistry   ← power.batteryChemistry (alkaline / lithium / li-ion)
 *   firmware_version    ← device.firmware (keeps OTA updates visible)
 *   carrier             ← connectivity.carrier (cellular only)
 *   signal_strength     ← connectivity.signal (RSRP dBm, cellular only)
 *
 * Hardware profile (migration 085, mapped by hardwareProfile.js) — the
 * provisioning-time facts and capability tiers the UI gates features on:
 *   device_type, manufacturer, hardware_version, num_doors, deployed,
 *   capabilities, features, supported, card_formats, power_type,
 *   connectivity_transport. Mirrored even for never-seen devices: a board's
 *   capabilities don't depend on it having checked in.
 *
 * Multi-door note: v2 models doors[] as first-class, but our schema is
 * single-door — we mirror door 1 only. Multi-door boards (SB8-4D) need a
 * doors table before their extra doors are visible here.
 *
 * The v1-era columns (osdp_stage, config_card_type, deep_sleep_duration_s,
 * fw_door_shift_count) were dropped in migration 087.
 *
 * This complements the webhook feed (routes/webhooks.js), which is
 * event-driven and only carries door/power/liveness. The poll is what keeps
 * battery + firmware fresh and is the only path that can mark a device
 * OFFLINE — webhooks by definition only arrive from devices that are up.
 *
 * Each refresh also reconciles pushed-but-unconfirmed junction rows against
 * Simkura's command records (services/access/commandAck) — the fallback for
 * the command.sent / command.failed webhooks.
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
const { profileFromResource, bindValue } = require('./hardwareProfile');
const { query } = require('../../database/db');
const events = require('../../integrations/events');
const commandAck = require('../../services/access/commandAck');

const INTERVAL_MS    = parseInt(process.env.SIMKURA_STATE_SYNC_INTERVAL_MS, 10) || 10 * 60 * 1000;
const ENABLED        = process.env.SIMKURA_STATE_SYNC_ENABLED !== 'false';
const START_DELAY_MS = 25_000; // after discovery's first tick so new devices get state on boot

// device.offline_extended fires when a claimed device hasn't been seen for
// this many hours (once per offline episode — see sweepOfflineAlerts).
const OFFLINE_ALERT_HOURS = parseInt(process.env.SIMKURA_OFFLINE_ALERT_HOURS, 10) || 48;

let timer = null;
let running = false;
let lastLoggedError = null;

const STATUSES        = new Set(['online', 'offline']);
const DOOR_STATES     = new Set(['locked', 'unlocked', 'lockdown']);
const DOOR_POSITIONS  = new Set(['open', 'closed']);
const READER_PROTOCOLS    = new Set(['osdp', 'wiegand']);
const READER_CONNECTIONS  = new Set(['secure', 'insecure']);
const READER_TECHNOLOGIES = new Set(['prox', 'smartcard', 'nfc', 'ble', 'multi']);
const POWER_MODES     = new Set(['active', 'sleep', 'deep_sleep']);
const BATTERY_HEALTHS = new Set(['ok', 'low', 'dead']);
const BATTERY_CHEMISTRIES = new Set(['alkaline', 'lithium', 'li-ion']);

/**
 * Map a v2 device resource onto the `devices` columns we mirror. Fields the
 * payload doesn't carry (or carries with an unusable value) are omitted so
 * the UPDATE never nulls out data we already have. Capability blocks are
 * only present when the device declares the capability — optional chaining
 * handles their absence.
 */
function fieldsFromState(resource) {
  // Hardware profile first: board facts and capability tiers are valid
  // whether or not the device has ever checked in.
  const out = profileFromResource(resource);

  if (STATUSES.has(resource?.meta?.status)) out.status = resource.meta.status;

  // A device that has never checked in (lastSeen null) has nothing measured
  // yet — mirroring its defaults would show a factory-new lock as "0%
  // battery". Status and profile (above) are still meaningful; skip the rest.
  const lastSeen = resource?.meta?.lastSeen ? new Date(resource.meta.lastSeen) : null;
  if (!lastSeen || Number.isNaN(lastSeen.getTime())) return out;

  // Single-door mirror: door 1 only (see header note on multi-door).
  const door = Array.isArray(resource?.doors) ? resource.doors[0] : null;

  const doorState = door?.lock?.state;
  if (DOOR_STATES.has(doorState)) out.door_state = doorState;

  // Position is null unless the board senses it; an explicit null clears a
  // value a previous firmware might have reported.
  const position = door?.lock?.position;
  if (DOOR_POSITIONS.has(position)) out.door_position = position;
  else if (position === null)       out.door_position = null;

  // Reader facts: protocol/connection are reported, technology is the value
  // an installer recorded via lock.configure. Nulls are meaningful (wiegand
  // has no secure channel; technology may simply never have been set).
  if (door && typeof door === 'object' && 'reader' in door) {
    const reader = door.reader ?? {};
    out.reader_protocol   = READER_PROTOCOLS.has(reader.protocol)     ? reader.protocol   : null;
    out.reader_connection = READER_CONNECTIONS.has(reader.connection) ? reader.connection : null;
    out.reader_technology = READER_TECHNOLOGIES.has(reader.technology) ? reader.technology : null;
  }

  // Override: 0 = schedule-controlled, 1 = command override, 2 = holiday.
  // door_override_mode keeps the distinction (migration 089); the boolean
  // stays in step for older readers.
  const override = door?.lock?.override;
  if (override === 0 || override === 1 || override === 2) {
    out.door_override      = override !== 0;
    out.door_override_mode = override === 0 ? 'none' : override === 1 ? 'command' : 'holiday';
  } else if (typeof override === 'boolean') {
    out.door_override      = override;
    out.door_override_mode = override ? 'command' : 'none';
  }

  const latch = Number(door?.latchInterval);
  if (Number.isInteger(latch) && latch >= 1 && latch <= 255) out.latch_interval_s = latch;

  // Record counts as reported BY the firmware — the device-side truth the
  // sync UI can hold up against our junction tables. Door-scoped in v2 (on
  // single-door hardware the device-wide store is reported as door 1's).
  const countCols = {
    fw_credential_count: door?.counts?.credentials,
    fw_shift_count:      door?.counts?.shifts,
    fw_holiday_count:    door?.counts?.holidays,
  };
  for (const [col, raw] of Object.entries(countCols)) {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) out[col] = n;
  }

  const powerMode = resource?.power?.state;
  if (POWER_MODES.has(powerMode)) out.power_mode = powerMode;

  // batteryPct is null for plug-in devices — leave the column untouched then.
  const pct = Number(resource?.power?.batteryPct);
  if (resource?.power?.batteryPct != null && Number.isFinite(pct)) {
    out.battery_percent = Math.max(0, Math.min(100, Math.round(pct)));
  }

  if (BATTERY_HEALTHS.has(resource?.power?.batteryHealth)) {
    out.battery_health = resource.power.batteryHealth;
  }

  if (BATTERY_CHEMISTRIES.has(resource?.power?.batteryChemistry)) {
    out.battery_chemistry = resource.power.batteryChemistry;
  }

  if (typeof resource?.device?.firmware === 'string' && resource.device.firmware.trim()) {
    out.firmware_version = resource.device.firmware.trim();
  }

  // Connectivity: carrier/signal are cellular-only and nullable. A named
  // carrier makes signal meaningful (even 0); otherwise store NULLs rather
  // than pretending we measured no signal. Signal is RSRP dBm, raw.
  const carrier = typeof resource?.connectivity?.carrier === 'string'
    ? resource.connectivity.carrier.trim()
    : '';
  const signal = Number(resource?.connectivity?.signal);
  out.carrier = carrier || null;
  out.signal_strength = carrier && Number.isFinite(signal) ? Math.round(signal) : null;

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
    state = await simkuraClient.getDevice(hwId);
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
      params.push(bindValue(col, value));
      sets.push(`${col} = $${params.length}`);
    }
  }

  await query(
    `UPDATE devices
        SET ${sets.join(', ')}, updated_at = NOW()
      WHERE device_id = $1 AND deleted_at IS NULL`,
    params
  );

  // Close the loop on pushes still awaiting delivery confirmation. The
  // command.sent webhook (data.commandRef) is the primary path; this covers
  // deployments without a registered webhook and any missed delivery. Only
  // costs a request when something is actually outstanding.
  try {
    const ack = await commandAck.reconcile(hwId, simkuraClient);
    if (ack.sent > 0 || ack.failed > 0) {
      console.log(`[simkura-state] ${hwId}: reconciled ${ack.sent} sent, ${ack.failed} failed command(s)`);
    }
  } catch (err) {
    console.warn('[simkura-state] command reconcile failed for', hwId, '—', err.message);
  }

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
                c.company_type`,
    [OFFLINE_ALERT_HOURS]
  );

  for (const r of rows) {
    void events.emit('device.offline_extended', {
      company:  { id: r.company_id, type: r.company_type },
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

module.exports = { start, stop, tick, refreshDevice, sweepOfflineAlerts, fieldsFromState };
