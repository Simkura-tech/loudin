#!/usr/bin/env node
/**
 * First-admin bootstrap — creates the platform company + its first Admin
 * user on a fresh database. This is the PRODUCTION setup path (the dev seed
 * in database/seeds/seed.sql stays for local hacking); it is intentionally
 * allowed to run with NODE_ENV=production.
 *
 * Usage (from apps/api directory):
 *   node scripts/create-admin.js \
 *     --email admin@example.com \
 *     --password 'a-strong-password1' \
 *     --company-name 'Acme Access' \
 *     --shape own-doors        # or: service
 *
 * The --shape answer configures the deployment (docs/deployment-shapes.md):
 *   service    — you host the platform for other companies; open self-service
 *                signup stays enabled.
 *   own-doors  — a single company managing its own doors; open signup is
 *                disabled (platform_config signups.enabled='false') so the
 *                instance is invite-only from the first boot.
 *
 * Refuses to run when a platform Admin already exists — this script
 * bootstraps, it never duplicates. Run migrations first:
 *   node database/scripts/migrate.js
 */

const path = require('path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { hashPassword, validatePasswordStrength } = require('../utils/password');

const SHAPES = ['service', 'own-doors'];

// ── Argument parsing (--flag value and --flag=value) ─────────────────────────

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) fail(`Unexpected argument: ${arg} (see --help)`);
    let key, value;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      key = arg.slice(2, eq);
      value = arg.slice(eq + 1);
    } else {
      key = arg.slice(2);
      if (key === 'help' || key === 'h') { out.help = true; continue; }
      value = argv[++i];
      if (value === undefined) fail(`--${key} requires a value`);
    }
    out[key] = value;
  }
  return out;
}

function usage() {
  console.log(`
First-admin bootstrap — creates the platform company + first Admin user.

Usage:
  node scripts/create-admin.js --email <email> --password <password> \\
      --company-name <name> --shape service|own-doors

Options:
  --email         Admin login email (required)
  --password      Admin password — 8+ chars with a letter and a number (required)
  --company-name  Name of the platform company (required)
  --shape         'service'   — hosting for other companies; signups stay open
                  'own-doors' — single company managing its own doors; open
                                signup is disabled (invite-only instance)
                  (required)
  --first-name    Admin first name (default: 'Platform')
  --last-name     Admin last name  (default: 'Admin')
  --help          Show this help

Database connection comes from apps/api/.env (DB_HOST / DB_PORT / DB_NAME /
DB_USER / DB_PASSWORD), same as the API server. Run migrations first:
  node database/scripts/migrate.js
`);
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { usage(); process.exit(0); }

  const email       = String(opts.email || '').trim().toLowerCase();
  const password    = String(opts.password || '');
  const companyName = String(opts['company-name'] || '').trim();
  const shape       = String(opts.shape || '').trim();
  const firstName   = String(opts['first-name'] || 'Platform').trim();
  const lastName    = String(opts['last-name']  || 'Admin').trim();

  if (!email)               fail('--email is required (see --help)');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`'${email}' does not look like an email address`);
  if (!password)            fail('--password is required (see --help)');
  if (!companyName)         fail('--company-name is required (see --help)');
  if (!SHAPES.includes(shape)) {
    fail(`--shape must be one of: ${SHAPES.join(', ')} (see --help)`);
  }

  const strength = validatePasswordStrength(password);
  if (!strength.isValid) fail(`Password rejected:\n  - ${strength.errors.join('\n  - ')}`);

  if (!process.env.DB_NAME) fail('DB_NAME not set — configure apps/api/.env first');

  const pool = new Pool({
    host:     process.env.DB_HOST || 'localhost',
    port:     process.env.DB_PORT || 5433,
    database: process.env.DB_NAME,
    user:     process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  const client = await pool.connect();
  try {
    // ── Refuse to double-bootstrap ───────────────────────────────────────
    const { rows: existingAdmins } = await client.query(
      `SELECT u.email, c.name AS company_name
         FROM users u
         JOIN companies c ON c.id = u.company_id
        WHERE c.company_type = 'platform'
          AND u.user_type_id = 1
          AND u.deleted_at IS NULL
          AND c.deleted_at IS NULL
        LIMIT 1`
    );
    if (existingAdmins.length > 0) {
      fail(
        `A platform admin already exists (${existingAdmins[0].email} at ` +
        `'${existingAdmins[0].company_name}'). This script bootstraps a fresh ` +
        `install only — add further admins from inside the app.`
      );
    }

    const { rows: emailTaken } = await client.query(
      `SELECT 1 FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1`,
      [email]
    );
    if (emailTaken.length > 0) {
      fail(`A user with email ${email} already exists.`);
    }

    const passwordHash = await hashPassword(password);

    await client.query('BEGIN');

    // Reuse a platform company if one exists without an admin (recovers a
    // partially bootstrapped install); otherwise create it.
    const { rows: existingCompany } = await client.query(
      `SELECT id, name FROM companies
        WHERE company_type = 'platform' AND deleted_at IS NULL
        LIMIT 1`
    );

    let company;
    let companyReused = false;
    if (existingCompany.length > 0) {
      company = existingCompany[0];
      companyReused = true;
    } else {
      const { rows } = await client.query(
        `INSERT INTO companies (name, company_type, status)
         VALUES ($1, 'platform', 'active')
         RETURNING id, name`,
        [companyName]
      );
      company = rows[0];
    }

    const { rows: [user] } = await client.query(
      `INSERT INTO users
         (company_id, user_type_id, email, first_name, last_name,
          password_hash, status, email_verified, email_verified_at)
       VALUES ($1, 1, $2, $3, $4, $5, 'active', true, NOW())
       RETURNING id, email`,
      [company.id, email, firstName, lastName, passwordHash]
    );

    // own-doors deployments are invite-only from the start: close open
    // self-signup. 'service' leaves signups enabled (the default), so no
    // row is written — SIGNUPS_ENABLED in .env still applies if set.
    if (shape === 'own-doors') {
      await client.query(
        `INSERT INTO platform_config (key, value, updated_at)
         VALUES ('signups.enabled', 'false', NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`
      );
    }

    await client.query('COMMIT');

    console.log(`
Bootstrap complete.

  Platform company : ${company.name} (id ${company.id})${companyReused ? '  [existing company reused]' : ''}
  Admin user       : ${user.email} (id ${user.id})
  Deployment shape : ${shape === 'own-doors'
    ? 'own-doors — open self-signup DISABLED (invite-only instance)'
    : 'service — open self-signup enabled'}

Next steps:
  1. Start the API and frontend (or restart if already running).
  2. Sign in at ${process.env.FRONTEND_URL || 'http://localhost:8081'}/login with the email above.${shape === 'own-doors' ? `
  3. Your platform workspace manages doors directly — claim devices under
     Devices → "Our devices" and add credential holders under People.
     To re-open signups later (growing into a service provider), see
     docs/deployment-shapes.md.` : `
  3. Companies can now self-register at /signup, or be invited.
     See docs/deployment-shapes.md for the service-provider setup.`}
`);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* not in a tx */ }
    // fail() exits before we get here for expected refusals — this path is
    // for genuine DB errors.
    console.error('Bootstrap failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
