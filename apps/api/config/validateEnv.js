/**
 * Fail-fast environment validation.
 *
 * Required at the very top of server.js (immediately after dotenv) so a
 * misconfigured process dies at boot with an actionable message instead of
 * failing at the first query or the first login.
 *
 * Deliberately small in scope: only variables the API cannot run without.
 * Optional integrations (Resend, Twilio, Google OAuth, Simkura) are NOT
 * validated here — the app degrades gracefully without them (see the
 * "Optional services" section in the root README.md).
 */

'use strict';

const isProduction = process.env.NODE_ENV === 'production';

// Values that ship in examples/templates and must never reach production.
const PLACEHOLDER_JWT_SECRETS = new Set([
  'change_me_in_production',                            // apps/api/.env.example
  'insecure-dev-only-secret-do-not-use-in-production',  // docker-compose.yml
  'changeme',
  'change_me',
  'secret',
  'jwt_secret',
  'your_jwt_secret',
  'your_jwt_secret_here',
]);

const problems = [];

if (!process.env.DB_NAME) {
  problems.push('DB_NAME is not set — refusing to guess which database to connect to.');
}

// Presence check, not truthiness: an empty string is a deliberate
// "my local Postgres has no password" and is allowed.
if (process.env.DB_PASSWORD === undefined) {
  problems.push(
    'DB_PASSWORD is not set. If your Postgres genuinely has no password, ' +
    'set it to an explicit empty value (DB_PASSWORD=).'
  );
}

if (!process.env.JWT_SECRET) {
  problems.push(
    'JWT_SECRET is not set. Generate a strong value with: openssl rand -base64 48'
  );
} else if (isProduction && PLACEHOLDER_JWT_SECRETS.has(process.env.JWT_SECRET.toLowerCase())) {
  problems.push(
    'JWT_SECRET is a known placeholder value — refusing to start in production. ' +
    'Generate a strong value with: openssl rand -base64 48'
  );
}

if (problems.length > 0) {
  console.error('\nFATAL: invalid environment configuration:\n');
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(
    '\nSet these in apps/api/.env (see apps/api/.env.example for the full ' +
    'template) or in the process environment, then restart.\n'
  );
  process.exit(1);
}
