/**
 * Auth controller — register / login / logout / me.
 *
 * Email + password only in this first pass.
 *
 * TODO (dual-auth): /login and /register will branch on identifier type
 * (email vs phone) once phone-based auth is added. Schema is already
 * symmetric (email_verified / phone_verified columns both exist).
 *
 * TODO (google-oauth): a separate /api/auth/google flow will land alongside
 * either an auth_providers table or google_id columns on users. The /me
 * response is forward-compatible — clients just read user fields.
 */

const { query, getClient } = require('../../database/db');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../../utils/password');
const {
  generateToken,
  generatePending2faToken,
  verifyPending2faToken,
} = require('../../utils/jwt');
const { setAuthCookie, clearAuthCookie } = require('../../utils/authCookie');
const otp = require('../../services/auth/otp');
const notifier = require('../../services/notifications/notifier');
const { finalizeSignup } = require('../../services/auth/signup');
const { signupsEnabled } = require('../../services/platform/instanceSettings');
const legal = require('../../config/legal');
const { recordAudit } = require('../../services/platform/audit');

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ADMIN_USER_TYPE_ID = 1;
// Public self-serve signup creates end-user companies only. The platform
// company is seeded, not signed up.
const ALLOWED_SIGNUP_COMPANY_TYPES = ['end_user'];

function badRequest(res, message, details) {
  return res.status(400).json({ error: 'Bad Request', message, ...(details && { details }) });
}

function publicUser(row) {
  return {
    id:              row.id,
    email:           row.email,
    first_name:      row.first_name,
    last_name:       row.last_name,
    phone_number:    row.phone_number ?? null,
    user_type_id:    row.user_type_id,
    company_id:      row.company_id,
    company_type:    row.company_type,
    company_name:    row.company_name,
    // true when company_name is a signup-time placeholder (company field left
    // blank) — drives the in-app "name your workspace" prompt.
    name_auto_generated: row.name_auto_generated ?? false,
    email_verified:  row.email_verified,
    phone_verified:  row.phone_verified,
    two_factor_enabled: row.two_factor_enabled ?? false,
    two_factor_channel: row.two_factor_channel ?? null,
  };
}

/**
 * Mask a destination so we can hint at where the code went without
 * disclosing the full address. "alice@example.com" â†’ "a***@example.com";
 * "+15551234567" â†’ "•••••••4567".
 */
