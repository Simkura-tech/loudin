/**
 * JWT utilities.
 *
 * Signing/verifying the session token used in the httpOnly auth cookie.
 * Token payload after the 2026-05-12 rebuild is intentionally small:
 *
 *   { user_id, company_id, user_type_id, email, company_type }
 *
 * Earlier accessible_companies / active_company_id / impersonation fields
 * were dropped along with the installer multi-company concept.
 *
 * TODO (dual-auth): once phone-based auth lands, add `auth_method` to the
 * payload ('email' | 'phone' | 'google') so downstream code can branch on
 * how the user signed in.
 */

const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  throw new Error(
    'FATAL: JWT_SECRET environment variable is not set. Refusing to start with insecure defaults.'
  );
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRE = process.env.JWT_EXPIRE || '24h';
const ISSUER     = 'loudin-api';
const AUDIENCE   = 'loudin-client';

function generateToken({ user_id, company_id, user_type_id, email, company_type, impersonation }) {
  const payload = { user_id, company_id, user_type_id, email, company_type: company_type || null };
  if (impersonation) payload.impersonation = impersonation;
  return jwt.sign(
    payload,
    JWT_SECRET,
    { expiresIn: JWT_EXPIRE, issuer: ISSUER, audience: AUDIENCE }
  );
}

/**
 * Short-lived token used during impersonation. Same payload as the normal
 * session token, just with a tighter expiry — impersonation should feel
 * like a switched seat, not a long-lived session. Re-uses the same
 * verifier; only the expiry differs.
 */
function generateImpersonationToken(payload) {
  return jwt.sign(
    payload,
    JWT_SECRET,
    { expiresIn: process.env.IMPERSONATION_EXPIRE || '1h', issuer: ISSUER, audience: AUDIENCE }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw new Error('Token has expired');
    if (err.name === 'JsonWebTokenError') throw new Error('Invalid token');
    throw new Error('Token verification failed');
  }
}

/**
 * Password reset token. Short-lived, stateless — the user_id is in the token,
 * not in a server-side store. When the mailer is wired, /forgot will email a
 * link containing one of these.
 */
function generatePasswordResetToken(userId) {
  return jwt.sign({ user_id: userId, type: 'password_reset' }, JWT_SECRET, { expiresIn: '1h' });
}

function verifyPasswordResetToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded.type !== 'password_reset') throw new Error('Invalid token type');
    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw new Error('Password reset token has expired');
    if (err.name === 'JsonWebTokenError') throw new Error('Invalid password reset token');
    throw err;
  }
}

/**
 * Email verification token. Used by the planned email-verify flow.
 */
function generateEmailVerificationToken(userId, email) {
  return jwt.sign(
    { user_id: userId, email, type: 'email_verification' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verifyEmailVerificationToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded.type !== 'email_verification') throw new Error('Invalid token type');
    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw new Error('Email verification token has expired');
    if (err.name === 'JsonWebTokenError') throw new Error('Invalid email verification token');
    throw err;
  }
}

/**
 * Pending-2FA token. Used between password validation and the OTP step:
 * the password was correct, but we won't issue a real session until the
 * user submits the right one-time code. 5-minute window.
 */
function generatePending2faToken(userId) {
  return jwt.sign({ user_id: userId, type: 'pending_2fa' }, JWT_SECRET, { expiresIn: '5m' });
}

function verifyPending2faToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded.type !== 'pending_2fa') throw new Error('Invalid token type');
    return decoded;
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw new Error('2FA session has expired — sign in again');
    if (err.name === 'JsonWebTokenError') throw new Error('Invalid 2FA token');
    throw err;
  }
}

module.exports = {
  generateToken,
  generateImpersonationToken,
  verifyToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
  generateEmailVerificationToken,
  verifyEmailVerificationToken,
  generatePending2faToken,
  verifyPending2faToken,
};
