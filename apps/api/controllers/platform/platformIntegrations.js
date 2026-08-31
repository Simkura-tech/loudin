'use strict';

/**
 * Platform integration settings — registry-driven, managed from the admin
 * "API access" page. Every integration in
 * services/platform/integrationRegistry.js gets a card in the UI; nothing
 * here is specific to any one integration.
 *
 * Values are stored as platform_config overrides (env vars remain the
 * fallback — see services/platform/integrationSettings.js). Secrets are
 * write-only: GET returns a masked hint, never the stored value.
 *
 * Gated by cookie auth + requirePlatformAdmin (mounted in
 * routes/internal/platform.js).
 */

const settings = require('../../services/platform/integrationSettings');
const registry = require('../../services/platform/integrationRegistry');
const { recordAudit } = require('../../services/platform/audit');

function badRequest(res, message) {
  return res.status(400).json({ error: 'Bad Request', message });
}

/** status() is descriptor code — never let it take the whole page down. */
function statusFor(descriptor) {
  try {
    return descriptor.status();
  } catch (err) {
    return { configured: false, error: err.message };
  }
}

/** Everything the UI needs to render one integration card. */
function describe(descriptor) {
  return {
    name:        descriptor.name,
    label:       descriptor.label,
    description: descriptor.description || null,
    docs_url:    descriptor.docsUrl || null,
    fields:      settings.snapshot(descriptor.name),
    status:      statusFor(descriptor),
  };
}

// ── GET /api/platform/integrations ───────────────────────────────────────────
// Ordered list (registry order) of every integration: label/description,
// per-field value/hint + source (db override vs env), computed status.
async function list(req, res, next) {
  try {
    await settings.init();
    return res.json({ integrations: registry.integrations.map(describe) });
  } catch (err) { return next(err); }
}

// ── PUT /api/platform/integrations/:name ─────────────────────────────────────
// Body: { values: { field: string } }. Empty string clears the override
// (reverts to env). Secrets are only ever accepted here, never echoed.
async function update(req, res, next) {
  try {
    const name = req.params.name;
    const descriptor = registry.byName[name];
    if (!descriptor) return badRequest(res, `Unknown integration: ${name}`);

    const values = req.body?.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      return badRequest(res, 'Body must be { values: { field: value } }');
    }

    await settings.init();
    try {
      await settings.set(name, values);
    } catch (e) {
      return badRequest(res, e.message);
    }

    // Integrations that snapshot credentials at construction (e.g. the
    // Simkura client) rebuild themselves here so the save takes effect
    // without a restart. Optional hook.
    descriptor.reconfigure?.();

    // Field NAMES only in the audit trail — never the values.
    recordAudit(req, 'integration.update', {
      target_type: 'integration',
      target_id:   name,
      metadata:    { fields: Object.keys(values) },
    });

    return res.json({ integration: name, ...describe(descriptor) });
  } catch (err) { return next(err); }
}

// ── POST /api/platform/integrations/:name/test ───────────────────────────────
// Live connection probe with the currently-effective settings. Always
// HTTP 200 with { api: { ok, ... } } — a failed probe is a result, not a
// server error (descriptors return { ok: false, ... } or throw; a throw
// becomes { ok: false, error }).
async function test(req, res, next) {
  try {
    const name = req.params.name;
    const descriptor = registry.byName[name];
    if (!descriptor) return badRequest(res, `Unknown integration: ${name}`);

    await settings.init();

    let api;
    try {
      api = await descriptor.test();
    } catch (err) {
      api = { ok: false, error: err.message };
    }
    if (!api || typeof api.ok !== 'boolean') {
      api = { ok: false, error: 'test() returned no result' };
    }
    return res.json({ integration: name, api });
  } catch (err) { return next(err); }
}

module.exports = { list, update, test };
