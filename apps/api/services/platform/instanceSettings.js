'use strict';

/**
 * Instance settings — deployment-level toggles for this Loudin install.
 *
 * Not an integration (no credentials, no registry entry — see
 * ./integrationSettings.js for that machinery). These are the handful of
 * switches that differ between the two deployment shapes
 * (docs/deployment-shapes.md): running the platform as a service for many
 * companies vs. a single company managing its own doors.
 *
 * Resolution order per setting: platform_config row → env var → default.
 * The DB row wins so the toggle can be flipped at runtime (e.g. by
 * scripts/create-admin.js --shape own-doors) without editing .env; the row
 * is read per call — these settings gate rare operations (signup), so a
 * cache isn't worth the invalidation problem.
 */

const { query } = require('../../database/db');

const SIGNUPS_KEY = 'signups.enabled';

/** 'false' / '0' / 'no' / 'off' (any case) read as disabled; anything else enabled. */
function parseBool(value, fallback) {
  if (value == null || String(value).trim() === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

/**
 * Is open self-service signup allowed on this instance?
 *
 * platform_config 'signups.enabled' → env SIGNUPS_ENABLED → true.
 * Gates open self-service signup on this instance.
 */
async function signupsEnabled() {
  const { rows } = await query(
    `SELECT value FROM platform_config WHERE key = $1`,
    [SIGNUPS_KEY]
  );
  if (rows.length > 0) {
    return parseBool(rows[0].value, true);
  }
  return parseBool(process.env.SIGNUPS_ENABLED, true);
}

module.exports = { signupsEnabled, SIGNUPS_KEY };
