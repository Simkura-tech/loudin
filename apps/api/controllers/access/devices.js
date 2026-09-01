/**
 * Devices controller — door locks.
 *
 * End-user-admin scope: tenant-scoped to req.user.company_id. Unclaimed
 * devices (company_id IS NULL) and other tenants' devices are not visible.
 * Reseller / platform views will come back as separate endpoints with
 * different filtering semantics — don't widen this one.
 *
 * Live state (status, door_state, battery_percent, last_seen, power_mode)
 * is synced from Simkura via webhook + polling worker — this endpoint is
 * just a read of whatever the DB has cached.
 */

const { query } = require('../../database/db');
const { recordAudit } = require('../../services/platform/audit');
const events = require('../../integrations/events');

const ALLOWED_STATUSES = ['online', 'offline', 'error', 'maintenance'];
const MAX_LIMIT = 200;

// Only the human-facing labels are editable from the end-user-admin UI.
// device_id, firmware_version, live-state fields, and the reseller/assignment
// columns are managed by provisioning / the device itself and intentionally
// NOT touched here.
const EDITABLE_FIELDS = ['device_name', 'location', 'notes'];

function badRequest(res, message, details) {
  return res.status(400).json({ error: 'Bad Request', message, ...(details && { details }) });
}

function notFound(res) {
  return res.status(404).json({ error: 'Not Found', message: 'Device not found' });
}

function publicDevice(row) {
  return {
    id:                row.id,
    device_id:         row.device_id,
    device_type:       row.device_type,
    firmware_version:  row.firmware_version,
    device_name:       row.device_name,
    location:          row.location,
    notes:             row.notes,
    status:            row.status,
    door_state:        row.door_state,
    battery_percent:   row.battery_percent,
    power_mode:        row.power_mode,
    carrier:           row.carrier ?? null,
    signal_strength:   row.signal_strength ?? null,
    // Richer state mirrored from Simkura's /state poll (migration 074).
    // NULL = not reported yet (old firmware / never polled).
    door_override:         row.door_override ?? null,
    deep_sleep_duration_s: row.deep_sleep_duration_s ?? null,
    osdp_stage:            row.osdp_stage ?? null,
    fw_counts: {
      credentials: row.fw_credential_count ?? null,
      shifts:      row.fw_shift_count ?? null,
      holidays:    row.fw_holiday_count ?? null,
      door_shifts: row.fw_door_shift_count ?? null,
    },
    config_card_type:  row.config_card_type ?? null,
    latch_interval_s:  row.latch_interval_s ?? null,
    state_synced_at:   row.state_synced_at ?? null,
    last_seen:         row.last_seen,
    created_at:        row.created_at,
    updated_at:        row.updated_at,
    // Deactivation audit. deleted_at is what the rest of the system uses to
    // filter out released devices; the UI renders the "Deactivated" badge
    // when this is set.
    deleted_at:        row.deleted_at ?? null,
    released_at:       row.released_at ?? null,
    released_by:       row.released_by ?? null,
  };
}

