'use strict';

/**
 * Google OAuth controller.
 *
 * GET /api/auth/google          — redirect to Google
 * GET /api/auth/google/callback — handle return, find/create user, set session
 *
 * User lookup order on callback:
 *   1. Match on google_id (returning Google user)
 *   2. Match on email (existing password user — link their account)
 *   3. Create new company + user (self-service signup)
 */

const crypto  = require('crypto');
const { query, getClient } = require('../../database/db');
const google = require('../../integrations/google');
const { generateToken } = require('../../utils/jwt');
const { setAuthCookie } = require('../../utils/authCookie');
const { finalizeSignup } = require('../../services/auth/signup');
const { signupsEnabled } = require('../../services/platform/instanceSettings');
const legal = require('../../config/legal');

const ADMIN_USER_TYPE_ID = 1;
const STATE_COOKIE       = 'oauth_state';
const STATE_MAX_AGE_MS   = 5 * 60 * 1000; // 5 minutes

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:8081';
}

function redirectError(res, message) {
  return res.redirect(`${frontendUrl()}/login?error=${encodeURIComponent(message)}`);
}

/** Derive a human-readable company name from an email domain. */
function companyNameFromEmail(email) {
  const domain = (email.split('@')[1] || '').split('.')[0];
  if (!domain) return 'My Company';
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

// ── GET /api/auth/google ───────────────────────────────────────────────────

async function redirectToGoogle(req, res) {
  if (!google.isConfigured()) {
    return redirectError(res, 'Google sign-in is not configured');
  }

  const state = crypto.randomBytes(32).toString('hex');

  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   STATE_MAX_AGE_MS,
  });

  return res.redirect(google.getAuthUrl(state));
}

// ── GET /api/auth/google/callback ──────────────────────────────────────────

async function handleCallback(req, res, next) {
  try {
    const { code, state, error: oauthError } = req.query;

    // Google sends error= when the user denies access.
    if (oauthError) {
      return redirectError(res, 'Google sign-in was cancelled');
    }

    // Verify CSRF state.
    const savedState = req.cookies?.[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE);

    if (!savedState || savedState !== state) {
      return redirectError(res, 'Invalid OAuth state — please try again');
    }

    if (!code) {
      return redirectError(res, 'No authorization code received from Google');
    }

    // Exchange code for Google profile.
    let profile;
    try {
      profile = await google.exchangeCode(code);
    } catch (err) {
      console.error('[google-auth] code exchange failed:', err.message);
      return redirectError(res, 'Google sign-in failed — please try again');
    }

    const { googleId, emailVerified, firstName, lastName } = profile;
    // Normalize to match how register() stores emails (auth.js) so the
    // lookups below can't miss on case/whitespace and fall through to
    // creating a duplicate account.
    const email = String(profile.email || '').trim().toLowerCase();

    // ── 1. Look up by google_id ──────────────────────────────────────────
    const byGoogleId = await query(
      `SELECT u.id, u.company_id, u.user_type_id, u.email,
              c.company_type
         FROM users u
         JOIN companies c ON c.id = u.company_id
        WHERE u.google_id = $1
          AND u.deleted_at IS NULL
          AND c.status = 'active'
        LIMIT 1`,
      [googleId],
    );

    if (byGoogleId.rows[0]) {
      return issueSession(res, byGoogleId.rows[0]);
    }

    // ── 2. Look up by email — link existing account ──────────────────────
    // Only bridge to an existing password account when Google has VERIFIED
    // the address. An unverified email in the ID token is attacker-controlled
    // (they can create a Google account claiming someone else's address), so
    // trusting it here would allow taking over that person's existing account.
    const byEmail = emailVerified
      ? await query(
          `SELECT u.id, u.company_id, u.user_type_id, u.email,
                  c.company_type
             FROM users u
             JOIN companies c ON c.id = u.company_id
            WHERE u.email = $1
              AND u.deleted_at IS NULL
              AND c.status = 'active'
            LIMIT 1`,
          [email],
        )
      : { rows: [] };

    if (byEmail.rows[0]) {
      await query(
        `UPDATE users SET google_id = $1, email_verified = true, updated_at = NOW()
          WHERE id = $2`,
        [googleId, byEmail.rows[0].id],
      );
      return issueSession(res, byEmail.rows[0]);
    }

    // ── 3. New user — create company + user ──────────────────────────────
    // Existing users signed in above; from here down Google is CREATING an
    // account, which is open self-signup — denied when the instance has
    // signups disabled (platform_config signups.enabled / SIGNUPS_ENABLED).
    if (!(await signupsEnabled())) {
      return redirectError(res, 'Signups are disabled on this instance — ask your administrator for an invite');
    }

    const client = await getClient();
    let newUser;
    try {
      await client.query('BEGIN');

      // Google never collects a company name, so the derived domain name is
      // always a placeholder — flag it like a blank email/password signup.
      const companyRes = await client.query(
        `INSERT INTO companies (name, company_type, company_email, status, name_auto_generated)
         VALUES ($1, 'end_user', $2, 'active', true)
         RETURNING id`,
        [companyNameFromEmail(email), email],
      );
      const companyId = companyRes.rows[0].id;

      // Legal acceptance: the login page states that continuing with Google
      // means agreeing to the Terms + Privacy Policy, so stamp the versions
      // the SERVER considers current — same rule as register().
      const userRes = await client.query(
        `INSERT INTO users
           (company_id, user_type_id, email, first_name, last_name,
            google_id, email_verified, password_hash,
            terms_accepted_at, terms_version,
            privacy_accepted_at, privacy_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL,
                 NOW(), $8,
                 NOW(), $9)
         RETURNING id, company_id, user_type_id, email, first_name, last_name`,
        [companyId, ADMIN_USER_TYPE_ID, email,
         firstName || email.split('@')[0],
         lastName  || '',
         googleId,
         emailVerified,
         legal.TERMS_VERSION,
         legal.PRIVACY_VERSION],
      );
      newUser = { ...userRes.rows[0], company_type: 'end_user' };

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[google-auth] user creation failed:', err.message);
      return redirectError(res, 'Could not create your account — please try again');
    } finally {
      client.release();
    }

    // Same completion path as every other signup flow.
    await finalizeSignup({
      companyId:   newUser.company_id,
      companyType: 'end_user',
      companyName: companyNameFromEmail(email),
      userId:      newUser.id,
      email,
      firstName:   newUser.first_name,
      lastName:    newUser.last_name,
    });

    return issueSession(res, newUser);
  } catch (err) {
    return next(err);
  }
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
  return res.redirect(`${frontendUrl()}/app`);
}

module.exports = { redirectToGoogle, handleCallback };
