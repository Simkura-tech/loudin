#!/usr/bin/env node
/**
 * run-sql.js — execute a .sql file against the configured database.
 *
 * A thin helper for one-off seed/maintenance scripts that aren't migrations
 * (which are tracked in schema_migrations). Loads .env the same way migrate.js
 * does, then runs the file as a single batch.
 *
 * Usage: node database/scripts/run-sql.js <path-to.sql>
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { pool } = require('../db');

async function main() {
  const rel = process.argv[2];
  if (!rel) {
    console.error('Usage: node database/scripts/run-sql.js <path-to.sql>');
    process.exit(1);
  }
  const file = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);
  const sql = fs.readFileSync(file, 'utf8');
  console.log(`Running ${path.basename(file)}…`);
  try {
    await pool.query(sql);
    console.log('Done.');
  } catch (err) {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