// â”€â”€ GET /api/devices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//   ?search=…              matches device_name / location / device_id (ILIKE)
//   ?status=online|offline|error|maintenance
//   ?include_deactivated=true   include soft-deleted devices in the result
//   ?limit=…&offset=…           (limit clamped to MAX_LIMIT)
async function list(req, res, next) {
  try {
    const companyId = req.user.company_id;
    const limit  = Math.min(Number(req.query.limit)  || 50, MAX_LIMIT);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = (req.query.search || '').toString().trim();
    const status = req.query.status;
    const includeDeactivated = String(req.query.include_deactivated || '').toLowerCase() === 'true';

    const filterParams = [companyId];
    let where = 'company_id = $1';
    if (!includeDeactivated) where += ' AND deleted_at IS NULL';

    if (status && ALLOWED_STATUSES.includes(status)) {
      filterParams.push(status);
      where += ` AND status = $${filterParams.length}`;
    }

    if (search) {
      filterParams.push(`%${search}%`);
      const idx = filterParams.length;
      where += ` AND (device_name ILIKE $${idx}
                       OR location  ILIKE $${idx}
                       OR device_id ILIKE $${idx})`;
    }

    const listParams = [...filterParams, limit, offset];
    const lim = `$${listParams.length - 1}`;
    const off = `$${listParams.length}`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT id, device_id, device_type, firmware_version,
                device_name, location, notes,
                status, door_state, battery_percent, power_mode,
                carrier, signal_strength,
                door_override, deep_sleep_duration_s, osdp_stage,
                fw_credential_count, fw_shift_count,
                fw_holiday_count, fw_door_shift_count,
                config_card_type, latch_interval_s, state_synced_at,
                last_seen, created_at, updated_at,
                deleted_at, released_at, released_by
           FROM devices
          WHERE ${where}
          ORDER BY deleted_at IS NOT NULL, device_name
          LIMIT ${lim} OFFSET ${off}`,
        listParams
      ),
      query(`SELECT COUNT(*)::int AS n FROM devices WHERE ${where}`, filterParams),
    ]);

    return res.json({ devices: rows.map(publicDevice), total: countRows[0].n, limit, offset });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ GET /api/devices/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// Response shape:
//   {
//     device: { … },
//     sync: {
//       has_pending: boolean,
//       credentials: { add, remove, total },
//       shifts:      { add, remove, total },
//     }
//   }
//
// - `add` counts active junction rows (deleted_at IS NULL) that haven't
//   been synced to the firmware yet (synced_at IS NULL OR < applied_at).
// - `remove` counts soft-deleted junction rows (deleted_at IS NOT NULL)
//   that still need to be deactivated on the firmware.
// - `total` is the count of active junction rows.
//
// "Update device" will eventually walk these and emit the corresponding
// bw* commands per [[feedback-credentials-master-only]].
async function get(req, res, next) {
  try {
    const deviceId  = Number(req.params.id);
    const companyId = req.user.company_id;

    // Deactivated devices are still readable so users can navigate from the
    // list view (where "Show deactivated" can be toggled on) and see why /
    // when they were released. Admin mutation routes still 404 because they
    // re-select with `deleted_at IS NULL` themselves.
    const { rows } = await query(
      `SELECT id, device_id, device_type, firmware_version,
              device_name, location, notes,
              status, door_state, battery_percent, power_mode,
              carrier, signal_strength,
              door_override, deep_sleep_duration_s, osdp_stage,
              fw_credential_count, fw_shift_count,
              fw_holiday_count, fw_door_shift_count,
              config_card_type, latch_interval_s, state_synced_at,
              last_seen, created_at, updated_at,
              deleted_at, released_at, released_by
         FROM devices
        WHERE id = $1 AND company_id = $2`,
      [deviceId, companyId]
    );
    if (rows.length === 0) return notFound(res);

    // Fire-and-forget: refresh this device's live state from Simkura so the
    // detail page self-heals (battery / firmware / connectivity) on the next
    // load or poll. The response below still serves the cached row — waiting
    // on Simkura here would add up to 10s to every page view.
    if (!rows[0].deleted_at) {
      const stateSync = require('../../hardware/simkura/stateSyncWorker');
      stateSync.refreshDevice(rows[0].device_id).catch((err) =>
        console.error('[devices.get] state refresh failed for', rows[0].device_id, '—', err.message));
    }

    // Pull both junctions' sync counts in one round trip. Three states:
    //   add       — active row that's not yet submitted to the firmware
    //   submitted — accepted by Simkura (202); synced_at lands when the
    //               matching command.sent webhook (data.commandRef) arrives
    //               or the state-sync reconcile sees the record 'sent' —
    //               see services/access/commandAck.js
    //   remove    — soft-deleted, firmware still has it cached
    const [{ rows: [credCounts] }, { rows: [shiftCounts] }] = await Promise.all([
      query(
        `SELECT
           COUNT(*) FILTER (WHERE deleted_at IS NULL
                              AND submitted_at IS NULL
                              AND (synced_at IS NULL OR synced_at < applied_at))::int AS add_count,
           COUNT(*) FILTER (WHERE deleted_at IS NULL
                              AND submitted_at IS NOT NULL
                              AND synced_at IS NULL)::int                              AS submitted_count,
           COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS remove_count,
           COUNT(*) FILTER (WHERE deleted_at IS NULL)::int     AS total_count
         FROM device_credentials
         WHERE device_id = $1`,
        [deviceId]
      ),
      query(
        `SELECT
           COUNT(*) FILTER (WHERE deleted_at IS NULL
                              AND submitted_at IS NULL
                              AND (synced_at IS NULL OR synced_at < applied_at))::int AS add_count,
           COUNT(*) FILTER (WHERE deleted_at IS NULL
                              AND submitted_at IS NOT NULL
                              AND synced_at IS NULL)::int                              AS submitted_count,
           COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS remove_count,
           COUNT(*) FILTER (WHERE deleted_at IS NULL)::int     AS total_count
         FROM device_shifts
         WHERE device_id = $1`,
        [deviceId]
      ),
    ]);

    const sync = {
      credentials: {
        add:       credCounts.add_count,
        submitted: credCounts.submitted_count,
        remove:    credCounts.remove_count,
        total:     credCounts.total_count,
      },
      shifts: {
        add:       shiftCounts.add_count,
        submitted: shiftCounts.submitted_count,
        remove:    shiftCounts.remove_count,
        total:     shiftCounts.total_count,
      },
      // has_pending = the user has unsubmitted work (needs to click "Update device")
      has_pending:
        credCounts.add_count + credCounts.remove_count +
        shiftCounts.add_count + shiftCounts.remove_count > 0,
      // has_awaiting = a push has happened and we're waiting for device confirmation
      has_awaiting:
        credCounts.submitted_count + shiftCounts.submitted_count > 0,
    };

    return res.json({ device: publicDevice(rows[0]), sync });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ PATCH /api/devices/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Only device_name / location / notes are editable. Anything else returns 400
// — the device itself (or provisioning) owns the rest.
async function update(req, res, next) {
  try {
    const out = {};
    const errors = [];

    if (req.body.device_name !== undefined) {
      const v = String(req.body.device_name).trim();
      if (!v)                   errors.push('device_name cannot be empty');
      else if (v.length > 255)  errors.push('device_name too long');
      else                      out.device_name = v;
    }
    if (req.body.location !== undefined) {
      const v = req.body.location === null
        ? null
        : (String(req.body.location).trim() || null);
      if (v !== null && v.length > 255) errors.push('location too long');
      else                              out.location = v;
    }
    if (req.body.notes !== undefined) {
      out.notes = req.body.notes === null
        ? null
        : (String(req.body.notes).trim() || null);
    }
    for (const k of Object.keys(req.body || {})) {
      if (!EDITABLE_FIELDS.includes(k)) {
        errors.push(`field "${k}" is not editable`);
      }
    }
    if (errors.length) return badRequest(res, 'Invalid payload', errors);
    const fields = Object.keys(out);
    if (fields.length === 0) return badRequest(res, 'No fields to update');

    const sets = fields.map((f, i) => `${f} = $${i + 1}`);
    const params = fields.map((f) => out[f]);
    params.push(Number(req.params.id), req.user.company_id);

    const { rows } = await query(
      `UPDATE devices
          SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${params.length - 1}
          AND company_id = $${params.length}
          AND deleted_at IS NULL
        RETURNING id, device_id, device_type, firmware_version,
                  device_name, location, notes,
                  status, door_state, battery_percent, power_mode,
                  carrier, signal_strength,
                  door_override, deep_sleep_duration_s, osdp_stage,
                  fw_credential_count, fw_shift_count,
                  fw_holiday_count, fw_door_shift_count,
                  config_card_type, latch_interval_s, state_synced_at,
                  last_seen, created_at, updated_at`,
      params
    );
    if (rows.length === 0) return notFound(res);
    return res.json({ device: publicDevice(rows[0]) });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ GET /api/devices/:id/events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Tenant-scoped activity feed. Joins device_events by hardware device_id
// (device_events stores the hardware id as TEXT, not an FK to devices.id).
//   ?limit=…&offset=…   limit clamped to MAX_LIMIT
//   ?type=…             optional event_type filter
async function listEvents(req, res, next) {
  try {
    const id = Number(req.params.id);
    const limit  = Math.min(Number(req.query.limit)  || 50, MAX_LIMIT);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const type   = req.query.type;

    const params = [id, req.user.company_id];
    let where = `d.id = $1 AND d.company_id = $2 AND d.deleted_at IS NULL`;
    if (type) {
      params.push(type);
      where += ` AND e.event_type = $${params.length}`;
    }
    params.push(limit, offset);

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT e.id, e.device_id, e.event_type, e.event_category, e.severity,
                e.event_data, e.metadata,
                e.simkura_event_id, e.simkura_webhook_id,
                e.event_timestamp, e.received_at,
                e.credential_id, e.person_id,
                NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), '') AS person_name,
                c.credential_name
           FROM device_events e
           JOIN devices d ON d.device_id = e.device_id
           LEFT JOIN credentials c ON c.id = e.credential_id
           LEFT JOIN people      p ON p.id = e.person_id
          WHERE ${where}
          ORDER BY e.received_at DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      query(
        `SELECT COUNT(*)::int AS n
           FROM device_events e
           JOIN devices d ON d.device_id = e.device_id
          WHERE ${where}`,
        params.slice(0, params.length - 2)
      ),
    ]);

    return res.json({ events: rows, total: countRows[0].n, limit, offset });
  } catch (err) {
    return next(err);
  }
}

// ── GET /api/devices/events ──────────────────────────────────────────────────
// Company-wide activity feed (overview page). Same row shape as the
// per-device feed, plus the owning device's internal id + name so rows can
// link back to the device page.
//   ?limit=…&offset=…   limit clamped to MAX_LIMIT
async function listCompanyEvents(req, res, next) {
  try {
    const limit  = Math.min(Number(req.query.limit)  || 20, MAX_LIMIT);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const where = `d.company_id = $1 AND d.deleted_at IS NULL`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT e.id, e.device_id, e.event_type, e.event_category, e.severity,
                e.event_data, e.metadata,
                e.simkura_event_id, e.simkura_webhook_id,
                e.event_timestamp, e.received_at,
                e.credential_id, e.person_id,
                NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), '') AS person_name,
                c.credential_name,
                d.id AS device_pk, d.device_name
           FROM device_events e
           JOIN devices d ON d.device_id = e.device_id
           LEFT JOIN credentials c ON c.id = e.credential_id
           LEFT JOIN people      p ON p.id = e.person_id
          WHERE ${where}
          ORDER BY e.received_at DESC
          LIMIT $2 OFFSET $3`,
        [req.user.company_id, limit, offset]
      ),
      query(
        `SELECT COUNT(*)::int AS n
           FROM device_events e
           JOIN devices d ON d.device_id = e.device_id
          WHERE ${where}`,
        [req.user.company_id]
      ),
    ]);

    return res.json({ events: rows, total: countRows[0].n, limit, offset });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ GET /api/devices/unclaimed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Search Simkura's device pool for devices that are not yet claimed (no row
