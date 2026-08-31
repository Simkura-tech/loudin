/**
 * Password hashing + strength validation.
 *
 * bcrypt at cost 10. Strength rule kept intentionally light to match the
 * frontend hint ("8+ characters with a mix of letters and numbers") — we'd
 * rather not have backend rejections the user can't predict from the UI.
 * Stiffen this later if we add a real password policy.
 */

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;
const MIN_LENGTH  = 8;
const MAX_LENGTH  = 128;

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(password, salt);
}

async function comparePassword(password, hashedPassword) {
  if (!hashedPassword) return false; // OAuth-only accounts have no local password
  return bcrypt.compare(password, hashedPassword);
}

function validatePasswordStrength(password) {
  const errors = [];
  if (!password || typeof password !== 'string') {
    return { isValid: false, errors: ['Password is required'] };
  }
  if (password.length < MIN_LENGTH) {
    errors.push(`Password must be at least ${MIN_LENGTH} characters long`);
  }
  if (password.length > MAX_LENGTH) {
    errors.push(`Password must not exceed ${MAX_LENGTH} characters`);
  }
  if (!/[A-Za-z]/.test(password)) {
    errors.push('Password must contain at least one letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  return { isValid: errors.length === 0, errors };
}

module.exports = { hashPassword, comparePassword, validatePasswordStrength };
