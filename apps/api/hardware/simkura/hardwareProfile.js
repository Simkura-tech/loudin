/**
 * Simkura v2 → `devices` hardware-profile mapping.
 *
 * The "hardware profile" is everything on the v2 device resource that is a
 * provisioning-time fact or a board capability rather than live state:
 *
 *   device.manufacturer      → manufacturer
 *   device.board             → device_type (lowercased; the board designation)
 *   device.version           → hardware_version
 *   device.numDoors          → num_doors
 *   meta.deployed            → deployed
 *   capabilities[]           → capabilities   (JSONB)
 *   features{}               → features       (JSONB)
 *   supported{}              → supported      (JSONB)
 *   cardFormats[]            → card_formats   (JSONB)  full resource only
 *   power.type               → power_type              full resource only
 *   connectivity.transport   → connectivity_transport  full resource only
 *
 * Both the list spine (GET /v2/devices — discovery) and the full resource
 * (GET /v2/devices/:id — state sync, claim) go through the same function:
 * fields the payload doesn't carry are omitted, so a spine never nulls out
 * what a full read already stored, and an UPDATE built from the result
 * never regresses a column.
 *
 * Vocabularies are additive upstream (new capability slugs, feature flags,
 * supported keys, card formats), so nothing here whitelists the *contents*
 * of the JSON tiers — only their shape. The two small enums with a column
 * CHECK (power_type, connectivity_transport) are validated here so a value
 * outside the CHECK is dropped instead of failing the whole UPDATE.
 *
 * Migration 085 adds the columns.
 */

const POWER_TYPES = new Set(['battery', 'plugin']);
const TRANSPORTS  = new Set(['cellular', 'wifi', 'ethernet']);

/** Columns whose values are JSON — must be stringified for node-postgres
 *  (it would otherwise send a JS array as a Postgres array literal). */
const JSONB_COLUMNS = new Set(['capabilities', 'features', 'supported', 'card_formats']);

function cleanString(v, max = 64) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function stringArray(v) {
  if (!Array.isArray(v)) return null;
  return v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
}

/**
 * Map one v2 device payload (spine or full resource) onto `devices`
 * columns. Returns only the columns the payload carried.
 */
function profileFromResource(resource) {
  const out = {};
  if (!resource || typeof resource !== 'object') return out;

  const dev = resource.device ?? {};

  const board = cleanString(dev.board);
  if (board) out.device_type = board.toLowerCase();

  const manufacturer = cleanString(dev.manufacturer);
  if (manufacturer) out.manufacturer = manufacturer;

  const version = cleanString(dev.version);
  if (version) out.hardware_version = version;

  const numDoors = Number(dev.numDoors);
  if (Number.isInteger(numDoors) && numDoors >= 1) out.num_doors = numDoors;

  if (typeof resource.meta?.deployed === 'boolean') out.deployed = resource.meta.deployed;

  const capabilities = stringArray(resource.capabilities);
  if (capabilities) out.capabilities = capabilities;

  if (resource.features && typeof resource.features === 'object' && !Array.isArray(resource.features)) {
    const features = {};
    for (const [k, v] of Object.entries(resource.features)) {
      if (typeof v === 'boolean') features[k] = v;
    }
    out.features = features;
  }

  if (resource.supported && typeof resource.supported === 'object' && !Array.isArray(resource.supported)) {
    const supported = {};
    for (const [k, v] of Object.entries(resource.supported)) {
      const list = stringArray(v);
      if (list) supported[k] = list;
    }
    out.supported = supported;
  }

  const cardFormats = stringArray(resource.cardFormats);
  if (cardFormats) out.card_formats = cardFormats;

  // Capability blocks — only on the full resource, and only when the
  // device declares the capability (absent block = leave the column alone).
  if (POWER_TYPES.has(resource.power?.type)) out.power_type = resource.power.type;
  if (TRANSPORTS.has(resource.connectivity?.transport)) {
    out.connectivity_transport = resource.connectivity.transport;
  }

  return out;
}

/** Value to bind for a column — JSON tiers stringified, everything else as-is. */
function bindValue(col, value) {
  return JSONB_COLUMNS.has(col) && value != null ? JSON.stringify(value) : value;
}

module.exports = { profileFromResource, bindValue, JSONB_COLUMNS };