// in our `devices` table, or row with company_id IS NULL), filtered by a
// hardware-id suffix the user types into the "Add device" flow.
//
// Suffix: 3–6 characters, case-insensitive. Empty / shorter suffixes return
// an empty list so the UI never accidentally lists the entire pool.
async function searchUnclaimed(req, res, next) {
  try {
    const rawSuffix = String(req.query.suffix || '').trim();
    if (rawSuffix.length < 3) {
      return res.json({ devices: [], match_suffix: rawSuffix });
    }
    const suffix = rawSuffix.slice(-6).toLowerCase();

    const simkura = require('../../hardware/simkura').client;
    if (!simkura.isAvailable()) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Simkura client is not configured',
      });
    }

    let simkuraDevices;
    try {
      const r = await simkura.getDevices();
      simkuraDevices = Array.isArray(r?.devices) ? r.devices : [];
    } catch (err) {
      return res.status(502).json({
        error: 'Upstream error',
        message: err.response?.data?.error || err.message || 'Simkura request failed',
      });
    }

    // Hardware ids already claimed (have a non-null company_id) — exclude these.
    const { rows: claimedRows } = await query(
      `SELECT device_id FROM devices
        WHERE company_id IS NOT NULL AND deleted_at IS NULL`
    );
    const claimedIds = new Set(claimedRows.map((r) => r.device_id));

    const matches = [];
    for (const s of simkuraDevices) {
      const hwId = s.device_id;
      if (!hwId) continue;
      if (claimedIds.has(hwId)) continue;
      if (!hwId.toLowerCase().endsWith(suffix)) continue;
      matches.push({
        device_id:        hwId,
        device_type:      s.device_type || 'sb6',
        firmware_version: s.firmware_version || null,
        status:           s.status || 'unknown',
        last_seen:        s.last_seen || null,
        registered_at:    null, // v2 exposes no registration timestamp
      });
      if (matches.length >= 25) break;
    }

    return res.json({ devices: matches, match_suffix: suffix });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/devices/claim â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Claim an unclaimed device for the caller's company. Body:
