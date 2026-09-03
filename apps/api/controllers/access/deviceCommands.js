/**
 * Device commands controller — Simkura command dispatch and full push sequence.
 *
 * Separated from devices.js (CRUD/lifecycle) because the command path has its
 * own allowlist, payload validation rules, and Simkura client dependency
 * that don't belong in the read/write device management layer.
 */

const { query } = require('../../database/db');
const { upstreamErrorMessage } = require('../../hardware/simkura');
const boardCatalog = require('../../hardware/simkura/boardCatalog');
const featureFlags = require('../../services/platform/featureFlags');

function badRequest(res, message, details) {
  return res.status(400).json({ error: 'Bad Request', message, ...(details && { details }) });
}

function notFound(res) {
  return res.status(404).json({ error: 'Not Found', message: 'Device not found' });
}

// ── Command allowlist (v2 operations) ────────────────────────────────────────
//
// The ad-hoc command surface is deliberately smaller than Simkura's catalog:
// only operations an admin should trigger directly from the UI. Data-record
// operations (credentials/shifts/holidays/schedule) belong to the push
// orchestrator (services/access/devicePush.js), never to this endpoint.
// v1's bwCount (inventory request) is gone from v2 — record counts arrive
// with every state sync instead.

const ALLOWED_COMMANDS = new Set([
  'lock.unlock',    // momentary unlock (re-locks after latchInterval)
  'lock.set-state', // persistent door state, incl. 'normal' to clear an override
  'lock.configure', // door latch setting + reader-technology record
  'device.reboot',  // soft reboot, preserves data
]);

// 'normal' clears the override: the door returns to schedule-driven
// operation. The other three pin the door in that state (override flag set —
// shifts won't flip it back until cleared).
const LOCK_STATES = new Set(['locked', 'unlocked', 'lockdown', 'normal']);
// v2 2.0.0: lock.configure takes latchInterval (queued to the device) and
// readerTechnology (installer-recorded platform fact, applied immediately).
// Card formats are firmware-implemented, not configurable — the old
// cardType / readerFrequency fields are gone from the contract.
const READER_TECHNOLOGIES = new Set(['prox', 'smartcard', 'nfc', 'ble', 'multi']);
const DOOR = 1; // single-door model — same constant as devicePush

