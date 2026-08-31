'use strict';

/**
 * Integration settings — DB-backed overrides for platform integrations,
 * managed from the platform-admin UI.
 *
 * WHICH integrations and fields exist comes from the registry
 * (./integrationRegistry.js — one descriptor module per integration).
 * This module owns HOW a field resolves:
 *
 * Values live in `platform_config` (key = "integration.<name>.<field>").
 * Resolution order per field: platform_config row (if set, non-empty)
 * → env var(s) → null. Env vars keep working untouched; a DB row is an
 * override, and clearing it reverts to env.
 *
 * The cache is in-process. init() loads it once at boot; set() updates
 * rows and the cache in the same call, so a save from the admin UI takes
 * effect immediately in this process (the API runs on a single VM — if
 * that ever changes, add a cross-instance refresh).
 *
 * Secrets are stored plaintext in platform_config, same trust level as
 * apps/api/.env on the VM. Revisit if the DB ever gets wider access.
 */

const { query } = require('../../database/db');

const KEY_PREFIX = 'integration.';

/**
 * The registry is required LAZILY — descriptors are allowed to require
 * this module back (the Simkura config chain does), so a top-level
 * require here would create a cycle and hand one side partial exports.
 */
function registry() {
  return require('./integrationRegistry');
}

function fieldDefs(integration) {
  const d = registry().byName[integration];
  return d ? d.fields : [];
}

function integrationNames() {
  return registry().integrations.map((d) => d.name);
}

// key ("integration.simkura.api_url") → value. Populated by init()/set().
const cache = new Map();
let loadPromise = null;

function keyFor(integration, field) {
  return `${KEY_PREFIX}${integration}.${field}`;
}

function fieldDef(integration, field) {
  return fieldDefs(integration).find((f) => f.field === field) || null;
}

/**
 * Load every integration.* row into the cache. Idempotent; concurrent
 * callers share one query. Called at boot and after set().
 */
async function init() {
  if (!loadPromise) {
    loadPromise = (async () => {
      const { rows } = await query(
        `SELECT key, value FROM platform_config WHERE key LIKE $1`,
        [`${KEY_PREFIX}%`]
      );
      cache.clear();
      for (const r of rows) {
        if (r.value != null && String(r.value).trim() !== '') cache.set(r.key, r.value);
      }
    })().catch((err) => {
      loadPromise = null; // allow retry on next init()
      throw err;
    });
  }
  return loadPromise;
}

/**
 * Resolve one field synchronously from the in-process cache + env.
 * Returns { value, source } where source ∈ 'db' | 'env' | null.
 * Before init() completes this only sees env — callers that must have DB
 * values at a specific moment should await init() first.
 */
function resolve(integration, field) {
  const def = fieldDef(integration, field);
  if (!def) return { value: null, source: null };

  const dbVal = cache.get(keyFor(integration, field));
  if (dbVal != null && String(dbVal).trim() !== '') {
    return { value: String(dbVal), source: 'db' };
  }
  for (const envVar of def.env) {
    const v = process.env[envVar];
    if (v != null && String(v).trim() !== '') return { value: String(v), source: 'env' };
  }
  return { value: null, source: null };
}

/** Shorthand: resolved value or null. */
function get(integration, field) {
  return resolve(integration, field).value;
}

/**
 * Upsert overrides for one integration. `values` maps field → string;
 * empty string / null clears the override (reverts to env). Unknown
 * fields throw. Cache is updated in the same call.
 */
async function set(integration, values) {
  if (!registry().byName[integration]) {
    throw new Error(`Unknown integration: ${integration}`);
  }
  const entries = Object.entries(values || {});
  if (entries.length === 0) throw new Error('No fields to update');

  for (const [field, raw] of entries) {
    const def = fieldDef(integration, field);
    if (!def) throw new Error(`Unknown field for ${integration}: ${field}`);
    if (raw != null && typeof raw !== 'string') {
      throw new Error(`${field} must be a string`);
    }

    const key = keyFor(integration, field);
    const value = raw == null ? '' : raw.trim();
    if (value === '') {
      await query(`DELETE FROM platform_config WHERE key = $1`, [key]);
      cache.delete(key);
    } else {
      await query(
        `INSERT INTO platform_config (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value]
      );
      cache.set(key, value);
    }
  }
}

/** Mask a secret for display: last 4 chars, never the length. */
function mask(value) {
  if (!value) return null;
  return `…${String(value).slice(-4)}`;
}

/**
 * Admin-facing snapshot of one integration's fields, in descriptor order.
 * Secrets come back masked (`hint`), non-secrets in full (`value`).
 * `source` tells the UI whether the effective value is a DB override or
 * an env var. Descriptor display metadata (placeholder/help) rides along
 * so the UI needs nothing integration-specific.
 */
function snapshot(integration) {
  const out = {};
  for (const def of fieldDefs(integration)) {
    const { value, source } = resolve(integration, def.field);
    out[def.field] = {
      label:  def.label,
      secret: def.secret,
      source,
      set:    value != null,
      ...(def.secret ? { hint: mask(value) } : { value }),
      ...(def.placeholder ? { placeholder: def.placeholder } : {}),
      ...(def.help ? { help: def.help } : {}),
    };
  }
  return out;
}

module.exports = { init, resolve, get, set, snapshot, mask };

// Back-compat views of the registry (kept lazy for the same cycle reason).
Object.defineProperty(module.exports, 'INTEGRATIONS', {
  enumerable: true,
  get: integrationNames,
});
Object.defineProperty(module.exports, 'FIELDS', {
  enumerable: true,
  get: () => Object.fromEntries(registry().integrations.map((d) => [d.name, d.fields])),
});
