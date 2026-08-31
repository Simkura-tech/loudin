/**
 * Device push orchestrator.
 *
 * “Update device” walks the per-device junction tables (device_credentials,
 * device_shifts) and pushes the firmware into line with our DB by firing a
 * sequence of bw* commands at Simkura.
 *
 * Before firing, a pre-flight check asks Simkura's command queue
 * (GET /devices/:hwId/queue) whether a previous rebuild is still pending —
 * sleeping devices hold commands until they wake, and Simkura deliberately
 * never dedupes the data-record commands, so re-pushing would double-queue
 * the rebuild. Blocked pushes return { blocked: true }; pass force:true to
 * override.
 *
 * Two modes:
 *
 * DELTA (default) — the firmware only knows "add credential" and "delete
 * credential", so we send exactly the pending changes:
 *
 *   1. bwCredDeactivate × N   — one per soft-deleted junction row; the row
 *                               is hard-deleted once the command lands
 *   2. bwCred × N             — one per active row not yet submitted
 *   3. (only if any shift changed — there is no per-shift delete command,
 *       so shift changes rebuild the shift table wholesale)
 *      bwClear { clearType: “schedules” }   — unbind first; some firmware
 *                                             refuses to wipe referenced shifts
 *      bw_shift_clear
 *      bwShift × N                          — every active shift
 *      bwDoorSched { scheduleIds: [...] }   — skipped if no shifts remain
 *
 * REBUILD (force:true) — wipe everything and re-push the full active state.
 * The escape hatch for a lock whose contents have drifted from the DB:
 *
 *   1. bwClear { clearType: “schedules” }
 *   2. bw_cred_clear                          (credentials before shifts — spec order)
 *   3. bw_shift_clear
 *   4. bwCred  × N
 *   5. bwShift × N
 *   6. bwDoorSched { scheduleIds: [...] }     (skipped if no shifts)
 *
 * NB the three wipes are deliberately three DISTINCT command types.
 * Simkura-core dedupes queued commands by command_type (payload ignored),
 * so bwClear × 3 with different clearTypes collapses into one queue row on
 * a sleeping device. bwClear is only ever used for the schedules unbind;
 * credentials and shifts wipe via their dedicated bw_cred_clear /
 * bw_shift_clear commands.
 *
 * Either way, soft-deleted junction rows are hard-deleted once the firmware
 * no longer holds them (deactivated in delta mode; wiped in rebuild mode).
 *
 * Stamping model (see migration 058):
 *   * applied_at    set when the junction row was created/updated
 *   * submitted_at  STAMPED HERE on Simkura 200 ACK for the corresponding command
 *   * synced_at     STAMPED HERE alongside submitted_at — Simkura's 200 ACK
 *                   is the best confirmation available for bwCred/bwShift
 *                   (command.sent only fires for bwUnlock/bwProvision)
 *
 * No transaction: each Simkura call is an independent HTTP round trip and
 * cannot be rolled back. On failure we stop the sequence, keep whatever
 * stamps/deletes the completed commands earned, and return a partial-
 * success report. The next pushAll call picks up from there.
 *
 * Per memory feedback-credentials-master-only:
 *   bwCred is forced to cardClass:1 and never includes shiftIds. The door
 *   schedule (bwDoorSched) is what gates time-based access, not per-credential
 *   shift assignments.
 */

const { query } = require('../../database/db');

// Translate our credentials.credential_type ('pin' | 'HID' | 'mifare') into
// Simkura's credentialType taxonomy ('pin' | '26bit' | '32bit' | '34bit' |
// 'mifare_classic_1k'). 'HID' is ambiguous between 26bit/32bit/34bit in our
// DB — we default to 32bit which is the most common HID variant. Refine
// here when finer-grained card types are surfaced.
function mapCredentialType(ourType) {
  switch (ourType) {
    case 'pin':    return 'pin';
    case 'HID':    return '32bit';
    case 'mifare': return 'mifare_classic_1k';
    default:       return null;
  }
}

