/**
 * Device push orchestrator (Simkura v2 command surface).
 *
 * “Update device” walks the per-device junction tables (device_credentials,
 * device_shifts) and pushes the firmware into line with our DB by firing a
 * sequence of v2 resource-style commands at Simkura. All commands are async
 * (202 + queued-command record); sleeping devices hold their queue until
 * they wake.
 *
 * Doors: Loudin models devices as single-door — every command targets door 1.
 *
 * Pre-flight: data-record commands (credentials/shifts/holidays/schedule)
 * always STACK in Simkura's queue — only singleton types (unlock, lock-state,
 * config, reboot) are deduped server-side. So before a push we check the
 * device's active queue for a rebuild still in flight and refuse to
 * double-queue. Blocked pushes return { blocked: true }; force:true overrides.
 *
 * Two modes:
 *
 * DELTA (default) — send exactly the pending changes:
 *   1. credentials.remove × N — one per soft-deleted junction row (PIN rows
 *      via ?type=pin); the row is hard-deleted once the command is accepted
 *   2. credentials.add × N — one per active row not yet submitted
 *   3. (only if any shift changed — single-shift removal is unsupported by
 *       firmware, so shift changes rebuild the shift table wholesale)
 *      schedule.clear   — unbind first; firmware refuses to wipe shifts the
 *                         door schedule still references
 *      shifts.clear
 *      shifts.add × N   — every active shift
 *      schedule.set     — skipped if no shifts remain (empty binding is
 *                         undefined firmware behaviour; no shifts = door
 *                         runs credentials-only, the correct default)
 *
 * REBUILD (force:true) — wipe everything and re-push the full active state:
 *   schedule.clear → credentials.clear → shifts.clear → holidays.clear →
 *   credentials.add × N → shifts.add × N → schedule.set
 *   (holidays.clear wipes drifted/legacy holiday records; holiday *push*
 *   lands with the device-holiday attach feature — the junction has no
 *   delta lifecycle columns yet)
 *
 * Firmware shift slots: v2 validates shiftId as 1–255, but our shifts.id is
 * an unbounded serial. Shift pushes are always wholesale (clear + re-add),
 * so we assign slot numbers 1..N in push order and bind the schedule to the
 * same slots — DB ids never reach the firmware.
 *
 * Stamping model (see migration 058):
 *   * applied_at    set when the junction row was created/updated
 *   * submitted_at  STAMPED HERE on Simkura's 202 (command queued)
 *   * synced_at     STAMPED HERE alongside submitted_at — v2 does not yet
 *                   correlate device-level acknowledgement to command
 *                   records (an 'acknowledged' status is planned upstream);
 *                   until then the 202 is the best confirmation available
 *
 * No transaction: each Simkura call is an independent HTTP round trip and
 * cannot be rolled back. On failure we stop the sequence, keep whatever
 * stamps/deletes the completed commands earned, and return a partial-
 * success report. The next pushAll call picks up from there.
 *
 * Per memory feedback-credentials-master-only:
 *   credentials are pushed with class:'master' and never carry shiftIds.
 *   The door schedule (schedule.set) is what gates time-based access, not
 *   per-credential shift assignments.
 */

const { query } = require('../../database/db');

const DOOR = 1; // single-door model — see header

// Translate our credentials.credential_type ('pin' | 'HID' | 'mifare') into
// the v2 credential-type enum. 'HID' is ambiguous between wiegand-26/hid-32
// in our DB — we default to hid-32, the most common variant. Refine here
// when finer-grained card types are surfaced.
function mapCredentialType(ourType) {
  switch (ourType) {
    case 'pin':    return 'pin';
    case 'HID':    return 'hid-32';
    case 'mifare': return 'mifare-classic-1k';
    default:       return null;
  }
}

