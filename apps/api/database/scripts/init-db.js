#!/usr/bin/env node
/**
 * Database initialization — runs migrations and (optionally) seed data.
 *
 * Usage (from apps/api directory):
 *   node database/scripts/init-db.js                  # migrate only
 *   node database/scripts/init-db.js --seed           # migrate + seed
 *   node database/scripts/init-db.js --reset          # drop + recreate + migrate
 *   node database/scripts/init-db.js --reset --seed   # full from-scratch bootstrap
 *
 * Migrations are the single source of truth (apps/api/database/migrations).
 * There is no schema.sql snapshot — the migration set IS the schema.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const args = process.argv.slice(2);
const opts = {
  seed:  args.includes('--seed'),
  reset: args.includes('--reset'),
  help:  args.includes('--help') || args.includes('-h'),
};

// Refuse destructive / seeding operations in production. The seed fixtures
// (OMO-AABB00000X devices, demo companies, etc.) are dev-only, and --reset
// drops the entire database. Both must be impossible to trigger by SSH-ing
// to the production VM and typing the wrong command.
if (process.env.NODE_ENV === 'production' && (opts.reset || opts.seed)) {
  console.error(
    'init-db.js refuses --reset and --seed in production. ' +
    'Production deploys must run database/scripts/migrate.js directly.'
  );
  process.exit(1);
}

if (opts.help) {
  console.log(`
Database initialization

Usage:
  node database/scripts/init-db.js [--reset] [--seed]

Options:
  --reset   Drop and recreate the database before migrating (destroys data)
  --seed    Apply seeds/seed.sql after migrations complete
`);
  process.exit(0);
}

const DB_NAME     = process.env.DB_NAME;
const DB_HOST     = process.env.DB_HOST || 'localhost';
const DB_PORT     = process.env.DB_PORT || 5433;
const DB_USER     = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD;

if (!DB_NAME) {
  console.error('DB_NAME not set in .env');
  process.exit(1);
}

async function resetDb() {
  const adminPool = new Pool({
    host: DB_HOST, port: DB_PORT, database: 'postgres',
    user: DB_USER, password: DB_PASSWORD,
  });
  try {
    console.log(`Resetting database '${DB_NAME}'...`);
    await adminPool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [DB_NAME]
    );
    await adminPool.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    await adminPool.query(`CREATE DATABASE ${DB_NAME}`);
    console.log(`  ✓ ${DB_NAME} recreated\n`);
  } finally {
    await adminPool.end();
  }
}

async function runSeed() {
  const seedPath = path.join(__dirname, '../seeds/seed.sql');
  if (!fs.existsSync(seedPath)) {
    console.log('No seed.sql found — skipping');
    return;
  }
  const pool = new Pool({
    host: DB_HOST, port: DB_PORT, database: DB_NAME,
    user: DB_USER, password: DB_PASSWORD,
  });
  try {
    console.log('Running seed.sql...');
    const sql = fs.readFileSync(seedPath, 'utf8');
    await pool.query(sql);
    console.log('  ✓ Seed applied\n');
  } finally {
    await pool.end();
  }
}

(async () => {
  try {
    if (opts.reset) await resetDb();

    console.log('Running migrations...');
    const result = spawnSync(
      process.execPath,
      [path.join(__dirname, 'migrate.js')],
      { stdio: 'inherit' }
    );
    if (result.status !== 0) process.exit(result.status);

    if (opts.seed) await runSeed();

    console.log('Init complete.');
  } catch (err) {
    console.error('Init failed:', err.message);
    process.exit(1);
  }
})();