function maskDestination(channel, dest) {
  if (!dest) return null;
  if (channel === 'email') {
    const [user, domain] = String(dest).split('@');
    if (!domain) return dest;
    const head = user[0] ?? '';
    return `${head}${'•'.repeat(Math.max(1, user.length - 1))}@${domain}`;
  }
  if (channel === 'sms') {
    const s = String(dest);
    return `${'•'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
  }
  return dest;
}

/**
 * Pick the destination + channel for an OTP given a user row + requested
 * channel. Falls back to email when SMS is requested but no phone is on
 * file. Returns null if neither is available.
 */
function pickChannel(user, requestedChannel) {
  const chan = requestedChannel || user.two_factor_channel || 'email';
  if (chan === 'sms' && user.phone_number) {
    return { channel: 'sms', destination: user.phone_number };
  }
  if (user.email) {
    return { channel: 'email', destination: user.email };
  }
  return null;
}

function issueSession(res, userRow) {
  const token = generateToken({
    user_id:      userRow.id,
    company_id:   userRow.company_id,
    user_type_id: userRow.user_type_id,
    email:        userRow.email,
    company_type: userRow.company_type,
  });
  setAuthCookie(res, token);
  return token;
}

// â”€â”€ POST /api/auth/register â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
// Self-serve account creation for end-user companies. Creates the company
// AND the user as the first Admin of that company.
async function register(req, res, next) {
  try {
    const {
      firstName, lastName, email, password, companyName, companyType,
      terms_accepted,
    } = req.body || {};

    if (!firstName || !lastName || !email || !password || !companyType) {
      return badRequest(res, 'All fields are required');
    }
    if (!ALLOWED_SIGNUP_COMPANY_TYPES.includes(companyType)) {
      return badRequest(res, `companyType must be one of: ${ALLOWED_SIGNUP_COMPANY_TYPES.join(', ')}`);
    }
    // The company name is optional for end-user self-signup — a blank field
    // still gets a company (the tenant), just with a derived placeholder name
    // (see companyName resolution below).
    const trimmedCompanyName = String(companyName || '').trim();
    // Every signup must accept the Terms + Privacy Policy (one checkbox in
    // the UI; the server records both versions separately).
    if (terms_accepted !== true) {
      return badRequest(res, 'You must accept the Terms of Service and Privacy Policy');
    }
    const strength = validatePasswordStrength(password);
    if (!strength.isValid) return badRequest(res, 'Password does not meet requirements', strength.errors);

    // ── Signup toggle ─────────────────────────────────────────────────────
    // Private instances (the "own doors" deployment shape) close open
    // self-signup via platform_config signups.enabled / SIGNUPS_ENABLED.
    if (!(await signupsEnabled())) {
      return res.status(403).json({
        error:   'Forbidden',
        code:    'SIGNUPS_DISABLED',
        message: 'Self-service signup is disabled on this instance. Ask your administrator for an invite.',
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const existing = await query('SELECT 1 FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'Conflict', message: 'An account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);

    // Resolve the tenant's display name. A blank end-user signup still gets a
    // company; we just derive a friendly placeholder from the owner's first
    // name and flag it so the app can prompt them to name the workspace later.
    const firstTrim = String(firstName).trim();
    const nameAutoGenerated = !trimmedCompanyName;
    const resolvedCompanyName = trimmedCompanyName
      || (firstTrim ? `${firstTrim}'s workspace` : 'New workspace');

    const client = await getClient();
    let createdUser;
    try {
      await client.query('BEGIN');

      const { rows: [company] } = await client.query(
        `INSERT INTO companies (name, company_type, status, name_auto_generated)
         VALUES ($1, $2, 'active', $3::boolean)
         RETURNING id, name, company_type`,
        [resolvedCompanyName, companyType, nameAutoGenerated]
      );

      // Stamp legal acceptance with the versions the SERVER considers
      // current — never trust a client-supplied version string.
      const { rows: [user] } = await client.query(
        `INSERT INTO users (
           company_id, user_type_id, email, first_name, last_name,
           password_hash, status,
           terms_accepted_at, terms_version,
           privacy_accepted_at, privacy_version
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'active',
                 NOW(), $7,
                 NOW(), $8)
         RETURNING id, email, first_name, last_name, phone_number,
                   user_type_id, company_id,
                   email_verified, phone_verified`,
        [
          company.id, ADMIN_USER_TYPE_ID, normalizedEmail, firstName, lastName, passwordHash,
          legal.TERMS_VERSION,
          legal.PRIVACY_VERSION,
        ]
      );

      await client.query('COMMIT');

      createdUser = {
        ...user,
        company_type: company.company_type,
        company_name: company.name,
        name_auto_generated: nameAutoGenerated,
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // company.signed_up event — the shared completion path for every signup
    // flow (services/auth/signup.js).
    await finalizeSignup({
      companyId:   createdUser.company_id,
      companyType: createdUser.company_type,
      companyName: resolvedCompanyName,
      userId:      createdUser.id,
      email:       normalizedEmail,
      firstName,
      lastName,
    });
    issueSession(res, createdUser);
    return res.status(201).json({ user: publicUser(createdUser) });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/auth/login â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return badRequest(res, 'Email and password are required');

    const normalizedEmail = String(email).trim().toLowerCase();

    const { rows } = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone_number,
              u.user_type_id, u.company_id, u.password_hash, u.status,
              u.email_verified, u.phone_verified,
              u.two_factor_enabled, u.two_factor_channel,
              c.company_type, c.name AS company_name, c.name_auto_generated,
              c.status AS company_status,
              c.parent_company_id
         FROM users u
         JOIN companies c ON c.id = u.company_id
        WHERE u.email = $1 AND u.deleted_at IS NULL`,
      [normalizedEmail]
    );

    // Generic message — don't leak whether the email exists.
    const invalid = () => res.status(401).json({ error: 'Unauthorized', message: 'Invalid email or password' });
    if (rows.length === 0) return invalid();

    const user = rows[0];
    const ok = await comparePassword(password, user.password_hash);
    if (!ok) return invalid();

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Forbidden', message: 'This account is not active' });
    }
    if (user.company_status === 'suspended' || user.company_status === 'canceled') {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Company is ${user.company_status}`,
        code: `COMPANY_${user.company_status.toUpperCase()}`,
      });
    }

    // â”€â”€ 2FA branch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // If the user has a confirmed second factor, password alone doesn't
    // get them in. Issue a short-lived pending token + send a code, and
    // the client follows up with POST /verify-2fa.
    if (user.two_factor_enabled) {
      const picked = pickChannel(user, user.two_factor_channel);
      if (!picked) {
        // Pathological — 2FA is on but we have no email or phone.
        return res.status(500).json({
          error: 'Internal Server Error',
          message: '2FA is enabled but no delivery destination is on file',
        });
      }
      const { code } = await otp.issueCode({
        userId:      user.id,
        purpose:     'login_2fa',
        channel:     picked.channel,
        destination: picked.destination,
      });
      const delivery = await notifier.sendCode({
        channel:     picked.channel,
        destination: picked.destination,
        code,
        purpose:     'login_2fa',
      });
      const pendingToken = generatePending2faToken(user.id);
      return res.json({
        pending_2fa:        true,
        pending_token:      pendingToken,
        channel:            picked.channel,
        destination_hint:   maskDestination(picked.channel, picked.destination),
        delivery_method:    delivery.delivered, // 'email'|'sms'|'console'
      });
    }

    // No lifecycle event on login — per-login webhooks are too high-volume
    // relative to the signal they carry (see docs/integrations/webhooks.md).
    await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    issueSession(res, user);
    return res.json({ user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/auth/verify-2fa â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Body: { pending_token, code }. Completes the login that login() left in
// the "password ok, 2FA pending" state. On success: issues the real
// session cookie and returns { user }.
async function verify2fa(req, res, next) {
  try {
    const { pending_token, code } = req.body || {};
    if (!pending_token || !code) return badRequest(res, 'pending_token and code are required');

    let decoded;
    try { decoded = verifyPending2faToken(pending_token); }
    catch (err) { return res.status(401).json({ error: 'Unauthorized', message: err.message }); }

    const result = await otp.verifyCode({
      userId:  decoded.user_id,
      purpose: 'login_2fa',
      code:    String(code).trim(),
    });
    if (!result.ok) {
      const map = {
        invalid_code:      'That code is incorrect',
        expired:           'That code has expired — sign in again',
        no_code:           'No code is pending — sign in again',
        too_many_attempts: 'Too many incorrect codes — sign in again',
        missing_code:      'Code is required',
      };
      return res.status(401).json({ error: 'Unauthorized', message: map[result.reason] || 'Could not verify code', code: result.reason });
    }

    // Refresh the user row + issue the full session.
    const { rows } = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone_number,
              u.user_type_id, u.company_id,
              u.email_verified, u.phone_verified,
              u.two_factor_enabled, u.two_factor_channel,
              c.company_type, c.name AS company_name, c.name_auto_generated,
              c.status AS company_status,
              c.parent_company_id
         FROM users u
         JOIN companies c ON c.id = u.company_id
        WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [decoded.user_id]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Unauthorized', message: 'Account no longer exists' });
    const user = rows[0];

    await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
    issueSession(res, user);
    return res.json({ user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/auth/2fa/enable â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Body: { channel: 'email'|'sms' }. Auth-only. Sends a code to confirm
// the chosen channel; only on /2fa/confirm do we flip two_factor_enabled.
async function twoFactorEnable(req, res, next) {
  try {
    const { channel } = req.body || {};
    if (!['email', 'sms'].includes(channel)) {
      return badRequest(res, "channel must be 'email' or 'sms'");
    }
    const { rows } = await query(
      `SELECT id, email, phone_number FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.user_id]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Unauthorized' });
    const user = rows[0];

    if (channel === 'sms' && !user.phone_number) {
      return badRequest(res, 'Add a phone number to your profile before using SMS 2FA');
    }
    const destination = channel === 'sms' ? user.phone_number : user.email;

    const { code } = await otp.issueCode({
      userId:  user.id,
      purpose: channel === 'sms' ? 'verify_phone' : 'verify_email',
      channel,
      destination,
    });
    const delivery = await notifier.sendCode({ channel, destination, code, purpose: channel === 'sms' ? 'verify_phone' : 'verify_email' });

    return res.json({
      channel,
      destination_hint: maskDestination(channel, destination),
      delivery_method:  delivery.delivered,
    });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/auth/2fa/confirm â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Body: { channel, code }. Flips two_factor_enabled = true and remembers
// the channel for future logins.
async function twoFactorConfirm(req, res, next) {
  try {
    const { channel, code } = req.body || {};
    if (!['email', 'sms'].includes(channel)) {
      return badRequest(res, "channel must be 'email' or 'sms'");
    }
    if (!code) return badRequest(res, 'code is required');

    const purpose = channel === 'sms' ? 'verify_phone' : 'verify_email';
    const result = await otp.verifyCode({ userId: req.user.user_id, purpose, code: String(code).trim() });
    if (!result.ok) {
      return res.status(400).json({ error: 'Bad Request', message: 'Code did not match', code: result.reason });
    }

    // Also flip the channel's verified flag while we're here.
    const verifiedCol = channel === 'sms' ? 'phone_verified' : 'email_verified';
    const verifiedAtCol = channel === 'sms' ? 'phone_verified_at' : 'email_verified_at';
    await query(
      `UPDATE users
          SET two_factor_enabled = true,
              two_factor_channel = $1,
              ${verifiedCol} = true,
              ${verifiedAtCol} = NOW(),
              updated_at = NOW()
        WHERE id = $2`,
      [channel, req.user.user_id]
    );
    return res.json({ two_factor_enabled: true, two_factor_channel: channel });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/auth/2fa/disable â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function twoFactorDisable(req, res, next) {
  try {
    await query(
      `UPDATE users
          SET two_factor_enabled = false,
              two_factor_channel = NULL,
              updated_at = NOW()
        WHERE id = $1`,
      [req.user.user_id]
    );
    return res.json({ two_factor_enabled: false });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/auth/forgot-password â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Body: { identifier, channel? }. identifier may be an email address or a
// phone number. We always return 200 — leaking whether an account exists
// is a footgun. When the account exists, an OTP is issued and sent.
async function forgotPassword(req, res, next) {
  try {
    const { identifier, channel } = req.body || {};
    if (!identifier) return badRequest(res, 'identifier is required (email or phone)');

    const isEmail = String(identifier).includes('@');
    const normalized = isEmail ? String(identifier).trim().toLowerCase() : String(identifier).trim();

    // Decoy response — used when the account doesn't exist or has no
    // reachable channel. Same SHAPE as a real send so an enumeration
    // attacker can't tell valid from invalid by inspecting the response
    // keys, channel value, or delivery_method. destination_hint is a
    // masked version of whatever they submitted.
    const presumedChannel = (channel === 'sms' || channel === 'email')
      ? channel
      : (isEmail ? 'email' : 'sms');
    const decoy = {
      ok: true,
      channel:          presumedChannel,
      destination_hint: maskDestination(presumedChannel, normalized),
      delivery_method:  presumedChannel,
    };

    const { rows } = await query(
      isEmail
        ? `SELECT id, email, phone_number FROM users WHERE email = $1 AND deleted_at IS NULL`
        : `SELECT id, email, phone_number FROM users WHERE phone_number = $1 AND deleted_at IS NULL`,
      [normalized]
    );
    if (rows.length === 0) return res.json(decoy);

    const user = rows[0];
    const picked = pickChannel(user, channel || (isEmail ? 'email' : 'sms'));
    if (!picked) return res.json(decoy);

    const { code } = await otp.issueCode({
      userId:      user.id,
      purpose:     'password_reset',
      channel:     picked.channel,
      destination: picked.destination,
    });
    const delivery = await notifier.sendCode({
      channel:     picked.channel,
      destination: picked.destination,
      code,
      purpose:     'password_reset',
    });
    // In production, notifier always returns the channel name (provider is
    // configured). In dev the 'console' fallback can leak that the account
    // exists when the provider is unset — acceptable in dev, since dev
    // operators have shell access to the API anyway.
    return res.json({
      ok: true,
      channel:          picked.channel,
      destination_hint: maskDestination(picked.channel, picked.destination),
      delivery_method:  delivery.delivered,
    });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/auth/reset-password â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Body: { identifier, code, new_password }.
async function resetPassword(req, res, next) {
  try {
    const { identifier, code, new_password } = req.body || {};
    if (!identifier || !code || !new_password) {
      return badRequest(res, 'identifier, code, and new_password are required');
    }
    const strength = validatePasswordStrength(new_password);
    if (!strength.isValid) return badRequest(res, 'Password does not meet requirements', strength.errors);

    const isEmail = String(identifier).includes('@');
    const normalized = isEmail ? String(identifier).trim().toLowerCase() : String(identifier).trim();
    const { rows } = await query(
      isEmail
        ? `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL`
        : `SELECT id FROM users WHERE phone_number = $1 AND deleted_at IS NULL`,
      [normalized]
    );
    if (rows.length === 0) {
      // Same generic message as a code mismatch — no enumeration.
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid or expired code' });
    }
    const userId = rows[0].id;

    const result = await otp.verifyCode({ userId, purpose: 'password_reset', code: String(code).trim() });
    if (!result.ok) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid or expired code', code: result.reason });
    }

    const passwordHash = await hashPassword(new_password);
    await query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, userId]
    );
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/auth/logout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function logout(req, res) {
  clearAuthCookie(res);
  return res.json({ success: true });
}

// â”€â”€ GET /api/auth/me â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function me(req, res, next) {
  try {
    // When impersonating, the user's company_* fields should reflect the
    // IMPERSONATED workspace (so the UI renders "in" that tenant), while
    // the impersonation block carries the actor's home-company info for
    // the banner. When not impersonating, query is unchanged.
    const impersonating = !!req.impersonation;
    const tenantCompanyId = impersonating
      ? req.user.company_id  // JWT already points at the impersonated tenant
      : null;

    const { rows } = impersonating
      ? await query(
          `SELECT u.id, u.email, u.first_name, u.last_name, u.phone_number,
                  u.user_type_id, u.email_verified, u.phone_verified,
                  tenant.id           AS company_id,
                  tenant.company_type AS company_type,
                  tenant.name         AS company_name,
                  tenant.name_auto_generated AS name_auto_generated,
                  actor.id            AS impersonator_company_id,
                  actor.name          AS impersonator_company_name,
                  actor.company_type  AS impersonator_company_type
             FROM users u
             JOIN companies actor  ON actor.id  = u.company_id
             JOIN companies tenant ON tenant.id = $2
            WHERE u.id = $1 AND u.deleted_at IS NULL`,
          [req.user.user_id, tenantCompanyId]
        )
      : await query(
          `SELECT u.id, u.email, u.first_name, u.last_name, u.phone_number,
                  u.user_type_id, u.company_id, u.email_verified, u.phone_verified,
                  c.company_type, c.name AS company_name, c.name_auto_generated
             FROM users u
             JOIN companies c ON c.id = u.company_id
            WHERE u.id = $1 AND u.deleted_at IS NULL`,
          [req.user.user_id]
        );

    if (rows.length === 0) {
      clearAuthCookie(res);
      return res.status(401).json({ error: 'Unauthorized', message: 'User no longer exists' });
    }

    const userOut = publicUser(rows[0]);
    if (impersonating) {
      userOut.impersonation = {
        impersonator_company_id:   rows[0].impersonator_company_id,
        impersonator_company_name: rows[0].impersonator_company_name,
        impersonator_company_type: rows[0].impersonator_company_type,
        scope:                     req.impersonation.scope,
        started_at:                req.impersonation.started_at,
      };
    }
    return res.json({ user: userOut });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/auth/end-impersonation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Restore the actor's normal session by issuing a fresh non-impersonation
// JWT from their stored user row. Audit log records the end.
async function endImpersonation(req, res, next) {
  try {
    if (!req.impersonation) {
      return res.status(409).json({
        error:   'Conflict',
        message: 'You are not currently impersonating.',
      });
    }

    const impersonatedCompanyId = req.user.company_id;
    const { rows } = await query(
      `SELECT u.id, u.email, u.user_type_id, u.company_id,
              c.company_type
         FROM users u
         JOIN companies c ON c.id = u.company_id
        WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [req.impersonation.impersonator_user_id]
    );
    if (rows.length === 0) {
      clearAuthCookie(res);
      return res.status(401).json({ error: 'Unauthorized', message: 'Original user no longer exists' });
    }
    const u = rows[0];
    const token = generateToken({
      user_id:      u.id,
      company_id:   u.company_id,
      user_type_id: u.user_type_id,
      email:        u.email,
      company_type: u.company_type,
    });
    setAuthCookie(res, token);

    recordAudit(req, 'impersonation.end', {
      target_type: 'company',
      target_id:   impersonatedCompanyId,
    });

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  register, login, logout, me,
  verify2fa,
  twoFactorEnable, twoFactorConfirm, twoFactorDisable,
  forgotPassword, resetPassword,
  endImpersonation,
};
