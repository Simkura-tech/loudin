/**
 * Device-scoped holiday management.
 *
 * Holiday rows live in `holidays` (company-scoped) and are attached to a
 * device via the `device_holidays` junction — same shape as shifts
 * (deviceShifts.js): every holiday is created for, and attached to, one
 * device; sharing across devices is supported by the schema but not
 * exposed.
 *
 * A holiday is a date-time window with a door behavior:
 *   open      the door is held unlocked for the window
 *   locked    the door is locked; credentials still open it (the default —
 *             what "closed for the holiday" usually means: no auto-unlock)
 *   lockdown  the door is pinned locked against everything
 * ('restricted' — custom hours — exists in the schema but has no firmware
 * equivalent, so it is not accepted here.)
 *
 * Storage-only by design: changes reach the lock via the explicit "Update
 * device" push (services/access/devicePush.js), which rebuilds the lock's
 * holiday table wholesale (holidays.clear + holidays.add — firmware has no
 * per-holiday delete).
 */

const { query, getClient } = require('../../database/db');

const ACCESS_MODES = new Set(['open', 'locked', 'lockdown']);

function badRequest(res, message, details) {
  return res.status(400).json({ error: 'Bad Request', message, ...(details && { details }) });
}

function iso(v) {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

function publicHoliday(row) {
  return {
    id:             row.id,
    holiday_name:   row.holiday_name,
    description:    row.description ?? null,
    start_datetime: iso(row.start_datetime),
    end_datetime:   iso(row.end_datetime),
    access_mode:    row.access_mode,
    status:         row.status,
    applied_at:     row.applied_at   ?? null,
    submitted_at:   row.submitted_at ?? null,
    synced_at:      row.synced_at    ?? null,
    created_at:     row.created_at,
    updated_at:     row.updated_at,
  };
}

function validatePayload(body, { partial = false } = {}) {
  const errors = [];
  const out = {};

  if (!partial || body.holiday_name !== undefined) {
    const v = (body.holiday_name ?? '').toString().trim();
    if (!v) errors.push('holiday_name is required');
    else if (v.length > 255) errors.push('holiday_name too long');
    else out.holiday_name = v;
  }
  if (body.description !== undefined) {
    out.description = body.description === null
      ? null
      : (String(body.description).trim() || null);
  }

  for (const field of ['start_datetime', 'end_datetime']) {
    if (!partial || body[field] !== undefined) {
      const raw = body[field];
      const t = typeof raw === 'string' || raw instanceof Date ? Date.parse(raw) : NaN;
      if (!Number.isFinite(t)) errors.push(`${field} must be an ISO 8601 date-time`);
      else out[field] = new Date(t).toISOString();
    }
  }
  if (out.start_datetime && out.end_datetime && out.end_datetime < out.start_datetime) {
    errors.push('end_datetime must not be before start_datetime');
  }

  if (!partial || body.access_mode !== undefined) {
    const mode = body.access_mode ?? (partial ? undefined : 'locked');
    if (mode !== undefined) {
      if (!ACCESS_MODES.has(mode)) errors.push(`access_mode must be one of: ${[...ACCESS_MODES].join(', ')}`);
      else out.access_mode = mode;
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

const HOLIDAY_COLUMNS = `id, holiday_name, description, start_datetime, end_datetime,
                         access_mode, status, created_at, updated_at`;

// ── GET /api/devices/:id/holidays ─────────────────────────────────────────────
// Only ACTIVE attachments (dh.deleted_at IS NULL). Pending removals surface
// via the device's sync summary, not this list.
async function list(req, res, next) {
  try {
    const device = await loadDeviceForCaller(req);
    if (!device) return res.status(404).json({ error: 'Not Found', message: 'Device not found' });

    const { rows } = await query(
      `SELECT h.id, h.holiday_name, h.description,
              h.start_datetime, h.end_datetime, h.access_mode,
              h.status, h.created_at, h.updated_at,
              dh.applied_at, dh.submitted_at, dh.synced_at
         FROM device_holidays dh
         JOIN holidays h ON h.id = dh.holiday_id
        WHERE dh.device_id = $1
          AND dh.deleted_at IS NULL
          AND h.deleted_at IS NULL
        ORDER BY h.start_datetime, h.id`,
      [device.id]
    );
    return res.json({ holidays: rows.map(publicHoliday) });
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/devices/:id/holidays ────────────────────────────────────────────
// Creates a holiday in `holidays` and attaches it to this device in one txn.
async function create(req, res, next) {
  const client = await getClient();
  try {
    const device = await loadDeviceForCaller(req);
    if (!device) return res.status(404).json({ error: 'Not Found', message: 'Device not found' });

    const v = validatePayload(req.body);
    if (!v.ok) return badRequest(res, 'Invalid payload', v.errors);
    const d = v.data;

    await client.query('BEGIN');
    const { rows: [holiday] } = await client.query(
      `INSERT INTO holidays (
         company_id, holiday_name, description, start_datetime, end_datetime,
         access_mode, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${HOLIDAY_COLUMNS}`,
      [
        req.user.company_id,
        d.holiday_name, d.description ?? null,
        d.start_datetime, d.end_datetime,
        d.access_mode, d.status ?? 'active',
      ]
    );
    await client.query(
      `INSERT INTO device_holidays (device_id, holiday_id) VALUES ($1, $2)`,
      [device.id, holiday.id]
    );
    await client.query('COMMIT');

    return res.status(201).json({
      holiday: publicHoliday({ ...holiday, applied_at: new Date().toISOString(), submitted_at: null, synced_at: null }),
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* swallow */ }
    return next(err);
  } finally {
    client.release();
  }
}

// ── PATCH /api/devices/:id/holidays/:holidayId ────────────────────────────────
// Editing bumps the junction's applied_at so a holiday already on the lock
// shows as "pending push" again (synced_at < applied_at) and the next push
// re-sends it.
async function update(req, res, next) {
  try {
    const device = await loadDeviceForCaller(req);
    if (!device) return res.status(404).json({ error: 'Not Found', message: 'Device not found' });

    const holidayId = Number(req.params.holidayId);
    const { rowCount: linked } = await query(
      `SELECT 1 FROM device_holidays
        WHERE device_id = $1 AND holiday_id = $2 AND deleted_at IS NULL`,
      [device.id, holidayId]
    );
    if (linked === 0) return res.status(404).json({ error: 'Not Found', message: 'Holiday not found on this device' });

    const v = validatePayload(req.body, { partial: true });
    if (!v.ok) return badRequest(res, 'Invalid payload', v.errors);
    const fields = Object.keys(v.data);
    if (fields.length === 0) return badRequest(res, 'No fields to update');

    const sets = fields.map((f, i) => `${f} = $${i + 1}`);
    const params = fields.map((f) => v.data[f]);
    params.push(holidayId, req.user.company_id);

    const { rows } = await query(
      `UPDATE holidays
          SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${params.length - 1}
          AND company_id = $${params.length}
          AND deleted_at IS NULL
        RETURNING ${HOLIDAY_COLUMNS}`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Holiday not found' });

    // The window/behavior changed → the lock's copy is stale.
    const { rows: [junction] } = await query(
      `UPDATE device_holidays
          SET applied_at = NOW()
        WHERE device_id = $1 AND holiday_id = $2 AND deleted_at IS NULL
        RETURNING applied_at, submitted_at, synced_at`,
      [device.id, holidayId]
    );
    return res.json({ holiday: publicHoliday({ ...rows[0], ...junction }) });
  } catch (err) {
    return next(err);
  }
}

// ── DELETE /api/devices/:id/holidays/:holidayId ───────────────────────────────
// Submitted / synced junction rows are soft-deleted so the next push rebuilds
// the lock's holiday table without them; never-submitted rows are dropped
// outright. The underlying `holidays` row is soft-deleted either way.
async function destroy(req, res, next) {
  try {
    const device = await loadDeviceForCaller(req);
    if (!device) return res.status(404).json({ error: 'Not Found', message: 'Device not found' });

    const holidayId = Number(req.params.holidayId);
    const { rows: linkedRows } = await query(
      `SELECT id, submitted_at, synced_at FROM device_holidays
        WHERE device_id = $1 AND holiday_id = $2 AND deleted_at IS NULL
        LIMIT 1`,
      [device.id, holidayId]
    );
    if (linkedRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Holiday not found on this device' });
    }
    const onLock = linkedRows[0].submitted_at != null || linkedRows[0].synced_at != null;

    if (onLock) {
      await query(`UPDATE device_holidays SET deleted_at = NOW() WHERE id = $1`, [linkedRows[0].id]);
    } else {
      await query(`DELETE FROM device_holidays WHERE id = $1`, [linkedRows[0].id]);
    }

    await query(
      `UPDATE holidays
          SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
      [holidayId, req.user.company_id]
    );
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, create, update, destroy };
