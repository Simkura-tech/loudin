/**
 * Shared PostgreSQL pool.
 *
 * Single point where the app talks to the database. Controllers and models
 * should import `query` for one-shot statements or `getClient` for
 * transactions.
 */

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 5433,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client:', err);
});

/**
 * One-shot parameterized query.
 *   const { rows } = await query('SELECT * FROM users WHERE id=$1', [id]);
 */
function query(text, params) {
  return pool.query(text, params);
}

/**
 * Acquire a dedicated client for transactions. Caller MUST release.
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     ...
 *     await client.query('COMMIT');
 *   } catch (e) {
 *     await client.query('ROLLBACK'); throw e;
 *   } finally {
 *     client.release();
 *   }
 */
function getClient() {
  return pool.connect();
}

module.exports = { pool, query, getClient };
