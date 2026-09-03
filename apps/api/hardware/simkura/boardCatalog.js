/**
 * Simkura hardware catalog — local mirror of GET /api/v2/boards.
 *
 * Boards are global platform facts (every caller sees the same list), keyed
 * by (manufacturer, board) — the pair each device publishes as
 * device.manufacturer / device.board. We keep a copy in `device_boards`
 * (migration 086) so that:
 *
 *   - the UI can name a board properly ("Simkura SB6" rather than "sb6");
 *   - a device whose own capability tiers are still NULL (never polled since
 *     migration 085) can fall back to its board's tiers for feature gating;
 *   - all of that works while Simkura is unreachable or unconfigured.
 *
 * Refresh: `refreshFromSimkura()` is called by the discovery worker on every
 * tick (daily, and on the manual platform sync). Rows are upserted, never
 * deleted — a device may still reference a board Simkura retired.
 *
 * Read: `load()` returns the catalog with a `resolve(deviceRow)` helper,
 * cached in-process for CACHE_TTL_MS so the device list endpoint doesn't
 * hit the table on every request.
 */

const { query } = require('../../database/db');

const CACHE_TTL_MS = 60_000;
const POWER_TYPES  = new Set(['battery', 'plugin']);

let cache = null;        // { boards, resolve }
let cacheLoadedAt = 0;

function cleanString(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function stringArray(v) {
  if (!Array.isArray(v)) return null;
  return v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
}

/**
 * Map one v2 Board object onto a `device_boards` row. Returns null when the
 * identity pair is missing. Tier contents are shape-checked only — the
 * upstream vocabularies are additive.
 */
function rowFromBoard(b) {
  const manufacturer = cleanString(b?.manufacturer, 64);
  const board        = cleanString(b?.board, 64);
  if (!manufacturer || !board) return null;

  const numDoors = Number(b.numDoors);
  const features = {};
  if (b.features && typeof b.features === 'object' && !Array.isArray(b.features)) {
    for (const [k, v] of Object.entries(b.features)) if (typeof v === 'boolean') features[k] = v;
  }
  const supported = {};
  if (b.supported && typeof b.supported === 'object' && !Array.isArray(b.supported)) {
    for (const [k, v] of Object.entries(b.supported)) {
      const list = stringArray(v);
      if (list) supported[k] = list;
    }
  }

  return {
    manufacturer,
    board,
    display_name: cleanString(b.displayName, 128),
    num_doors:    Number.isInteger(numDoors) && numDoors >= 1 ? numDoors : null,
    power_type:   POWER_TYPES.has(b.powerType) ? b.powerType : null,
    capabilities: stringArray(b.capabilities) ?? [],
    features,
    supported,
  };
}

/** Pure: v2 `{ boards: [...] }` payload → row list (invalid entries dropped). */
function rowsFromCatalog(payload) {
  const list = Array.isArray(payload?.boards) ? payload.boards : [];
  return list.map(rowFromBoard).filter(Boolean);
}

/**
 * Pure: find the catalog row for a device row. Matches on the board
 * designation case-insensitively (devices.device_type is the lowercased
 * board); when the device knows its manufacturer that must match too,
 * otherwise the first board with that designation wins.
 */
function resolveBoard(boards, device) {
  const type = typeof device?.device_type === 'string' ? device.device_type.trim().toLowerCase() : '';
  if (!type) return null;
  const mfr = typeof device.manufacturer === 'string' ? device.manufacturer.trim().toLowerCase() : '';
  const candidates = boards.filter((b) => b.board.toLowerCase() === type);
  if (candidates.length === 0) return null;
  if (mfr) return candidates.find((b) => b.manufacturer.toLowerCase() === mfr) ?? null;
  return candidates[0];
}

/** API shape for a catalog row — what publicDevice() embeds as `board`. */
function publicBoard(b) {
  if (!b) return null;
  return {
    manufacturer: b.manufacturer,
    board:        b.board,
    display_name: b.display_name ?? null,
    num_doors:    b.num_doors ?? null,
    power_type:   b.power_type ?? null,
    capabilities: b.capabilities ?? [],
    features:     b.features ?? {},
    supported:    b.supported ?? {},
    synced_at:    b.synced_at ?? null,
  };
}

/**
 * Pull the catalog from Simkura and upsert it. Returns the number of boards
 * written; throws on upstream failure (callers decide whether that is
 * fatal — the discovery worker logs and carries on).
 */
async function refreshFromSimkura(client) {
  const rows = rowsFromCatalog(await client.getBoards());
  for (const r of rows) {
    await query(
      `INSERT INTO device_boards
         (manufacturer, board, display_name, num_doors, power_type,
          capabilities, features, supported, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (manufacturer, board) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             num_doors    = EXCLUDED.num_doors,
             power_type   = EXCLUDED.power_type,
             capabilities = EXCLUDED.capabilities,
             features     = EXCLUDED.features,
             supported    = EXCLUDED.supported,
             synced_at    = NOW(),
             updated_at   = NOW()`,
      [
        r.manufacturer, r.board, r.display_name, r.num_doors, r.power_type,
        JSON.stringify(r.capabilities), JSON.stringify(r.features), JSON.stringify(r.supported),
      ]
    );
  }
  invalidate();
  return rows.length;
}

function invalidate() {
  cache = null;
  cacheLoadedAt = 0;
}

/**
 * The catalog as currently stored, with `resolve(deviceRow)` bound to it.
 * Cached for CACHE_TTL_MS; `refreshFromSimkura()` invalidates.
 */
async function load() {
  if (cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return cache;
  const { rows } = await query(
    `SELECT manufacturer, board, display_name, num_doors, power_type,
            capabilities, features, supported, synced_at
       FROM device_boards
      ORDER BY manufacturer, board`
  );
  cache = {
    boards: rows,
    resolve: (device) => resolveBoard(rows, device),
  };
  cacheLoadedAt = Date.now();
  return cache;
}

module.exports = {
  load, refreshFromSimkura, invalidate,
  // pure helpers (tested directly)
  rowFromBoard, rowsFromCatalog, resolveBoard, publicBoard,
};
