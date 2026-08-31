/**
 * One-time-password service.
 *
 * Generates 6-digit numeric codes, stores them bcrypt-hashed in
 * `verification_codes`, and verifies them on the way back. Codes are
 * single-use, expire in 10 minutes, and attempts are throttled per row.
 *
 * Issue policy: for a given (user_id, purpose), any prior unused row is
 * overwritten with the fresh code. That way "send me a new code" replaces
 * the previous one cleanly and a user can't accumulate stale codes.
 *
 * Used for:
 *   - login_2fa
 *   - password_reset
 *   - verify_email / verify_phone (during 2FA enrollment)
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const { query } = require('../../database/db');

const CODE_LENGTH      = 6;
const TTL_MS           = 10 * 60 * 1000;     // 10 minutes
const MAX_ATTEMPTS     = 5;
const BCRYPT_ROUNDS    = 6;                  // codes are short-lived; cost 6 is fine
const ALLOWED_PURPOSES = ['login_2fa', 'password_reset', 'verify_email', 'verify_phone'];

/** Cryptographically random 6-digit string, zero-padded. */
function generateCode() {
  const n = crypto.randomInt(0, 10 ** CODE_LENGTH);
  return String(n).padStart(CODE_LENGTH, '0');
}

/**
 * Issue a fresh code for (user, purpose) over the given channel/destination.
 * Returns the plaintext code so the caller can hand it to the notifier —
 * we never log or return the code to the API client.
 */
async function issueCode({ userId, purpose, channel, destination }) {
  if (!ALLOWED_PURPOSES.includes(purpose)) {
    throw new Error(`Unknown OTP purpose: ${purpose}`);
  }
  if (!['email', 'sms'].includes(channel)) {
    throw new Error(`Unknown OTP channel: ${channel}`);
  }
  if (!destination) throw new Error('OTP destination is required');

  const code      = generateCode();
  const codeHash  = await bcrypt.hash(code, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + TTL_MS);

  // Wipe any prior unused row for this (user, purpose) so the new code is
  // unambiguously the live one.
  await query(
    `DELETE FROM verification_codes
      WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose]
  );
  await query(
    `INSERT INTO verification_codes
       (user_id, purpose, channel, destination, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, purpose, channel, destination, codeHash, expiresAt]
  );

  return { code, expiresAt };
}

/**
 * Verify a submitted code against the in-flight (user, purpose) row.
 * Returns { ok: true } on success and marks the row as used.
 * Returns { ok: false, reason } on failure. Increments attempts; after
 * MAX_ATTEMPTS the row is deleted so the caller must request a new code.
 */
async function verifyCode({ userId, purpose, code }) {
  if (!code || typeof code !== 'string') {
    return { ok: false, reason: 'missing_code' };
  }
  const { rows } = await query(
    `SELECT id, code_hash, expires_at, attempts
       FROM verification_codes
      WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL
      ORDER BY id DESC
      LIMIT 1`,
    [userId, purpose]
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: 'no_code' };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await query(`DELETE FROM verification_codes WHERE id = $1`, [row.id]);
    return { ok: false, reason: 'expired' };
  }

  const match = await bcrypt.compare(code, row.code_hash);
  if (!match) {
    const newAttempts = row.attempts + 1;
    if (newAttempts >= MAX_ATTEMPTS) {
      await query(`DELETE FROM verification_codes WHERE id = $1`, [row.id]);
      return { ok: false, reason: 'too_many_attempts' };
    }
    await query(
      `UPDATE verification_codes SET attempts = $1 WHERE id = $2`,
      [newAttempts, row.id]
    );
    return { ok: false, reason: 'invalid_code' };
  }

  // Mark used (single-use) so a leaked code can't be replayed.
  await query(
    `UPDATE verification_codes SET used_at = NOW() WHERE id = $1`,
    [row.id]
  );
  return { ok: true };
}

module.exports = { issueCode, verifyCode, CODE_LENGTH, TTL_MS, MAX_ATTEMPTS };
