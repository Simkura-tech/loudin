/**
 * Device-scoped shift management.
 *
 * Schedule rows live in `shifts` (company-scoped) and are attached to a
 * specific device via the `device_shifts` junction. From the UI's
 * perspective every shift is per-device — when an admin creates a
 * "Mon-Fri 9-5" on Front Door we create a fresh row and attach it; if
 * they want the same window on a different door, they create another
 * row. Sharing across devices is supported by the schema but not
 * exposed yet.
 *
 * This controller is storage-only by design: changes reach the lock via
 * the explicit "Update device" push (services/access/devicePush.js), which
 * rebuilds the device's shift table wholesale (shifts.add / schedule.set —
 * firmware has no per-shift delete).
 */

const { query, getClient } = require('../../database/db');

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function badRequest(res, message, details) {
  return res.status(400).json({ error: 'Bad Request', message, ...(details && { details }) });
}

function publicShift(row) {
  // days_of_week may come back as either jsonb-decoded array or as a
  // string depending on driver settings — normalize.
  let days = row.days_of_week;
  if (typeof days === 'string') {
    try { days = JSON.parse(days); } catch { days = []; }
  }
  return {
    id:           row.id,
    shift_name:   row.shift_name,
    description:  row.description,
    start_time:   normalizeTime(row.start_time),
    end_time:     normalizeTime(row.end_time),
    days_of_week: Array.isArray(days) ? days : [],
    status:       row.status,
    applied_at:   row.applied_at   ?? null,
    submitted_at: row.submitted_at ?? null,
    synced_at:    row.synced_at  ?? null,
    created_at:   row.created_at,
    updated_at:   row.updated_at,
  };
}

