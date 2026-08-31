/**
 * Platform Admin device fleet — the "all devices" view.
 *
 * Source of truth for the global fleet is Simkura Core (every provisioned
 * device, claimed or not). We merge that with our `devices` table so each
 * row also carries the owning company (if claimed) and our cached live
 * state (status, battery, last_seen).
 *
 * Degrades gracefully when Simkura is unreachable — falls back to whatever
 * we have locally so the page still loads.
 */

const { query } = require('../../database/db');
const { client: simkuraClient } = require('../../hardware/simkura');

function mergedRow({ hwId, simkura, local }) {
  return {
    hardware_device_id: hwId,
    device_name:        local?.device_name ?? simkura?.name ?? null,
    device_type:        local?.device_type ?? simkura?.device_type ?? null,
    firmware_version:   local?.firmware_version ?? null,
    company_id:         local?.company_id ?? null,
    company_name:       local?.company_name ?? null,
    claimed:            !!local?.company_id,
    in_simkura:         !!simkura,
    status:             local?.status ?? 'unknown',
    door_state:         local?.door_state ?? null,
    battery_percent:    local?.battery_percent ?? null,
    carrier:            local?.carrier ?? null,
    signal_strength:    local?.signal_strength ?? null,
    last_seen:          local?.last_seen ?? null,
    // Best-effort registration date — Simkura's createdAt if present, else
    // our DB's, else null.
    registered_at:      simkura?.created_at ?? simkura?.createdAt ?? local?.created_at ?? null,
  };
}

// ── GET /api/platform/devices ─────────────────────────────────────────────────
async function list(req, res, next) {
  try {
    // 1. Pull from Simkura. If it fails we still want our local view.
    let simkuraDevices = [];
    let simkura = { available: simkuraClient.isAvailable(), error: null, count: 0 };

    if (simkura.available) {
      try {
        const r = await simkuraClient.getDevices();
        simkuraDevices = Array.isArray(r?.devices) ? r.devices : [];
        simkura.count = simkuraDevices.length;
      } catch (err) {
        simkura.error = err.message || 'Simkura request failed';
      }
    }

    // 2. Our DB view of every device, joined to the owning company.
    const { rows: dbRows } = await query(
      `SELECT d.id, d.device_id, d.device_type, d.firmware_version,
              d.device_name, d.location, d.status, d.door_state, d.battery_percent,
              d.carrier, d.signal_strength,
              d.power_mode, d.last_seen, d.company_id, d.created_at, d.updated_at,
              c.name AS company_name
         FROM devices d
    LEFT JOIN companies c ON c.id = d.company_id
        WHERE d.deleted_at IS NULL`
    );

    // 3. Merge by hardware device_id (the stable nRF Cloud / serial id).
    const dbByHwId = new Map(dbRows.map((d) => [d.device_id, d]));
    const seenHwIds = new Set();
    const merged = [];

    for (const s of simkuraDevices) {
      // Simkura returns the hardware id under .device_id (snake) on the
      // platform's own API. Accept .deviceId too just in case.
      const hwId = s.device_id || s.deviceId;
      if (!hwId) continue;
      seenHwIds.add(hwId);
      merged.push(mergedRow({ hwId, simkura: s, local: dbByHwId.get(hwId) }));
    }

    // Any DB-known device Simkura didn't return (shouldn't happen often;
    // could mean the device was deleted in Simkura but we still have it).
    for (const d of dbRows) {
      if (!seenHwIds.has(d.device_id)) {
        merged.push(mergedRow({ hwId: d.device_id, simkura: null, local: d }));
      }
    }

    // Sort: unclaimed first (action items), then by company name, then by hw id.
    merged.sort((a, b) => {
      if (a.claimed !== b.claimed) return a.claimed ? 1 : -1;
      if ((a.company_name ?? '') !== (b.company_name ?? '')) {
        return (a.company_name ?? '').localeCompare(b.company_name ?? '');
      }
      return a.hardware_device_id.localeCompare(b.hardware_device_id);
    });

    return res.json({
      devices: merged,
      total:   merged.length,
      claimed_count:   merged.filter((d) => d.claimed).length,
      unclaimed_count: merged.filter((d) => !d.claimed && d.in_simkura).length,
      simkura,
    });
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/platform/devices/sync ───────────────────────────────────────────
// Manual trigger for the device-discovery worker. Pulls every device from
// Simkura right now and inserts any newcomers as unclaimed rows in our
// `devices` table — same code path as the daily scheduled run.
async function syncNow(req, res, next) {
  try {
    const worker = require('../../hardware/simkura/deviceDiscoveryWorker');
    const result = await worker.tick();
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(502).json({
      error: 'Bad Gateway',
      message: err.message || 'Simkura discovery failed',
    });
  }
}

module.exports = { list, syncNow };