// Build the bwCred payload for a single credential row. Returns null if
// the row can't be mapped to a valid payload (missing required fields,
// unknown type, etc.) — caller should skip those.
function bwCredPayload(cred) {
  const credentialType = mapCredentialType(cred.credential_type);
  if (!credentialType) return null;

  const base = {
    credentialType,
    cardClass: 1,   // master-only per feedback-credentials-master-only
  };

  if (credentialType === 'pin') {
    const pin = parseInt(cred.credential_value, 10);
    if (!Number.isFinite(pin)) return null;
    return { ...base, pinCode: pin };
  }

  const cardNumber = parseInt(cred.card_number, 10);
  if (!Number.isFinite(cardNumber)) return null;
  const facilityCode = cred.facility_code != null
    ? parseInt(cred.facility_code, 10) || 0
    : 0;
  return { ...base, cardNumber, facilityCode };
}

// Build the bwCredDeactivate payload. The spec shape is exactly
// { cardNumber, facilityCode } — no credentialType/cardClass. The lock has
// no record ids; PIN credentials are identified by their PIN value in the
// cardNumber field (facilityCode 0). Returns null for unmappable rows.
// TBD (simkura-spec): the PIN may need to be hex-encoded rather than the
// decimal value — pending confirmation against the firmware.
function bwCredDeactivatePayload(cred) {
  if (cred.credential_type === 'pin') {
    const pin = parseInt(cred.credential_value, 10);
    if (!Number.isFinite(pin)) return null;
    return { cardNumber: pin, facilityCode: 0 };
  }
  const cardNumber = parseInt(cred.card_number, 10);
  if (!Number.isFinite(cardNumber)) return null;
  const facilityCode = cred.facility_code != null
    ? parseInt(cred.facility_code, 10) || 0
    : 0;
  return { cardNumber, facilityCode };
}

// Translate days_of_week (JSONB array of 0-6 with 0=Sunday) to Simkura's
// string-day list. Simkura accepts numbers (1=Monday … 7=Sunday) OR strings;
// we use strings for readability in command history.
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function bwShiftPayload(shift) {
  const [sH, sM, sS] = String(shift.start_time).split(':').map((n) => parseInt(n, 10) || 0);
  const [eH, eM, eS] = String(shift.end_time).split(':').map((n) => parseInt(n, 10) || 0);
  let days = shift.days_of_week;
  if (typeof days === 'string') {
    try { days = JSON.parse(days); } catch { days = []; }
  }
  const daysOfWeek = Array.isArray(days)
    ? days.map((d) => DAY_NAMES[d]).filter(Boolean)
    : [];
  return {
    shiftId: shift.id,
    startHour: sH, startMinute: sM, startSecond: sS,
    endHour:   eH, endMinute:   eM, endSecond:   eS,
    daysOfWeek,
    scheduleType: 'normal',
  };
}

// The command types a rebuild is made of. A pending/processing row of any
// of these in Simkura's queue means a previous push is still waiting for
// the device to wake. Simkura intentionally never dedupes the data-record
// types (bwCred/bwShift/bwDoorSched — each row is a distinct record), so
// pushing again while one is in flight double-queues the whole rebuild.
const REBUILD_COMMAND_TYPES = new Set([
  'bwClear', 'bw_cred_clear', 'bw_shift_clear',
  'bwCred', 'bwCredDeactivate', 'bwShift', 'bwDoorSched',
]);
const IN_FLIGHT_STATUSES    = new Set(['pending', 'processing']);

/**
 * Pre-flight check: rebuild commands still sitting in Simkura's queue for
 * this device. Fail-open — if the queue endpoint is unreachable (older
 * Simkura deploy, transient error) we return [] and let the push proceed,
 * since blocking pushes on a visibility feature would be worse than the
 * duplicate risk it mitigates.
 */
