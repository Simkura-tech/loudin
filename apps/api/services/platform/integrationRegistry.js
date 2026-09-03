'use strict';

/**
 * Platform integration registry — THE list of integrations whose settings
 * are editable from the platform-admin "API access → Integrations" tab.
 *
 * To add an integration, write one descriptor module and add one require()
 * to the list below — that's the whole contribution surface. See
 * docs/integrations/adding-an-integration.md for the descriptor contract.
 * By convention, hardware descriptors live in hardware/<name>/integration.js
 * and service descriptors in integrations/<name>/integration.js.
 *
 * The list is explicit on purpose — no directory autoscan. What ships is
 * exactly what is written here, in this order (the admin UI renders cards
 * in list order).
 *
 * REQUIRE-CYCLE NOTE: integrationSettings.js requires this file *lazily*
 * (inside its functions, never at module top) because descriptors are
 * allowed to require integrationSettings — and the Simkura config chain
 * does exactly that. Keep it that way.
 */

const integrations = [
  require('../../hardware/simkura/integration'),
  require('../../integrations/resend/integration'),
  require('../../integrations/twilio/integration'),
  require('../../integrations/google/integration'),
];

// ── descriptor validation — fail fast at boot, not on first request ─────────
const byName = {};
for (const d of integrations) {
  if (!d || typeof d !== 'object') {
    throw new Error('integrationRegistry: descriptor must be an object');
  }
  const where = d.name || '(unnamed)';
  if (typeof d.name !== 'string' || !/^[a-z0-9_-]+$/.test(d.name)) {
    throw new Error(`integrationRegistry: ${where}: name must be a lowercase slug ([a-z0-9_-])`);
  }
  if (byName[d.name]) {
    throw new Error(`integrationRegistry: duplicate integration name: ${d.name}`);
  }
  if (typeof d.label !== 'string' || !d.label) {
    throw new Error(`integrationRegistry: ${where}: label is required`);
  }
  if (!Array.isArray(d.fields) || d.fields.length === 0) {
    throw new Error(`integrationRegistry: ${where}: fields must be a non-empty array`);
  }
  for (const f of d.fields) {
    if (!f || typeof f.field !== 'string' || !/^[a-z0-9_]+$/.test(f.field)) {
      throw new Error(`integrationRegistry: ${where}: each field needs a slug \`field\` ([a-z0-9_])`);
    }
    if (typeof f.label !== 'string' || !f.label) {
      throw new Error(`integrationRegistry: ${where}.${f.field}: label is required`);
    }
    if (!Array.isArray(f.env)) {
      throw new Error(`integrationRegistry: ${where}.${f.field}: env must be an array (may be empty)`);
    }
  }
  if (typeof d.status !== 'function' || typeof d.test !== 'function') {
    throw new Error(`integrationRegistry: ${where}: status() and test() are required`);
  }
  if (d.reconfigure != null && typeof d.reconfigure !== 'function') {
    throw new Error(`integrationRegistry: ${where}: reconfigure must be a function when present`);
  }
  byName[d.name] = d;
}

module.exports = { integrations, byName };
