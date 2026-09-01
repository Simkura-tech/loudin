/**
 * Command acknowledgement — closes the loop on the junction sync trail.
 *
 * devicePush stamps submitted_at + simkura_command_id when Simkura accepts
 * a credentials.add / shifts.add (202 + queued-command record). This module
 * stamps synced_at when that command actually reaches the device, from two
 * sources:
 *
 *   1. Webhooks — command.sent / command.failed carry data.commandRef
 *      (`cmd_…`, the same id the 202 returned). routes/webhooks.js calls
 *      markSent / markFailed. This is the primary, near-real-time path.
 *   2. Poll fallback — stateSyncWorker calls reconcile() for devices that
 *      still have rows awaiting confirmation, reading the command records
 *      via GET /api/v2/devices/:id/commands[/:id]. Covers deployments with
 *      no registered webhook (sandbox, dev) and any missed delivery.
 *
 * "Sent" in v2 means delivered to the device's command topic — the
 * strongest confirmation the API offers today (an 'acknowledged' status is
 * planned upstream; when it lands, SENT_STATUSES is the one place to widen).
 *
 * Only credential and shift ADDS are tracked per row. Removals are hard-
 * deleted as soon as the remove is accepted (a remove that later fails
 * leaves the record on the lock — a force rebuild reconciles that), and
 * clear / schedule commands have no row of their own.
 */

'use strict';

const { query } = require('../../database/db');

const TABLES = ['device_credentials', 'device_shifts'];

// Per the v2 CommandStatus enum: queued | sending | sent | failed |
// cancelled | expired. queued/sending are still in flight — leave alone.
const SENT_STATUSES   = new Set(['sent']);
const FAILED_STATUSES = new Set(['failed', 'cancelled', 'expired']);

// Individual record lookups per reconcile() call, for pending ids that
// didn't appear on the first history page. Keeps a stuck fleet from
// turning every sync tick into hundreds of requests.
const MAX_LOOKUPS_PER_RECONCILE = 25;

function isCommandRef(ref) {
  return typeof ref === 'string' && /^cmd_[\w-]{1,60}$/.test(ref);
}

/**
 * The command was delivered to the device: stamp synced_at on whichever
 * junction row(s) it queued. A row detached while its add was in flight
 * (deleted_at set) is stamped too — the lock now holds the record, so the
 * pending removal stands. Returns the number of rows stamped.
 */
async function markSent(commandRef) {
  if (!isCommandRef(commandRef)) return 0;
  let stamped = 0;
  for (const table of TABLES) {
    const r = await query(
      `UPDATE ${table}
          SET synced_at = NOW()
        WHERE simkura_command_id = $1
          AND synced_at IS NULL`,
      [commandRef]
    );
    stamped += r.rowCount;
  }
  return stamped;
}

/**
 * The queue gave up on the command (failed / expired / cancelled): the
 * record never reached the lock. Active rows go back to "pending add" so
 * the next push re-sends them; rows detached while the add was in flight
 * are dropped outright — there is nothing on the lock to remove. Returns
 * the number of rows touched.
 */
async function markFailed(commandRef) {
  if (!isCommandRef(commandRef)) return 0;
  let touched = 0;
  for (const table of TABLES) {
    const dropped = await query(
      `DELETE FROM ${table}
        WHERE simkura_command_id = $1
          AND synced_at IS NULL
          AND deleted_at IS NOT NULL`,
      [commandRef]
    );
    const reset = await query(
      `UPDATE ${table}
          SET submitted_at       = NULL,
              synced_at          = NULL,
              simkura_command_id = NULL
        WHERE simkura_command_id = $1
          AND synced_at IS NULL`,
      [commandRef]
    );
    touched += dropped.rowCount + reset.rowCount;
  }
  return touched;
}

/** Command ids this device still has rows waiting on. */
async function pendingRefs(hwId) {
  const { rows } = await query(
    `SELECT dc.simkura_command_id AS ref
       FROM device_credentials dc
       JOIN devices d ON d.id = dc.device_id
      WHERE d.device_id = $1
        AND dc.submitted_at IS NOT NULL
        AND dc.synced_at IS NULL
        AND dc.simkura_command_id IS NOT NULL
     UNION
     SELECT ds.simkura_command_id
       FROM device_shifts ds
       JOIN devices d ON d.id = ds.device_id
      WHERE d.device_id = $1
        AND ds.submitted_at IS NOT NULL
        AND ds.synced_at IS NULL
        AND ds.simkura_command_id IS NOT NULL`,
    [hwId]
  );
  return rows.map((r) => r.ref).filter(isCommandRef);
}

/**
 * Poll fallback: resolve this device's outstanding command ids against
 * Simkura's command records. One history page covers the common case (a
 * push is ≤100 commands and recent); anything older is fetched one at a
 * time, capped per call. Records Simkura doesn't know (404) are left as
 * they are — re-sending on a guess would duplicate records on the lock,
 * which has no upsert.
 *
 * @param {string} hwId      Simkura device id
 * @param {Object} simkura   SimkuraClient (caller checks isAvailable())
 * @returns {Promise<{ pending: number, sent: number, failed: number }>}
 */
async function reconcile(hwId, simkura) {
  const pending = new Set(await pendingRefs(hwId));
  const result = { pending: pending.size, sent: 0, failed: 0 };
  if (pending.size === 0) return result;

  const statuses = new Map();
  const history = await simkura.listCommands(hwId, { status: 'all', limit: 100 });
  for (const c of history) {
    if (c?.id && pending.has(c.id)) statuses.set(c.id, c.status);
  }

  let lookups = 0;
  for (const ref of pending) {
    if (statuses.has(ref) || lookups >= MAX_LOOKUPS_PER_RECONCILE) continue;
    lookups += 1;
    try {
      const c = await simkura.getCommand(hwId, ref);
      if (c?.status) statuses.set(ref, c.status);
    } catch (err) {
      if (err.response?.status === 404) continue; // unknown upstream — leave the row alone
      throw err;
    }
  }

  for (const [ref, status] of statuses) {
    if (SENT_STATUSES.has(status)) {
      if (await markSent(ref)) result.sent += 1;
    } else if (FAILED_STATUSES.has(status)) {
      if (await markFailed(ref)) result.failed += 1;
    }
  }
  return result;
}

module.exports = { markSent, markFailed, reconcile, pendingRefs, isCommandRef };