async function getInFlightRebuild(simkura, hwId) {
  try {
    const commands = await simkura.getDeviceQueue(hwId, { limit: 100 });
    return commands.filter(
      (c) => REBUILD_COMMAND_TYPES.has(c.command_type) && IN_FLIGHT_STATUSES.has(c.status)
    );
  } catch (err) {
    console.warn('[devicePush] queue pre-flight check failed for', hwId, '—', err.message);
    return [];
  }
}

/** Resolve the device row or return the error result the caller should relay. */
async function loadDevice(deviceId) {
  const { rows } = await query(
    `SELECT id, device_id, deleted_at
       FROM devices
      WHERE id = $1`,
    [deviceId]
  );
  const device = rows[0];
  if (!device) {
    return { error: { ok: false, hwId: null, sequence: [], error: 'Device not found' } };
  }
  if (device.deleted_at) {
    return { error: { ok: false, hwId: device.device_id, sequence: [], error: 'Device is deactivated' } };
  }
  return { device };
}

/**
 * Helper: fire one command at Simkura, appending to `sequence`. Returns
 * { ok, detail }; caller decides whether to continue after a failure.
 */
function makeFire(simkura, hwId, sequence) {
  return async function fire(command, payload) {
    try {
      await simkura.publishCommand(hwId, command, payload);
      sequence.push({ command, status: 'ok' });
      return { ok: true };
    } catch (err) {
      const detail = err.response?.data?.error || err.message || 'unknown';
      sequence.push({ command, status: 'failed', detail });
      return { ok: false, detail };
    }
  };
}

const ACTIVE_SHIFTS_SQL = `
  SELECT ds.id AS junction_id,
         s.id, s.shift_name, s.start_time, s.end_time, s.days_of_week
    FROM device_shifts ds
    JOIN shifts s ON s.id = ds.shift_id
   WHERE ds.device_id = $1
     AND ds.deleted_at IS NULL
     AND s.deleted_at IS NULL
   ORDER BY s.id`;

async function stampSubmitted(table, junctionIds) {
  if (junctionIds.length === 0) return;
  await query(
    `UPDATE ${table} SET submitted_at = NOW(), synced_at = NOW()
      WHERE id = ANY($1::int[])`,
    [junctionIds]
  );
}

/**
 * Push the device's pending credential + shift changes to Simkura.
 *
 * @param {Object} args
 * @param {number} args.deviceId  — our `devices.id`
 * @param {Object} args.simkura   — SimkuraClient instance (already verified .isAvailable())
 * @param {boolean} [args.force]  — full wipe-and-rebuild instead of a delta,
 *   and skip the in-flight pre-flight check ("device is stuck, push anyway")
 * @returns {Promise<{
 *   ok: boolean,
 *   hwId: string,
 *   mode: 'delta'|'rebuild',
 *   sequence: Array<{ command: string, status: 'ok'|'failed'|'skipped', detail?: string }>,
 *   noop?: boolean,
 *   blocked?: boolean,
 *   queued?: number,
 *   error?: string,
 * }>}
 */
async function pushAll({ deviceId, simkura, force = false }) {
  const resolved = await loadDevice(deviceId);
  if (resolved.error) return resolved.error;
  const hwId = resolved.device.device_id;
  const sequence = [];
  const mode = force ? 'rebuild' : 'delta';

  // Pre-flight: don't stack a second push on top of one that's still queued
  // (sleeping device). Simkura's retry handles delivery — our job is just
  // not to double-queue. `force` overrides for the "device is stuck, push
  // anyway" case.
  if (!force) {
    const inFlight = await getInFlightRebuild(simkura, hwId);
    if (inFlight.length > 0) {
      return {
        ok: false,
        blocked: true,
        hwId,
        mode,
        sequence,
        queued: inFlight.length,
        error:
          `A previous update (${inFlight.length} command${inFlight.length === 1 ? '' : 's'}) ` +
          'is still queued on the device. It will apply when the device next wakes — ' +
          'try again after it syncs.',
      };
    }
  }

  const fire = makeFire(simkura, hwId, sequence);

  return force
    ? rebuild({ deviceId, hwId, sequence, fire })
    : delta({ deviceId, hwId, sequence, fire });
}