// Build the credentials.add body for one credential row. Returns null if
// the row can't be mapped (missing required fields, unknown type) — caller
// should skip those.
function credentialAddBody(cred) {
  const type = mapCredentialType(cred.credential_type);
  if (!type) return null;

  const base = { type, class: 'master' }; // master-only per memory note above

  if (type === 'pin') {
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

// Arguments for credentials.remove: the path id is the card number, or the
// PIN code itself with ?type=pin (per the v2 spec). Returns null for
// unmappable rows.
function credentialRemoveArgs(cred) {
  if (cred.credential_type === 'pin') {
    const pin = parseInt(cred.credential_value, 10);
    if (!Number.isFinite(pin)) return null;
    return { credentialId: pin, opts: { type: 'pin' } };
  }
  const cardNumber = parseInt(cred.card_number, 10);
  if (!Number.isFinite(cardNumber)) return null;
  const facilityCode = cred.facility_code != null
    ? parseInt(cred.facility_code, 10) || 0
    : 0;
  return { credentialId: cardNumber, opts: { facilityCode } };
}

// days_of_week is JSONB 0–6 with 0=Sunday; v2 wants full lowercase day names.
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** 'H:M:S'-ish → strict 'HH:MM:SS' (v2 validates the pattern). */
function hhmmss(t) {
  const [h = 0, m = 0, s = 0] = String(t).split(':').map((n) => parseInt(n, 10) || 0);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

// Build the shifts.add body. `slot` is the 1-based firmware slot assigned
// for this push (NOT the DB id — see header).
function shiftAddBody(shift, slot) {
  let days = shift.days_of_week;
  if (typeof days === 'string') {
    try { days = JSON.parse(days); } catch { days = []; }
  }
  return {
    shiftId: slot,
    start:   hhmmss(shift.start_time),
    end:     hhmmss(shift.end_time),
    days:    Array.isArray(days) ? days.map((d) => DAY_NAMES[d]).filter(Boolean) : [],
    type:    'normal',
  };
}

// Operations that make up a rebuild. Any of these queued/sending on the
// device means a previous push hasn't reached it yet — data records stack,
// so pushing again would double-queue the rebuild.
const REBUILD_OPERATIONS = new Set([
  'credentials.add', 'credentials.remove', 'credentials.clear',
  'shifts.add', 'shifts.clear',
  'holidays.add', 'holidays.clear',
  'schedule.set', 'schedule.clear',
]);

/**
 * Pre-flight check: rebuild commands still in the device's active queue
 * (listCommands without a status filter returns exactly queued + sending).
 * Fail-open — if the queue endpoint is unreachable we return [] and let the
 * push proceed, since blocking pushes on a visibility feature would be worse
 * than the duplicate risk it mitigates.
 */
async function getInFlightRebuild(simkura, hwId) {
  try {
    const commands = await simkura.listCommands(hwId, { limit: 100 });
    return commands.filter((c) => REBUILD_OPERATIONS.has(c.operation));
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
 * Helper: run one v2 command call, appending to `sequence`. `label` is the
 * catalog operation name; `call` is a thunk invoking the client method.
 * Returns { ok, detail }; caller decides whether to continue after failure.
 */
function makeFire(sequence) {
  return async function fire(label, call) {
    try {
      const record = await call();
      sequence.push({ command: label, status: 'ok', command_id: record?.id ?? null });
      return { ok: true, record };
    } catch (err) {
      const detail = err.response?.data?.error || err.message || 'unknown';
      sequence.push({ command: label, status: 'failed', detail });
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
 *   sequence: Array<{ command: string, status: 'ok'|'failed'|'skipped', command_id?: string, detail?: string }>,
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

  const fire = makeFire(sequence);

  return force
    ? rebuild({ deviceId, hwId, sequence, fire, simkura })
    : delta({ deviceId, hwId, sequence, fire, simkura });
}

// ── Delta mode ────────────────────────────────────────────────────────────────

async function delta({ deviceId, hwId, sequence, fire, simkura }) {
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
      // detach — we still need its data to tell the lock what to remove.
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

  // 1. Remove detached credentials first — frees table slots on the lock
  // before we add. Each row is hard-deleted once its remove is accepted (the
  // deletes are batched below but survive a mid-sequence failure).
  const removedJunctions = [];
  let removeFailure = null;
  for (const c of credRemovals) {
    const args = credentialRemoveArgs(c);
    if (!args) {
      // Unmappable rows were skipped at add time too, so the lock almost
      // certainly never held them — settle the bookkeeping. If it somehow
      // does, a force rebuild wipes it.
      sequence.push({
        command: 'credentials.remove',
        status:  'skipped',
        detail:  `credential ${c.id ?? `(junction ${c.junction_id})`}: unmappable — run a full re-sync if the lock still holds it`,
      });
      removedJunctions.push(c.junction_id);
      continue;
    }
    const r = await fire('credentials.remove', () =>
      simkura.removeCredential(hwId, DOOR, args.credentialId, args.opts));
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
  // a mid-sequence failure — re-sending an already-queued add would
  // duplicate the record on the lock (firmware has no upsert).
  const submittedCreds = [];
  let addFailure = null;
  for (const c of credAdds) {
    const body = credentialAddBody(c);
    if (!body) {
      sequence.push({ command: 'credentials.add', status: 'skipped', detail: `credential ${c.id}: unmappable` });
      continue;
    }
    const r = await fire('credentials.add', () => simkura.addCredential(hwId, DOOR, body));
    if (!r.ok) { addFailure = r.detail; break; }
    submittedCreds.push(c.junction_id);
  }
  await stampSubmitted('device_credentials', submittedCreds);
  if (addFailure) return { ok: false, hwId, mode: 'delta', sequence, error: addFailure };

  // 3. Shifts: single-shift removal is unsupported by firmware, so any shift
  // change rebuilds the lock's shift table wholesale.
  if (shiftsDirty) {
    // Unbind the door schedule first — firmware refuses to wipe shift
    // definitions the door schedule still references.
    const r1 = await fire('schedule.clear', () => simkura.clearDoorSchedule(hwId, DOOR));
    if (!r1.ok) return { ok: false, hwId, mode: 'delta', sequence, error: r1.detail };
    const r2 = await fire('shifts.clear', () => simkura.clearShifts(hwId, DOOR));
    if (!r2.ok) return { ok: false, hwId, mode: 'delta', sequence, error: r2.detail };

    // The wipe just removed the soft-deleted shifts from the lock — settle
    // their bookkeeping now, before the re-adds (which may still fail).
    await query(
      `DELETE FROM device_shifts WHERE device_id = $1 AND deleted_at IS NOT NULL`,
      [deviceId]
    );

    const submittedShiftJunctions = [];
    const slots = [];
    let shiftFailure = null;
    for (const [idx, s] of activeShifts.entries()) {
      const slot = idx + 1; // firmware slot, not DB id — see header
      const r = await fire('shifts.add', () => simkura.addShift(hwId, DOOR, shiftAddBody(s, slot)));
      if (!r.ok) { shiftFailure = r.detail; break; }
      submittedShiftJunctions.push(s.junction_id);
      slots.push(slot);
    }
    await stampSubmitted('device_shifts', submittedShiftJunctions);
    if (shiftFailure) return { ok: false, hwId, mode: 'delta', sequence, error: shiftFailure };

    // Re-bind shifts to the door — same slots we just defined. Only sent
    // when there are shifts: an empty binding is undefined firmware
    // behaviour, and no shifts = door runs credentials-only (correct default).
    if (slots.length > 0) {
      const r3 = await fire('schedule.set', () => simkura.setDoorSchedule(hwId, DOOR, slots));
      if (!r3.ok) return { ok: false, hwId, mode: 'delta', sequence, error: r3.detail };
    }
  }

  return { ok: true, hwId, mode: 'delta', sequence };
}

// ── Rebuild mode (force) ──────────────────────────────────────────────────────

async function rebuild({ deviceId, hwId, sequence, fire, simkura }) {
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

  // 1. Unbind the door schedule first — firmware refuses to wipe shift
  // definitions the schedule still references (caused a real "shifts not
  // cleared" bug in live testing).
  const r1 = await fire('schedule.clear', () => simkura.clearDoorSchedule(hwId, DOOR));
  if (!r1.ok) return { ok: false, hwId, mode: 'rebuild', sequence, error: r1.detail };

  // 2. Clear credentials before shifts (spec order), then shifts, then any
  // drifted/legacy holiday records (holiday push proper lands with the
  // device-holiday attach feature).
  const r2 = await fire('credentials.clear', () => simkura.clearCredentials(hwId, DOOR));
  if (!r2.ok) return { ok: false, hwId, mode: 'rebuild', sequence, error: r2.detail };

  const r3 = await fire('shifts.clear', () => simkura.clearShifts(hwId, DOOR));
  if (!r3.ok) return { ok: false, hwId, mode: 'rebuild', sequence, error: r3.detail };

  const r4 = await fire('holidays.clear', () => simkura.clearHolidays(hwId, DOOR));
  if (!r4.ok) return { ok: false, hwId, mode: 'rebuild', sequence, error: r4.detail };

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

  // 3. Push each active credential. Skip rows we can't map but keep going —
  // they surface in the report.
  const submittedCredJunctions = [];
  let credFailure = null;
  for (const c of creds) {
    const body = credentialAddBody(c);
    if (!body) {
      sequence.push({ command: 'credentials.add', status: 'skipped', detail: `credential ${c.id}: unmappable` });
      continue;
    }
    const r = await fire('credentials.add', () => simkura.addCredential(hwId, DOOR, body));
    if (!r.ok) { credFailure = r.detail; break; }
    submittedCredJunctions.push(c.junction_id);
  }
  await stampSubmitted('device_credentials', submittedCredJunctions);
  if (credFailure) return { ok: false, hwId, mode: 'rebuild', sequence, error: credFailure };

  // 4. Push each active shift on fresh firmware slots.
  const submittedShiftJunctions = [];
  const slots = [];
  let shiftFailure = null;
  for (const [idx, s] of shifts.entries()) {
    const slot = idx + 1;
    const r = await fire('shifts.add', () => simkura.addShift(hwId, DOOR, shiftAddBody(s, slot)));
    if (!r.ok) { shiftFailure = r.detail; break; }
    submittedShiftJunctions.push(s.junction_id);
    slots.push(slot);
  }
  await stampSubmitted('device_shifts', submittedShiftJunctions);
  if (shiftFailure) return { ok: false, hwId, mode: 'rebuild', sequence, error: shiftFailure };

  // 5. Bind the schedule to the slots just defined (skipped when no shifts —
  // see delta step 3).
  if (slots.length > 0) {
    const r5 = await fire('schedule.set', () => simkura.setDoorSchedule(hwId, DOOR, slots));
    if (!r5.ok) return { ok: false, hwId, mode: 'rebuild', sequence, error: r5.detail };
  }

  return { ok: true, hwId, mode: 'rebuild', sequence };
}

// ── Clear ─────────────────────────────────────────────────────────────────────

/**
 * Wipe the lock and drop its assignments: unbind the schedule, clear
 * credentials, shifts, and holidays on the firmware, then remove the
 * corresponding junction rows (and soft-delete the underlying shifts —
 * they're 1:1 with the device per the deviceShifts create() flow). The
 * device itself stays claimed by its company.
 *
 * DB cleanup happens per-step, right after the matching clear is accepted,
 * so a mid-sequence failure never claims more was removed than the lock
 * actually dropped. Success is externally verifiable: the device reports
 * fw_credential_count / fw_shift_count / fw_holiday_count of 0 on its next
 * check-in.
 */
async function clearAll({ deviceId, simkura }) {
  const resolved = await loadDevice(deviceId);
  if (resolved.error) return resolved.error;
  const hwId = resolved.device.device_id;
  const sequence = [];
  const fire = makeFire(sequence);

  // Unbind the door schedule first (same firmware constraint as pushAll).
  const r1 = await fire('schedule.clear', () => simkura.clearDoorSchedule(hwId, DOOR));
  if (!r1.ok) return { ok: false, hwId, sequence, error: r1.detail };

  const r2 = await fire('credentials.clear', () => simkura.clearCredentials(hwId, DOOR));
  if (!r2.ok) return { ok: false, hwId, sequence, error: r2.detail };
  await query(`DELETE FROM device_credentials WHERE device_id = $1`, [deviceId]);

  const r3 = await fire('shifts.clear', () => simkura.clearShifts(hwId, DOOR));
  if (!r3.ok) return { ok: false, hwId, sequence, error: r3.detail };
  await query(
    `UPDATE shifts
        SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE deleted_at IS NULL
        AND id IN (SELECT shift_id FROM device_shifts WHERE device_id = $1)`,
    [deviceId]
  );
  await query(`DELETE FROM device_shifts WHERE device_id = $1`, [deviceId]);

  const r4 = await fire('holidays.clear', () => simkura.clearHolidays(hwId, DOOR));
  if (!r4.ok) return { ok: false, hwId, sequence, error: r4.detail };
  await query(`DELETE FROM device_holidays WHERE device_id = $1`, [deviceId]);

  return { ok: true, hwId, sequence };
}

module.exports = { pushAll, clearAll };
module.exports._internal = { credentialAddBody, credentialRemoveArgs, shiftAddBody, mapCredentialType, hhmmss }; // for tests