//   { device_id: <hardware id>, device_name: <required friendly label> }
//
// "Unclaimed" = either no row in our `devices` table, or a row with
// company_id IS NULL. A device that's already claimed by any company
// (including the caller's) returns 409.
async function claimDevice(req, res, next) {
  try {
    const { device_id, device_name } = req.body || {};
    if (typeof device_id !== 'string' || !device_id.trim()) {
      return badRequest(res, 'device_id is required');
    }
    if (typeof device_name !== 'string' || !device_name.trim()) {
      return badRequest(res, 'device_name is required');
    }
    const hwId = device_id.trim();
    const name = device_name.trim();
    const companyId = req.user.company_id;
    const userId    = req.user.user_id;

    // Company row is needed below for the device.added event payload.
    const { rows: [company] } = await query(
      `SELECT company_type, parent_company_id
         FROM companies WHERE id = $1`,
      [companyId]
    );

    const simkura = require('../../hardware/simkura').client;
    if (!simkura.isAvailable()) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Simkura client is not configured',
      });
    }

    // Confirm the device exists in Simkura and pull metadata for our row.
    let simkuraDevice;
    try {
      simkuraDevice = await simkura.getDevice(hwId);
    } catch (err) {
      if (err.response?.status === 404) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Device not found in Simkura — cannot be claimed',
        });
      }
      return res.status(502).json({
        error: 'Upstream error',
        message: err.response?.data?.error || err.message || 'Simkura request failed',
      });
    }

    // v2 resource: board/firmware live under `device`.
    const board = simkuraDevice?.device?.board;
    const deviceType      = typeof board === 'string' && board.trim()
      ? board.trim().toLowerCase()
      : 'sb6';
    const firmwareVersion = simkuraDevice?.device?.firmware || null;

    // Check current claim state. UPDATE the existing row when it's in our
    // pool with company_id NULL; reject when it's already claimed; INSERT
    // when there's no row at all.
    const { rows: existing } = await query(
      `SELECT id, company_id FROM devices
        WHERE device_id = $1 AND deleted_at IS NULL
        LIMIT 1`,
      [hwId]
    );

    if (existing[0]?.company_id != null) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Device is already claimed',
      });
    }

    let row;
    if (existing[0]) {
      const { rows } = await query(
        `UPDATE devices
            SET company_id  = $2,
                device_name = $3,
                device_type = COALESCE(NULLIF(device_type, ''), $4),
                firmware_version = COALESCE(firmware_version, $5),
                assigned_by = $6,
                assigned_at = NOW(),
                updated_at  = NOW()
          WHERE id = $1
        RETURNING *`,
        [existing[0].id, companyId, name, deviceType, firmwareVersion, userId]
      );
      row = rows[0];
    } else {
      const { rows } = await query(
        `INSERT INTO devices
           (company_id, device_id, device_type, firmware_version, device_name,
            status, door_state, power_mode, assigned_by, assigned_at)
         VALUES ($1, $2, $3, $4, $5, 'offline', 'unknown', 'active', $6, NOW())
         RETURNING *`,
        [companyId, hwId, deviceType, firmwareVersion, name, userId]
      );
      row = rows[0];
    }

    void events.emit('device.added', {
      company:  { id: companyId, type: company.company_type },
      reseller: company.parent_company_id ? { company_id: company.parent_company_id } : undefined,
      actor:    { user_id: userId },
      device:   { device_id: row.device_id },
    });
    return res.status(201).json({ device: publicDevice(row) });
  } catch (err) {
    // Race condition: another claim landed between our SELECT and INSERT.
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Device is already claimed',
      });
    }
    return next(err);
  }
}

