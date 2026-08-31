/**
 * API key service.
 *
 * Token shape: `ldn_live_{prefix}{secret}` where prefix is 8 chars of
 * url-safe random + an underscore boundary (so the prefix is visually
 * distinct in the UI) and secret is another 24 chars of random.
 *
 * Storage: we keep `prefix` (used as an O(1) lookup index) plus a bcrypt
 * hash of the FULL token. On verify we look up by prefix, then
 * bcrypt-compare the full submitted token. The plaintext leaves the
 * server exactly once — at creation time.
 *
 * Available scopes (extend as we open more /api/external endpoints):
 *   ping            — verify the key is valid (the demo endpoint)
 *   read:companies  — list companies
 *   read:devices    — fleet view
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const { query } = require('../../database/db');

const PREFIX_BYTES = 6;   // 8 url-safe chars
const PREFIX_LEN = 8;     // display/parse length — createKey slices to this
const SECRET_BYTES = 18;  // ~24 url-safe chars
const TOKEN_PREFIX = 'ldn_live_';
const BCRYPT_ROUNDS = 10;

const ALLOWED_SCOPES = ['ping', 'read:companies', 'read:devices'];

function urlSafeBase64(buf) {
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

/**
 * Mint a new API key. Returns:
 *   { id, token, prefix, name, scopes, created_at }
 * `token` is the plaintext — show it to the user ONCE, never again.
 */
async function createKey({ name, scopes, createdBy }) {
  if (!name || typeof name !== 'string') throw new Error('name is required');
  const filteredScopes = Array.isArray(scopes)
    ? scopes.filter((s) => ALLOWED_SCOPES.includes(s))
    : [];

  const prefix = urlSafeBase64(crypto.randomBytes(PREFIX_BYTES)).slice(0, PREFIX_LEN);
  const secret = urlSafeBase64(crypto.randomBytes(SECRET_BYTES));
  const token  = `${TOKEN_PREFIX}${prefix}_${secret}`;
  const keyHash = await bcrypt.hash(token, BCRYPT_ROUNDS);

  const { rows: [row] } = await query(
    `INSERT INTO api_keys (name, prefix, key_hash, scopes, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, prefix, scopes, created_at`,
    [name.trim(), prefix, keyHash, filteredScopes, createdBy ?? null]
  );

  return { ...row, token };
}

/** Public list — never includes the hash or plaintext. */
async function listKeys() {
  const { rows } = await query(
    `SELECT id, name, prefix, scopes, created_by,
            created_at, last_used_at, revoked_at
       FROM api_keys
      ORDER BY revoked_at IS NULL DESC, created_at DESC`
  );
  return rows;
}

async function revokeKey(id) {
  const { rowCount } = await query(
    `UPDATE api_keys SET revoked_at = NOW()
      WHERE id = $1 AND revoked_at IS NULL`,
    [id]
  );
  return rowCount > 0;
}

/**
 * Verify an incoming bearer token. Returns the matching api_key row
 * (with scopes etc.) or null when invalid / revoked. Stamps last_used_at
 * as a side effect on success.
 */
async function verifyToken(rawToken) {
  if (typeof rawToken !== 'string' || !rawToken.startsWith(TOKEN_PREFIX)) return null;
  // Token shape: ldn_live_{prefix}_{secret}. The prefix is always exactly
  // PREFIX_LEN chars, so parse by position — the url-safe alphabet includes
  // `_`, so scanning for the separator would truncate ~12% of prefixes.
  const tail = rawToken.slice(TOKEN_PREFIX.length);
  if (tail.length <= PREFIX_LEN + 1 || tail[PREFIX_LEN] !== '_') return null;
  const prefix = tail.slice(0, PREFIX_LEN);

  const { rows } = await query(
    `SELECT id, name, prefix, key_hash, scopes, revoked_at
       FROM api_keys
      WHERE prefix = $1 AND revoked_at IS NULL
      LIMIT 1`,
    [prefix]
  );
  const row = rows[0];
  if (!row) return null;

  const match = await bcrypt.compare(rawToken, row.key_hash);
  if (!match) return null;

  // Fire-and-forget last-used stamp. We don't await — the request is
  // already authenticated, no need to block its response.
  query(`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [row.id])
    .catch((err) => console.error('[apiKey] last_used_at update failed:', err.message));

  return {
    id:     row.id,
    name:   row.name,
    prefix: row.prefix,
    scopes: row.scopes || [],
  };
}

module.exports = {
  ALLOWED_SCOPES,
  createKey,
  listKeys,
  revokeKey,
  verifyToken,
};
