/**
 * Devices controller — door locks.
 *
 * End-user-admin scope: tenant-scoped to req.user.company_id. Unclaimed
 * devices (company_id IS NULL) and other tenants' devices are not visible.
 * The platform fleet view is a separate endpoint with different filtering
 * semantics — don't widen this one.
 *
 * Live state (status, door_state, battery_percent, last_seen, power_mode)
 * is synced from Simkura via webhook + polling worker — this endpoint is
 * just a read of whatever the DB has cached.
 */

const { query } = require('../../database/db');
const { recordAudit } = require('../../services/platform/audit');
const { upstreamErrorMessage } = require('../../hardware/simkura');
const { profileFromResource, bindValue } = require('../../hardware/simkura/hardwareProfile');
const boardCatalog = require('../../hardware/simkura/boardCatalog');
const events = require('../../integrations/events');

const ALLOWED_STATUSES = ['online', 'offline', 'error', 'maintenance'];
const MAX_LIMIT = 200;

// Every column publicDevice() reads — one list so SELECT / RETURNING can't
// drift from the projection.
const DEVICE_COLUMNS = `
  id, device_id, device_type, firmware_version,
  device_name, location, notes,
  status, door_state, door_position, door_override, door_override_mode,
  battery_percent, battery_health, power_mode,
  carrier, signal_strength,
  reader_protocol, reader_connection, reader_technology, battery_chemistry,
  fw_credential_count, fw_shift_count, fw_holiday_count,
  latch_interval_s, state_synced_at,
  manufacturer, hardware_version, num_doors, power_type, connectivity_transport, deployed,
  capabilities, features, supported, card_formats,
  last_seen, created_at, updated_at,
  deleted_at, released_at, released_by`;

// Only the human-facing labels are editable from the end-user-admin UI.
// device_id, firmware_version, live-state, and assignment columns are
// managed by provisioning / the device itself and intentionally NOT
// touched here.
const EDITABLE_FIELDS = ['device_name', 'location', 'notes'];

function badRequest(res, message, details) {
  return res.status(400).json({ error: 'Bad Request', message, ...(details && { details }) });
}

function notFound(res) {
  return res.status(404).json({ error: 'Not Found', message: 'Device not found' });
}

/**
 * API shape for a device row. `board` is the row's entry in the local
 * hardware catalog (device_boards, resolved by manufacturer + device_type)
 * — the display name and the fallback capability tiers for a device whose
 * own tiers are still NULL. Pass the resolved catalog row, or nothing for
 * `board: null`.
 */
