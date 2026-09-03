/**
 * Platform feature flags — platform-wide kill switches for optional
 * product features.
 *
 * A platform admin can turn a feature off for everyone (Platform →
 * Features). Off means two things, enforced in two places:
 *   - the API refuses the feature's routes / commands with 403
 *     `feature_disabled` (requireFeature / assertEnabled), so a stale UI
 *     or a direct API call can't use it;
 *   - the web app hides the feature's UI (GET /api/features, consumed by
 *     FeaturesContext). Hidden, not greyed: a platform switch means "not
 *     offered", unlike a hardware capability gate which means "this board
 *     can't".
 *
 * Storage: platform_config rows keyed `feature.<key>` with value '1' / '0';
 * no row = the feature's default (on). Values are cached in-process for
 * CACHE_TTL_MS and invalidated on every write, so a flip lands within
 * seconds on every API instance.
 *
 * Adding a feature: add an entry to FEATURES, then gate its routes with
 * requireFeature(key) and its UI with useFeatures().enabled(key).
 */

const { query } = require('../../database/db');

const FEATURES = Object.freeze([
  {
    key: 'schedules',
    label: 'Schedules',
    description: 'Recurring auto-unlock windows (shifts) per door, and the Schedules tab on the device page.',
  },
  {
    key: 'holidays',
    label: 'Holidays',
    description: 'Date-range overrides per door — locked, unlocked or lockdown for a window — and the Holidays tab.',
  },
  {
    key: 'door_mode',
    label: 'Door mode',
    description: 'Admin overrides on the device page: Lock mode, Unlock mode, Lockdown mode and Normal.',
  },
  {
    key: 'momentary_unlock',
    label: 'Momentary unlock',
    description: 'The remote pulse-unlock button on the device page.',
  },
  {
    key: 'provisioning',
    label: 'Provisioning',
    description: 'Reader technology and latch-interval settings on the device page.',
  },
  {
    key: 'maintenance',
    label: 'Maintenance actions',
    description: 'Reboot, Re-sync (wipe and re-push) and Clear device on the device page. The normal "Update device" push is always available.',
  },
]);

const BY_KEY = Object.fromEntries(FEATURES.map((f) => [f.key, f]));
const CACHE_TTL_MS = 15_000;

let cache = null;       // Map<key, boolean>
let cacheLoadedAt = 0;

function keyFor(feature) { return `feature.${feature}`; }

function isFeature(key) { return Object.prototype.hasOwnProperty.call(BY_KEY, key); }

/** Effective on/off for every feature, cached. */
async function load() {
  if (cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS) return cache;
  const { rows } = await query(
    `SELECT key, value FROM platform_config WHERE key LIKE 'feature.%'`
  );
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  cache = new Map(FEATURES.map((f) => {
    const v = stored.get(keyFor(f.key));
    return [f.key, v == null ? true : v === '1'];
  }));
  cacheLoadedAt = Date.now();
  return cache;
}

function invalidate() { cache = null; cacheLoadedAt = 0; }

async function isEnabled(key) {
  if (!isFeature(key)) return true; // unknown = ungated
  return (await load()).get(key) !== false;
}

/** Registry + effective state, for the admin UI and GET /api/features. */
async function list() {
  const flags = await load();
  return FEATURES.map((f) => ({ ...f, enabled: flags.get(f.key) !== false }));
}

/** Effective state only, keyed by feature — what the web app consumes. */
async function snapshot() {
  const flags = await load();
  return Object.fromEntries(FEATURES.map((f) => [f.key, flags.get(f.key) !== false]));
}

/**
 * Persist { key: boolean, … }. Unknown keys or non-boolean values throw.
 * Setting a feature to its default (on) deletes the row rather than
 * storing '1', so platform_config only carries actual overrides.
 */
async function set(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new Error('Body must be { features: { key: boolean } }');
  }
  for (const [key, value] of Object.entries(values)) {
    if (!isFeature(key)) throw new Error(`Unknown feature: ${key}`);
    if (typeof value !== 'boolean') throw new Error(`${key} must be true or false`);
  }
  for (const [key, value] of Object.entries(values)) {
    if (value) {
      await query(`DELETE FROM platform_config WHERE key = $1`, [keyFor(key)]);
    } else {
      await query(
        `INSERT INTO platform_config (key, value, updated_at)
         VALUES ($1, '0', NOW())
         ON CONFLICT (key) DO UPDATE SET value = '0', updated_at = NOW()`,
        [keyFor(key)]
      );
    }
  }
  invalidate();
}

function disabledResponse(res, key) {
  const label = BY_KEY[key]?.label ?? key;
  return res.status(403).json({
    error:   'Forbidden',
    code:    'feature_disabled',
    feature: key,
    message: `${label} is turned off for this platform.`,
  });
}

/** Express middleware: 403 feature_disabled when the feature is off. */
function requireFeature(key) {
  if (!isFeature(key)) throw new Error(`requireFeature: unknown feature ${key}`);
  return async (req, res, next) => {
    try {
      if (!(await isEnabled(key))) return disabledResponse(res, key);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  FEATURES, isFeature, isEnabled, list, snapshot, set, invalidate,
  requireFeature, disabledResponse,
};