// â”€â”€ POST /api/devices/:id/release â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Soft-delete (deactivate) a claimed device. Stamps deleted_at + released_by
// + released_at.
//
// The device's hardware + Simkura provisioning is NOT touched — the lock can
// continue to operate until physically uninstalled. Release only severs the
// Loudin <-> hardware relationship.
//
// Audit is best-effort: a failure here does not roll back the deactivation.
async function releaseDevice(req, res, next) {
  try {
    const deviceId  = Number(req.params.id);
    const companyId = req.user.company_id;
    const userId    = req.user.user_id;
    if (!Number.isInteger(deviceId)) return badRequest(res, 'invalid device id');

    const { rows } = await query(
      `UPDATE devices
          SET deleted_at  = NOW(),
              released_by = $3,
              released_at = NOW(),
              updated_at  = NOW()
         FROM companies c
        WHERE devices.id = $1
          AND devices.company_id = $2
          AND devices.deleted_at IS NULL
          AND c.id = devices.company_id
        RETURNING devices.*, c.company_type, c.parent_company_id`,
      [deviceId, companyId, userId]
    );
    if (rows.length === 0) return notFound(res);
    const row = rows[0];

    recordAudit(req, 'device.release', {
      target_type: 'device',
      target_id:   deviceId,
      metadata: {
        device_id:   row.device_id,
        device_name: row.device_name,
      },
    });

    void events.emit('device.removed', {
      company:  { id: companyId, type: row.company_type },
      reseller: row.parent_company_id ? { company_id: row.parent_company_id } : undefined,
      actor:    { user_id: userId },
      device:   { device_id: row.device_id },
    });
    return res.json({ device: publicDevice(row) });
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, get, update, listEvents, listCompanyEvents, searchUnclaimed, claimDevice, releaseDevice };