/** Postgres TIME comes back as 'HH:MM:SS'. Strip the seconds for the UI. */
function normalizeTime(t) {
  if (!t) return null;
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function validatePayload(body, { partial = false } = {}) {
  const errors = [];
  const out = {};

  if (!partial || body.shift_name !== undefined) {
    const v = (body.shift_name ?? '').toString().trim();
    if (!v) errors.push('shift_name is required');
    else if (v.length > 255) errors.push('shift_name too long');
    else out.shift_name = v;
  }
  if (body.description !== undefined) {
    out.description = body.description === null
      ? null
      : (String(body.description).trim() || null);
  }

  for (const field of ['start_time', 'end_time']) {
    if (!partial || body[field] !== undefined) {
      const raw = (body[field] ?? '').toString().trim();
      if (!raw) errors.push(`${field} is required`);
      else if (!TIME_RE.test(raw)) errors.push(`${field} must be HH:MM or HH:MM:SS`);
      else out[field] = raw.length === 5 ? `${raw}:00` : raw;
    }
  }

  if (!partial || body.days_of_week !== undefined) {
    const arr = body.days_of_week;
    if (!Array.isArray(arr) || arr.length === 0) {
      errors.push('days_of_week must be a non-empty array of day numbers (0=Sun..6=Sat)');
    } else {
      const seen = new Set();
      let ok = true;
      for (const d of arr) {
        if (!Number.isInteger(d) || d < 0 || d > 6) { ok = false; break; }
        seen.add(d);
      }
      if (!ok) errors.push('days_of_week entries must be integers 0..6');
      else out.days_of_week = JSON.stringify([...seen].sort((a, b) => a - b));
    }
  }

  if (body.status !== undefined) {
    if (!['active', 'inactive'].includes(body.status)) {
      errors.push("status must be 'active' or 'inactive'");
    } else {
      out.status = body.status;
    }
  }

  return { ok: errors.length === 0, errors, data: out };
}

/** Verify the device belongs to the caller's company. Returns the row or null. */
async function loadDeviceForCaller(req) {
  const { rows } = await query(
    `SELECT id FROM devices
      WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [Number(req.params.id), req.user.company_id]
  );
  return rows[0] ?? null;
}

// ── GET /api/devices/:id/shifts ───────────────────────────────────────────────
// Only ACTIVE attachments (ds.deleted_at IS NULL). Pending removals
// surface via the device's sync summary, not the schedule list.
async function list(req, res, next) {
  try {
    const device = await loadDeviceForCaller(req);
    if (!device) return res.status(404).json({ error: 'Not Found', message: 'Device not found' });

    const { rows } = await query(
      `SELECT s.id, s.shift_name, s.description,
              s.start_time, s.end_time, s.days_of_week,
              s.status, s.created_at, s.updated_at,
              ds.applied_at, ds.submitted_at, ds.synced_at
         FROM device_shifts ds
         JOIN shifts s ON s.id = ds.shift_id
        WHERE ds.device_id = $1
          AND ds.deleted_at IS NULL
          AND s.deleted_at IS NULL
        ORDER BY s.start_time, s.id`,
      [device.id]
    );
    return res.json({ shifts: rows.map(publicShift) });
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/devices/:id/shifts ──────────────────────────────────────────────
// Creates a shift in `shifts` and attaches it to this device in one txn.
async function create(req, res, next) {
  const client = await getClient();
  try {
    const device = await loadDeviceForCaller(req);
    if (!device) return res.status(404).json({ error: 'Not Found', message: 'Device not found' });

    const v = validatePayload(req.body);
    if (!v.ok) return badRequest(res, 'Invalid payload', v.errors);
    const d = v.data;

    await client.query('BEGIN');
    const { rows: [shift] } = await client.query(
      `INSERT INTO shifts (
         company_id, shift_name, description, start_time, end_time,
         days_of_week, status
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING id, shift_name, description, start_time, end_time,
                 days_of_week, status, created_at, updated_at`,
      [
        req.user.company_id,
        d.shift_name, d.description ?? null,
        d.start_time, d.end_time,
        d.days_of_week,
        d.status ?? 'active',
      ]
    );
    await client.query(
      `INSERT INTO device_shifts (device_id, shift_id) VALUES ($1, $2)`,
      [device.id, shift.id]
    );
    await client.query('COMMIT');

    return res.status(201).json({ shift: publicShift({ ...shift, applied_at: new Date().toISOString(), synced_at: null }) });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* swallow */ }
    return next(err);
  } finally {
    client.release();
  }
}

// ── PATCH /api/devices/:id/shifts/:shiftId ────────────────────────────────────
async function update(req, res, next) {
  try {
    const device = await loadDeviceForCaller(req);
    if (!device) return res.status(404).json({ error: 'Not Found', message: 'Device not found' });

    const shiftId = Number(req.params.shiftId);
    const { rowCount: linked } = await query(
      `SELECT 1 FROM device_shifts
        WHERE device_id = $1 AND shift_id = $2 AND deleted_at IS NULL`,
      [device.id, shiftId]
    );
    if (linked === 0) return res.status(404).json({ error: 'Not Found', message: 'Shift not found on this device' });

    const v = validatePayload(req.body, { partial: true });
    if (!v.ok) return badRequest(res, 'Invalid payload', v.errors);
    const fields = Object.keys(v.data);
    if (fields.length === 0) return badRequest(res, 'No fields to update');

    // The days_of_week value is already a JSON string ready to cast — we
    // pass it as text and let pg cast in the SET clause.
    const sets = fields.map((f, i) => {
      if (f === 'days_of_week') return `${f} = $${i + 1}::jsonb`;
      return `${f} = $${i + 1}`;
    });
    const params = fields.map((f) => v.data[f]);
    params.push(shiftId, req.user.company_id);

    const { rows } = await query(
      `UPDATE shifts
          SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${params.length - 1}
          AND company_id = $${params.length}
          AND deleted_at IS NULL
        RETURNING id, shift_name, description, start_time, end_time,
                  days_of_week, status, created_at, updated_at`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Shift not found' });

    // The window changed → the lock's copy is stale. Bump applied_at so the
    // row reads "pending push" (synced_at < applied_at) and the next push
    // rebuilds the shift table with the new values.
    const { rows: [junction] } = await query(
      `UPDATE device_shifts
          SET applied_at = NOW()
        WHERE device_id = $1 AND shift_id = $2 AND deleted_at IS NULL
        RETURNING applied_at, submitted_at, synced_at`,
      [device.id, shiftId]
    );
    return res.json({ shift: publicShift({ ...rows[0], ...junction }) });
  } catch (err) {
    return next(err);
  }
}

// ── DELETE /api/devices/:id/shifts/:shiftId ───────────────────────────────────
// If the junction was submitted to Simkura (queued for — or already on —
// the device firmware), soft-delete it so the next "Update device" push
// rebuilds the shift table without it. If it was never submitted,
// hard-delete — firmware doesn't know about it. The underlying `shifts` row
// is also soft-deleted so it disappears from any future picker.
async function destroy(req, res, next) {
  try {
    const device = await loadDeviceForCaller(req);
    if (!device) return res.status(404).json({ error: 'Not Found', message: 'Device not found' });

    const shiftId = Number(req.params.shiftId);
    const { rows: linkedRows } = await query(
      `SELECT id, submitted_at, synced_at FROM device_shifts
        WHERE device_id = $1 AND shift_id = $2 AND deleted_at IS NULL
        LIMIT 1`,
      [device.id, shiftId]
    );
    if (linkedRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Shift not found on this device' });
    }
    const onLock = linkedRows[0].submitted_at != null || linkedRows[0].synced_at != null;

    if (onLock) {
      await query(
        `UPDATE device_shifts
            SET deleted_at = NOW()
          WHERE id = $1`,
        [linkedRows[0].id]
      );
    } else {
      await query(
        `DELETE FROM device_shifts WHERE id = $1`,
        [linkedRows[0].id]
      );
    }

    // Soft-delete the underlying shift row too, so it disappears from any
    // company-scoped shift picker. (Currently shifts are 1:1 with their
    // device per the create() flow; if sharing across devices is ever
    // wired this will need to change.)
    await query(
      `UPDATE shifts
          SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
      [shiftId, req.user.company_id]
    );
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, create, update, destroy };