// Which platform feature flag each ad-hoc command belongs to.
const COMMAND_FEATURE = {
  'lock.unlock':    'momentary_unlock',
  'lock.set-state': 'door_mode',
  'lock.configure': 'provisioning',
  'device.reboot':  'maintenance',
};

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
    `SELECT id, device_id, device_name, company_id,
            device_type, manufacturer, supported
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
// Forward a command to the device via Simkura's v2 API. Body:
//   { command: <operation>, payload?: {...} }
//
// Payload notes:
//   lock.unlock    — no payload
//   lock.set-state — payload.state ∈ {'locked','unlocked','lockdown','normal'}
//   lock.configure — ≥1 of payload.{latchInterval, readerTechnology}
//   device.reboot  — no payload
//
// All commands are async: Simkura answers 202 with a queued-command record
// (relayed as `simkura` in our response); a sleeping device executes on its
// next wake.
//
// Identifier convention: the URL param is the hardware device_id (unique at
// the source). Platform admins can target any device — including ones not
// yet claimed by any tenant — so we don't require a DB row for them.
async function sendCommand(req, res, next) {
  try {
    const { command, payload } = req.body || {};

    if (!command || typeof command !== 'string' || !ALLOWED_COMMANDS.has(command)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `command must be one of: ${[...ALLOWED_COMMANDS].join(', ')}`,
      });
    }

    // Platform feature flag for this command (services/platform/featureFlags).
    const feature = COMMAND_FEATURE[command];
    if (feature && !(await featureFlags.isEnabled(feature))) {
      return featureFlags.disabledResponse(res, feature);
    }
    if (command === 'lock.set-state' && (!payload || !LOCK_STATES.has(payload.state))) {
      return res.status(400).json({
        error: 'Bad Request',
        message: "lock.set-state requires payload.state ∈ {'locked','unlocked','lockdown','normal'}",
      });
    }
    if (command === 'lock.configure') {
      const { readerTechnology, latchInterval } = payload || {};
      if (readerTechnology == null && latchInterval == null) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'lock.configure requires at least one of payload.{latchInterval, readerTechnology}',
        });
      }
      if (readerTechnology != null && !READER_TECHNOLOGIES.has(readerTechnology)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `lock.configure readerTechnology must be one of: ${[...READER_TECHNOLOGIES].join(', ')}`,
        });
      }
      if (latchInterval != null && (!Number.isInteger(latchInterval) || latchInterval < 1 || latchInterval > 255)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'lock.configure latchInterval must be an integer between 1 and 255 seconds',
        });
      }
    }

    const auth = await authorizeDeviceAccess(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.status === 404 ? 'Not Found' : 'Bad Request', message: auth.message });
    }

    // Board gate: readerTechnology must be in the board's supported list.
    // The board catalog (device_boards) is the authority; the device's own
    // reported tier is the fallback for a board the catalog doesn't list.
    // A device with neither (never polled since migration 085, unknown
    // board) is not gated — Simkura still answers 422 unsupported_feature.
    if (command === 'lock.configure' && payload.readerTechnology != null && auth.device) {
      const board   = (await boardCatalog.load()).resolve(auth.device);
      const allowed = board?.supported?.['doors.reader.technology']
                   ?? auth.device.supported?.['doors.reader.technology'];
      if (Array.isArray(allowed) && !allowed.includes(payload.readerTechnology)) {
        const name = board?.display_name ?? board?.board ?? 'this board';
        return res.status(400).json({
          error: 'Bad Request',
          message: `readerTechnology "${payload.readerTechnology}" is not supported by ${name} (supported: ${allowed.join(', ') || 'none'})`,
        });
      }
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
      let record;
      switch (command) {
        case 'lock.unlock':    record = await simkura.unlockDoor(hwId, DOOR); break;
        case 'lock.set-state': record = await simkura.setLockState(hwId, DOOR, payload.state); break;
        case 'lock.configure': {
          const { readerTechnology, latchInterval } = payload;
          record = await simkura.configureDoor(hwId, DOOR, {
            ...(readerTechnology != null ? { readerTechnology } : {}),
            ...(latchInterval != null ? { latchInterval } : {}),
          });
          break;
        }
        case 'device.reboot':  record = await simkura.rebootDevice(hwId); break;
      }
      return res.json({
        success: true,
        command,
        device_id: hwId,
        simkura: record,
      });
    } catch (err) {
      const upstreamStatus  = err.response?.status;
      const upstreamMessage = upstreamErrorMessage(err, 'Simkura command failed');
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

    // A delta push is core sync and always allowed; the force rebuild
    // (Re-sync) is a maintenance action behind its platform flag.
    if (req.body?.force && !(await featureFlags.isEnabled('maintenance'))) {
      return featureFlags.disabledResponse(res, 'maintenance');
    }

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
    if (!(await featureFlags.isEnabled('maintenance'))) {
      return featureFlags.disabledResponse(res, 'maintenance');
    }

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
// ours — Loudin stores nothing and proxies simkura's per-device command
// list on every request. Listing without a status filter returns exactly
// the active queue (queued + sending, delivery order); 'queued' rows are
// held until a sleeping device's next wake, so an empty list means the lock
// has everything we've sent it.
//
// Fail-soft: if Simkura is unconfigured/unreachable we return 200 with
// available:false rather than an error — this is a visibility feature and
// the page around it should keep working.
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
      commands = await simkura.listCommands(device.device_id, { limit: 100 });
    } catch (err) {
      console.warn('[deviceCommands.getQueue] Simkura queue fetch failed for', device.device_id, '—', err.message);
      return res.json({ available: false, queue: [] });
    }

    const queue = commands.map((c) => ({
      id:            c.id,
      command_type:  c.operation,       // key kept for UI compatibility
      status:        c.status,          // 'queued' | 'sending'
      attempts:      c.attempts ?? 0,
      created_at:    c.createdAt ?? null,
      expires_at:    c.expiresAt ?? null,
      error_message: c.error ?? null,
    }));

    return res.json({ available: true, queue });
  } catch (err) {
    return next(err);
  }
}

module.exports = { sendCommand, pushDevice, clearDevice, getQueue };
