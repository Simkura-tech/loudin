/**
 * Device commands controller — Simkura command dispatch and full push sequence.
 *
 * Separated from devices.js (CRUD/lifecycle) because the command path has its
 * own allowlist, payload validation rules, and Simkura client dependency
 * that don't belong in the read/write device management layer.
 */

const { query } = require('../../database/db');

function badRequest(res, message, details) {
  return res.status(400).json({ error: 'Bad Request', message, ...(details && { details }) });
}

function notFound(res) {
  return res.status(404).json({ error: 'Not Found', message: 'Device not found' });
}

// ── Command allowlist ────────────────────────────────────────────────────────

const ALLOWED_COMMANDS = new Set([
  'bwUnlock',          // momentary unlock
  'bwState',           // set persistent door state
  'bwReset',           // soft reboot
  'bwCount',           // request inventory dump
  'bwProvision',       // initial provisioning — card-reader type + latch interval
  'bwCred',            // push one credential
  'bwShift',           // push one shift
  'bwDoorSched',       // bind shift schedule(s) to the door
  'bwCredDeactivate',  // deactivate a single credential
  'bw_cred_clear',     // wipe all credentials on the device
  'bw_shift_clear',    // wipe all shifts on the device
]);

// 'normal' (3) clears the override: the door returns to schedule-driven
// operation. 0/1/2 pin the door in that state (override flag set — shifts
// won't flip it back). Firmware supports 3 even though Simkura's public
// docs only list 0–2; the gateway's payload builder maps 'normal' → 0x03.
const BWSTATE_VALUES   = new Set(['locked', 'unlocked', 'lockdown', 'normal', 0, 1, 2, 3]);
const BWPROVISION_CARD = new Set([0, 1, 2]); // 0=26-bit Wiegand, 1=32-bit HID, 2=Mifare 1k

// ── Authorization ────────────────────────────────────────────────────────────

/**
 * Authorize the caller to act on the given hardware device_id and return
 * the matching DB row when one exists. Platform admins can act on any
 * device (claimed or unclaimed — including devices that have no row in our
 * `devices` table yet). Tenant admins are restricted to devices their
 * company owns.
 *
 * @returns {Promise<{ok: true, device: object|null} | {ok: false, status: number, message: string}>}
 */
async function authorizeDeviceAccess(req) {
  const hwId = req.params.hwId;
  if (!hwId) return { ok: false, status: 400, message: 'Missing device id' };

  const { rows } = await query(
    `SELECT id, device_id, device_name, company_id
       FROM devices
      WHERE device_id = $1 AND deleted_at IS NULL
      LIMIT 1`,
    [hwId]
  );
  const device = rows[0] || null;

  if (req.user.company_type === 'platform') {
    return { ok: true, device };
  }

  if (!device || device.company_id !== req.user.company_id) {
    return { ok: false, status: 404, message: 'Device not found' };
  }
  return { ok: true, device };
}

// ── POST /api/devices/:hwId/commands ────────────────────────────────────────
//
// Forward a command to the device via Simkura's REST API. The command name
// is whitelisted above — Simkura's catalog is bigger, but only commands an
// admin should be able to trigger from the UI are exposed.
//
// Payload notes:
//   bwState         — payload.state ∈ {'locked','unlocked','lockdown','normal'} (or 0|1|2|3)
//   bwProvision     — payload.cardType ∈ {0,1,2}, payload.latchInterval 1..255
//   bwCred          — payload describes a credential to push. cardClass is
//                     forced to 1 and shiftIds is stripped server-side
//                     (credentials are master-only in Loudin).
//   bwShift         — payload describes a shift to push
//   bwDoorSched     — payload.scheduleIds is a non-empty array of shift ids
//                     to bind to the door as its access schedule
//   bwCredDeactivate— payload identifies a single credential to deactivate
//   bw_cred_clear   — no payload; wipes all credentials on the device
//   bw_shift_clear  — no payload; wipes all shifts on the device
//
// Identifier convention: the URL param is the hardware device_id (unique at
// the source). Platform admins can target any device — including ones not
// yet claimed by any tenant — so we don't require a DB row for them.
async function sendCommand(req, res, next) {
  try {
    const { command, payload } = req.body || {};
    let outboundPayload = payload || {};

    if (!command || typeof command !== 'string' || !ALLOWED_COMMANDS.has(command)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `command must be one of: ${[...ALLOWED_COMMANDS].join(', ')}`,
      });
    }
    if (command === 'bwState') {
      if (!payload || !BWSTATE_VALUES.has(payload.state)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: "bwState requires payload.state ∈ {'locked','unlocked','lockdown','normal'}",
        });
      }
    }
    if (command === 'bwProvision') {
      const card = payload?.cardType;
      const latch = payload?.latchInterval;
      if (card != null && !BWPROVISION_CARD.has(card)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'bwProvision cardType must be 0 (26-bit Wiegand), 1 (32-bit HID), or 2 (Mifare 1k)',
        });
      }
      if (latch != null && (!Number.isInteger(latch) || latch < 1 || latch > 255)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'bwProvision latchInterval must be an integer between 1 and 255 seconds',
        });
      }
    }
    if (command === 'bwCred') {
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'bwCred requires a payload describing the credential',
        });
      }
      // Credentials are master-only in Loudin: force cardClass:1 and drop
      // any shiftIds the caller passed.
      const { shiftIds: _drop, ...rest } = payload;
      outboundPayload = { ...rest, cardClass: 1 };
    }
    if (command === 'bwShift') {
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'bwShift requires a payload describing the shift',
        });
      }
    }
    if (command === 'bwDoorSched') {
      // Binds one or more shift ids to the door as its access schedule.
      // The firmware needs at least one id — an empty array is undefined
      // behaviour (see services/access/devicePush.js step 7).
      if (!payload || !Array.isArray(payload.scheduleIds) || payload.scheduleIds.length === 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'bwDoorSched requires payload.scheduleIds — a non-empty array of shift ids',
        });
      }
    }
    if (command === 'bwCredDeactivate') {
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'bwCredDeactivate requires a payload identifying the credential',
        });
      }
    }

    const auth = await authorizeDeviceAccess(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.status === 404 ? 'Not Found' : 'Bad Request', message: auth.message });
    }

    const simkura = require('../../hardware/simkura').client;
    if (!simkura.isAvailable()) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Simkura client is not configured',
      });
    }

    const hwId = req.params.hwId;
    try {
      const result = await simkura.publishCommand(hwId, command, outboundPayload);
      return res.json({
        success: true,
        command,
        device_id: hwId,
        simkura: result,
      });
    } catch (err) {
      const upstreamStatus  = err.response?.status;
      const upstreamMessage = err.response?.data?.error || err.message || 'Simkura command failed';
      return res.status(502).json({
        error: 'Command failed',
        message: upstreamMessage,
        upstream_status: upstreamStatus ?? null,
      });
    }
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/devices/:id/push ───────────────────────────────────────────────
//
// Walk the device's active credentials + shifts and push them to the
// firmware via Simkura. See services/access/devicePush.js for the sequence.
async function pushDevice(req, res, next) {
  try {
    const deviceId = Number(req.params.id);
    if (!Number.isInteger(deviceId)) return badRequest(res, 'Invalid device id');

    const { rows } = await query(
      `SELECT id, device_id, company_id
         FROM devices
        WHERE id = $1 AND deleted_at IS NULL`,
      [deviceId]
    );
    const device = rows[0];
    if (!device) return notFound(res);
    if (req.user.company_type !== 'platform' && device.company_id !== req.user.company_id) {
      return notFound(res);
    }

    const simkura = require('../../hardware/simkura').client;
    if (!simkura.isAvailable()) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Simkura client is not configured',
      });
    }

    // Always 200 once we reach the orchestrator — the result body carries
    // `ok` and the per-command sequence, including the failed step if any.
    // `blocked: true` means a previous rebuild is still queued on Simkura's
    // side (sleeping device); body { force: true } overrides the check.
    const force = req.body?.force === true;
    const result = await require('../../services/access/devicePush').pushAll({ deviceId, simkura, force });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/devices/:id/clear ──────────────────────────────────────────────