function publicDevice(row, board = null) {
  return {
    board:             boardCatalog.publicBoard(board),
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
    // ok | low | dead — dead means safe mode, the motor cannot actuate.
    battery_health:    row.battery_health ?? null,
    power_mode:        row.power_mode,
    carrier:           row.carrier ?? null,
    signal_strength:   row.signal_strength ?? null,
    // Richer state mirrored from the v2 device resource by the state-sync
    // poll (migrations 074, 087). NULL = not reported yet / not applicable.
    door_override:     row.door_override ?? null,
    // none | command | holiday — what is overriding the schedule, if anything.
    door_override_mode: row.door_override_mode ?? null,
    door_position:     row.door_position ?? null,
    reader: {
      protocol:   row.reader_protocol ?? null,
      connection: row.reader_connection ?? null,
      technology: row.reader_technology ?? null,
    },
    battery_chemistry: row.battery_chemistry ?? null,
    fw_counts: {
      credentials: row.fw_credential_count ?? null,
      shifts:      row.fw_shift_count ?? null,
      holidays:    row.fw_holiday_count ?? null,
    },
    latch_interval_s:  row.latch_interval_s ?? null,
    state_synced_at:   row.state_synced_at ?? null,
    // Hardware profile (migration 085): provisioning-time facts and the
    // v2 capability tiers the UI gates features on. NULL = never reported
    // (treat as "unknown, assume the SB6 fallback", not "unsupported").
    manufacturer:           row.manufacturer ?? null,
    hardware_version:       row.hardware_version ?? null,
    num_doors:              row.num_doors ?? null,
    power_type:             row.power_type ?? null,
    connectivity_transport: row.connectivity_transport ?? null,
    deployed:               row.deployed ?? null,
    capabilities:           row.capabilities ?? null,
    features:               row.features ?? null,
    supported:              row.supported ?? null,
    card_formats:           row.card_formats ?? null,
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

/** publicDevice() with the board resolved from the (cached) catalog. */
async function withBoard(row) {
  const catalog = await boardCatalog.load();
  return publicDevice(row, catalog.resolve(row));
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
        `SELECT ${DEVICE_COLUMNS}
           FROM devices
          WHERE ${where}
          ORDER BY deleted_at IS NOT NULL, device_name
          LIMIT ${lim} OFFSET ${off}`,
        listParams
      ),
      query(`SELECT COUNT(*)::int AS n FROM devices WHERE ${where}`, filterParams),
    ]);

    const catalog = await boardCatalog.load();
    return res.json({
      devices: rows.map((r) => publicDevice(r, catalog.resolve(r))),
      total: countRows[0].n, limit, offset,
    });
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
      `SELECT ${DEVICE_COLUMNS}
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
    // Same predicate for all three junctions (credentials, shifts, holidays)
    // — and the same one devicePush.delta() uses to decide what to send.
    const countsFor = (table) => query(
      `SELECT
         COUNT(*) FILTER (WHERE deleted_at IS NULL
                            AND submitted_at IS NULL
                            AND (synced_at IS NULL OR synced_at < applied_at))::int AS add_count,
         COUNT(*) FILTER (WHERE deleted_at IS NULL
                            AND submitted_at IS NOT NULL
                            AND synced_at IS NULL)::int                              AS submitted_count,
         COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS remove_count,
         COUNT(*) FILTER (WHERE deleted_at IS NULL)::int     AS total_count
       FROM ${table}
       WHERE device_id = $1`,
      [deviceId]
    ).then((r) => r.rows[0]);

    const [credCounts, shiftCounts, holidayCounts] = await Promise.all([
      countsFor('device_credentials'),
      countsFor('device_shifts'),
      countsFor('device_holidays'),
    ]);

    const shape = (c) => ({
      add:       c.add_count,
      submitted: c.submitted_count,
      remove:    c.remove_count,
      total:     c.total_count,
    });
    const all = [credCounts, shiftCounts, holidayCounts];

    const sync = {
      credentials: shape(credCounts),
      shifts:      shape(shiftCounts),
      holidays:    shape(holidayCounts),
      // has_pending = the user has unsubmitted work (needs to click "Update device")
      has_pending:  all.some((c) => c.add_count + c.remove_count > 0),
      // has_awaiting = a push has happened and we're waiting for device confirmation
      has_awaiting: all.some((c) => c.submitted_count > 0),
    };

    return res.json({ device: await withBoard(rows[0]), sync });
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
        RETURNING ${DEVICE_COLUMNS}`,
      params
    );
    if (rows.length === 0) return notFound(res);
    return res.json({ device: await withBoard(rows[0]) });
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
        message: upstreamErrorMessage(err),
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
        message: upstreamErrorMessage(err),
      });
    }

    // v2 resource: board/firmware live under `device`. The hardware profile
    // (manufacturer, revision, doors, capability tiers — migration 085) is
    // written on claim too, so a freshly claimed device is gateable before
    // the state-sync worker's next pass.
    const profile         = profileFromResource(simkuraDevice);
    const deviceType      = profile.device_type ?? 'sb6';
    const firmwareVersion = simkuraDevice?.device?.firmware || null;
    const profileCols     = Object.keys(profile).filter((c) => c !== 'device_type');
    const profileVals     = profileCols.map((c) => bindValue(c, profile[c]));

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
      const base = [existing[0].id, companyId, name, deviceType, firmwareVersion, userId];
      const profileSets = profileCols.map((c, i) => `${c} = $${base.length + i + 1}`);
      const { rows } = await query(
        `UPDATE devices
            SET company_id  = $2,
                device_name = $3,
                device_type = COALESCE(NULLIF(device_type, ''), $4),
                firmware_version = COALESCE(firmware_version, $5),
                assigned_by = $6,
                assigned_at = NOW(),
                updated_at  = NOW()
                ${profileSets.map((s) => `, ${s}`).join('')}
          WHERE id = $1
        RETURNING *`,
        [...base, ...profileVals]
      );
      row = rows[0];
    } else {
      const base = [companyId, hwId, deviceType, firmwareVersion, name, userId];
      const profilePlaceholders = profileCols.map((_, i) => `$${base.length + i + 1}`);
      const { rows } = await query(
        `INSERT INTO devices
           (company_id, device_id, device_type, firmware_version, device_name,
            status, door_state, power_mode, assigned_by, assigned_at
            ${profileCols.map((c) => `, ${c}`).join('')})
         VALUES ($1, $2, $3, $4, $5, 'offline', 'unknown', 'active', $6, NOW()
            ${profilePlaceholders.map((p) => `, ${p}`).join('')})
         RETURNING *`,
        [...base, ...profileVals]
      );
      row = rows[0];
    }

    void events.emit('device.added', {
      company:  { id: companyId, type: company.company_type },
      actor:    { user_id: userId },
      device:   { device_id: row.device_id },
    });
    return res.status(201).json({ device: await withBoard(row) });
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
      actor:    { user_id: userId },
      device:   { device_id: row.device_id },
    });
    return res.json({ device: await withBoard(row) });
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, get, update, listEvents, listCompanyEvents, searchUnclaimed, claimDevice, releaseDevice };