// ── Delta mode ────────────────────────────────────────────────────────────────

async function delta({ deviceId, hwId, sequence, fire }) {
  // "Pending add" mirrors the sync-summary predicate in
  // controllers/access/devices.js get() — keep the two in lockstep so a
  // push always drives the banner counts to zero.
  const [{ rows: credAdds }, { rows: credRemovals }, { rows: activeShifts }, { rows: [shiftPending] }] =
    await Promise.all([
      query(
        `SELECT dc.id AS junction_id,
                c.id, c.credential_type, c.credential_value,
                c.card_number, c.facility_code
           FROM device_credentials dc
           JOIN credentials c ON c.id = dc.credential_id
          WHERE dc.device_id = $1
            AND dc.deleted_at IS NULL
            AND c.deleted_at IS NULL
            AND dc.submitted_at IS NULL
            AND (dc.synced_at IS NULL OR dc.synced_at < dc.applied_at)
          ORDER BY c.id`,
        [deviceId]
      ),
      // LEFT JOIN: the credential row itself may have been deleted after the
      // detach — we still need its data to tell the lock what to deactivate.
      query(
        `SELECT dc.id AS junction_id,
                c.id, c.credential_type, c.credential_value,
                c.card_number, c.facility_code
           FROM device_credentials dc
           LEFT JOIN credentials c ON c.id = dc.credential_id
          WHERE dc.device_id = $1
            AND dc.deleted_at IS NOT NULL
          ORDER BY dc.id`,
        [deviceId]
      ),
      query(ACTIVE_SHIFTS_SQL, [deviceId]),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE deleted_at IS NULL
                              AND submitted_at IS NULL
                              AND (synced_at IS NULL OR synced_at < applied_at))::int AS adds,
           COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS removes
           FROM device_shifts
          WHERE device_id = $1`,
        [deviceId]
      ),
    ]);

  const shiftsDirty = shiftPending.adds > 0 || shiftPending.removes > 0;
  if (credAdds.length === 0 && credRemovals.length === 0 && !shiftsDirty) {
    return { ok: true, hwId, mode: 'delta', sequence, noop: true };
  }

  // 1. Deactivate removed credentials first — frees table slots on the lock
  // before we add. Each row is hard-deleted once its deactivate lands (the
  // deletes are batched below but survive a mid-sequence failure).
  const removedJunctions = [];
  let removeFailure = null;
  for (const c of credRemovals) {
    const payload = bwCredDeactivatePayload(c);
    if (!payload) {
      // Unmappable rows were skipped at add time too, so the lock almost
      // certainly never held them — settle the bookkeeping. If it somehow
      // does, a force rebuild wipes it.
      sequence.push({
        command: 'bwCredDeactivate',
        status:  'skipped',
        detail:  `credential ${c.id ?? `(junction ${c.junction_id})`}: unmappable — run a full re-sync if the lock still holds it`,
      });
      removedJunctions.push(c.junction_id);
      continue;
    }
    const r = await fire('bwCredDeactivate', payload);
    if (!r.ok) { removeFailure = r.detail; break; }
    removedJunctions.push(c.junction_id);
  }
  if (removedJunctions.length > 0) {
    await query(
      `DELETE FROM device_credentials WHERE id = ANY($1::int[])`,
      [removedJunctions]
    );
  }
  if (removeFailure) return { ok: false, hwId, mode: 'delta', sequence, error: removeFailure };

  // 2. Push new credentials. Stamp incrementally-collected successes even on
  // a mid-sequence failure — re-sending an already-delivered bwCred would
  // duplicate the record on the lock (firmware has no upsert).
  const submittedCreds = [];
  let addFailure = null;
  for (const c of credAdds) {
    const payload = bwCredPayload(c);
    if (!payload) {
      sequence.push({ command: 'bwCred', status: 'skipped', detail: `credential ${c.id}: unmappable` });
      continue;
    }
    const r = await fire('bwCred', payload);
    if (!r.ok) { addFailure = r.detail; break; }
    submittedCreds.push(c.junction_id);
  }
  await stampSubmitted('device_credentials', submittedCreds);
  if (addFailure) return { ok: false, hwId, mode: 'delta', sequence, error: addFailure };

  // 3. Shifts: no per-shift delete command exists, so any shift change
  // rebuilds the lock's shift table wholesale.
  if (shiftsDirty) {
    // Unbind the door schedule first — some firmware versions refuse to
    // wipe shift definitions while the door schedule still references them.
    const r1 = await fire('bwClear', { clearType: 'schedules' });
    if (!r1.ok) return { ok: false, hwId, mode: 'delta', sequence, error: r1.detail };
    const r2 = await fire('bw_shift_clear');
    if (!r2.ok) return { ok: false, hwId, mode: 'delta', sequence, error: r2.detail };

    // The wipe just removed the soft-deleted shifts from the lock — settle
    // their bookkeeping now, before the re-adds (which may still fail).
    await query(
      `DELETE FROM device_shifts WHERE device_id = $1 AND deleted_at IS NOT NULL`,
      [deviceId]
    );

    const submittedShiftJunctions = [];
    const submittedShiftIds = [];
    let shiftFailure = null;
    for (const s of activeShifts) {
      const r = await fire('bwShift', bwShiftPayload(s));
      if (!r.ok) { shiftFailure = r.detail; break; }
      submittedShiftJunctions.push(s.junction_id);
      submittedShiftIds.push(s.id);
    }
    await stampSubmitted('device_shifts', submittedShiftJunctions);
    if (shiftFailure) return { ok: false, hwId, mode: 'delta', sequence, error: shiftFailure };

    // Re-bind shifts to the door. Only sent when there are shifts — the spec
    // requires at least one scheduleId and firmware behaviour with an empty
    // array is undefined. With no shifts the door runs open-access
    // (credentials only, no time gating), which is the correct default.
    if (submittedShiftIds.length > 0) {
      const r3 = await fire('bwDoorSched', { scheduleIds: submittedShiftIds });
      if (!r3.ok) return { ok: false, hwId, mode: 'delta', sequence, error: r3.detail };
    }
  }

  return { ok: true, hwId, mode: 'delta', sequence };
}

// ── Rebuild mode (force) ──────────────────────────────────────────────────────

async function rebuild({ deviceId, hwId, sequence, fire }) {
  const [{ rows: creds }, { rows: shifts }] = await Promise.all([
    query(
      `SELECT dc.id AS junction_id,
              c.id, c.credential_type, c.credential_value,
              c.card_number, c.facility_code
         FROM device_credentials dc
         JOIN credentials c ON c.id = dc.credential_id
        WHERE dc.device_id = $1
          AND dc.deleted_at IS NULL
          AND c.deleted_at IS NULL
        ORDER BY c.id`,
      [deviceId]
    ),
    query(ACTIVE_SHIFTS_SQL, [deviceId]),
  ]);

  // 1. Clear the door-schedule binding first. This must come before clearing
  // shifts — some firmware versions refuse to wipe shift definitions while
  // the door schedule still references them, which caused the "shifts not
  // cleared" bug seen in live testing.
  const r1 = await fire('bwClear', { clearType: 'schedules' });
  if (!r1.ok) return { ok: false, hwId, mode: 'rebuild', sequence, error: r1.detail };

  // 2. Clear credentials before shifts (spec order).
  const r2 = await fire('bw_cred_clear');
  if (!r2.ok) return { ok: false, hwId, mode: 'rebuild', sequence, error: r2.detail };

  // 3. Now safe to wipe shift definitions — nothing references them.
  const r3 = await fire('bw_shift_clear');
  if (!r3.ok) return { ok: false, hwId, mode: 'rebuild', sequence, error: r3.detail };

  // The wipe removed everything the lock held, including anything pending
  // removal — settle that bookkeeping before the re-adds (which may fail).
  await query(
    `DELETE FROM device_credentials WHERE device_id = $1 AND deleted_at IS NOT NULL`,
    [deviceId]
  );
  await query(
    `DELETE FROM device_shifts WHERE device_id = $1 AND deleted_at IS NOT NULL`,
    [deviceId]
  );

  // 4. Push each active credential. Skip rows we can't map (unknown type,
  // missing required fields) but keep going — they'll surface in the report.
  const submittedCredJunctions = [];
  let credFailure = null;
  for (const c of creds) {
    const payload = bwCredPayload(c);
    if (!payload) {
      sequence.push({ command: 'bwCred', status: 'skipped', detail: `credential ${c.id}: unmappable` });
      continue;
    }
    const r = await fire('bwCred', payload);
    if (!r.ok) { credFailure = r.detail; break; }
    submittedCredJunctions.push(c.junction_id);
  }
  await stampSubmitted('device_credentials', submittedCredJunctions);
  if (credFailure) return { ok: false, hwId, mode: 'rebuild', sequence, error: credFailure };

  // 5. Push each active shift.
  const submittedShiftJunctions = [];
  const submittedShiftIds = [];
  let shiftFailure = null;
  for (const s of shifts) {
    const r = await fire('bwShift', bwShiftPayload(s));
    if (!r.ok) { shiftFailure = r.detail; break; }
    submittedShiftJunctions.push(s.junction_id);
    submittedShiftIds.push(s.id);
  }
  await stampSubmitted('device_shifts', submittedShiftJunctions);
  if (shiftFailure) return { ok: false, hwId, mode: 'rebuild', sequence, error: shiftFailure };

  // 6. Bind shifts to the door. Only sent when there are shifts — the spec
  // requires at least one scheduleId and firmware behaviour with an empty
  // array is undefined. If there are no shifts the door runs open-access
  // (credentials only, no time gating), which is the correct default.
  if (submittedShiftIds.length > 0) {
    const r6 = await fire('bwDoorSched', { scheduleIds: submittedShiftIds });
    if (!r6.ok) return { ok: false, hwId, mode: 'rebuild', sequence, error: r6.detail };
  }

  return { ok: true, hwId, mode: 'rebuild', sequence };
}

// ── Clear ─────────────────────────────────────────────────────────────────────

/**
 * Wipe the lock and drop its assignments: clear schedules, credentials, and
 * shifts on the firmware, then remove the corresponding device_credentials /
 * device_shifts rows (and soft-delete the underlying shifts — they're 1:1
 * with the device per the deviceShifts create() flow). The device itself
 * stays claimed by its company.
 *
 * DB cleanup happens per-step, right after the matching bwClear lands, so a
 * mid-sequence failure never claims more was removed than the lock actually
 * dropped. Success is externally verifiable: the device reports
 * fw_credential_count / fw_shift_count of 0 on its next check-in.
 */
async function clearAll({ deviceId, simkura }) {
  const resolved = await loadDevice(deviceId);
  if (resolved.error) return resolved.error;
  const hwId = resolved.device.device_id;
  const sequence = [];
  const fire = makeFire(simkura, hwId, sequence);

  // Unbind the door schedule first (same firmware constraint as pushAll).
  const r1 = await fire('bwClear', { clearType: 'schedules' });
  if (!r1.ok) return { ok: false, hwId, sequence, error: r1.detail };

  const r2 = await fire('bw_cred_clear');
  if (!r2.ok) return { ok: false, hwId, sequence, error: r2.detail };
  await query(`DELETE FROM device_credentials WHERE device_id = $1`, [deviceId]);

  const r3 = await fire('bw_shift_clear');
  if (!r3.ok) return { ok: false, hwId, sequence, error: r3.detail };
  await query(
    `UPDATE shifts
        SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE deleted_at IS NULL
        AND id IN (SELECT shift_id FROM device_shifts WHERE device_id = $1)`,
    [deviceId]
  );
  await query(`DELETE FROM device_shifts WHERE device_id = $1`, [deviceId]);

  return { ok: true, hwId, sequence };
}

module.exports = { pushAll, clearAll };