//
// Wipe the lock: clear schedules, credentials, and shifts on the firmware
// and drop the corresponding assignments from our DB. The device stays
// claimed by its company — verify by the device reporting 0 credentials /
// 0 shifts on its next check-in. See services/access/devicePush.js clearAll.
async function clearDevice(req, res, next) {
  try {
    const deviceId = Number(req.params.id);
    if (!Number.isInteger(deviceId)) return badRequest(res, 'Invalid device id');

    const { rows } = await query(
      `SELECT id, device_id, company_id
         FROM devices
        WHERE id = $1 AND deleted_at IS NULL`,
      [deviceId]
    );
    const device = rows[0];
    if (!device) return notFound(res);
    if (req.user.company_type !== 'platform' && device.company_id !== req.user.company_id) {
      return notFound(res);
    }

    const simkura = require('../../hardware/simkura').client;
    if (!simkura.isAvailable()) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Simkura client is not configured',
      });
    }

    // Always 200 once we reach the orchestrator — the result body carries
    // `ok` and the per-command sequence, including the failed step if any.
    const result = await require('../../services/access/devicePush').clearAll({ deviceId, simkura });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

// ── GET /api/devices/:id/queue ───────────────────────────────────────────────
//
// Commands still in flight to the lock. The queue is simkura-core's, not
// ours — Loudin stores nothing and proxies simkura's per-device queue on
// every request. 'pending' rows are held until a sleeping device's next
// wake, so an empty list means the lock has everything we've sent it.
//
// Fail-soft: if Simkura is unconfigured/unreachable we return 200 with
// available:false rather than an error — this is a visibility feature and
// the page around it should keep working.
const IN_FLIGHT_QUEUE_STATUSES = new Set(['pending', 'processing']);

async function getQueue(req, res, next) {
  try {
    const deviceId = Number(req.params.id);
    if (!Number.isInteger(deviceId)) return badRequest(res, 'Invalid device id');

    const { rows } = await query(
      `SELECT id, device_id, company_id
         FROM devices
        WHERE id = $1 AND deleted_at IS NULL`,
      [deviceId]
    );
    const device = rows[0];
    if (!device) return notFound(res);
    if (req.user.company_type !== 'platform' && device.company_id !== req.user.company_id) {
      return notFound(res);
    }

    const simkura = require('../../hardware/simkura').client;
    if (!simkura.isAvailable()) {
      return res.json({ available: false, queue: [] });
    }

    let commands;
    try {
      commands = await simkura.getDeviceQueue(device.device_id, { limit: 100 });
    } catch (err) {
      console.warn('[deviceCommands.getQueue] Simkura queue fetch failed for', device.device_id, '—', err.message);
      return res.json({ available: false, queue: [] });
    }

    const queue = commands
      .filter((c) => IN_FLIGHT_QUEUE_STATUSES.has(c.status))
      .map((c) => ({
        id:            c.id,
        command_type:  c.command_type,
        status:        c.status,
        attempts:      c.attempts ?? 0,
        max_attempts:  c.max_attempts ?? null,
        created_at:    c.created_at ?? null,
        error_message: c.error_message ?? null,
      }));

    return res.json({ available: true, queue });
  } catch (err) {
    return next(err);
  }
}

module.exports = { sendCommand, pushDevice, clearDevice, getQueue };
