/**
 * Invite acceptance — the invitee's half of the user-invite flow.
 *
 * No session on either endpoint: the URL token IS the credential. Both sit
 * behind the same rate limiter as login/register (routes/client/auth.js).
 *
 *   GET  /api/auth/invites/:token         — preview (who invited you, to what)
 *   POST /api/auth/invites/:token/accept  — set name + password, get a session
 *
 * The Admin-facing half (create / resend / revoke / list) is in
 * controllers/tenancy/members.js.
 */

const invites = require('../../services/auth/invites');
const { validatePasswordStrength } = require('../../utils/password');
const { generateToken } = require('../../utils/jwt');
const { setAuthCookie } = require('../../utils/authCookie');
const { recordAudit } = require('../../services/platform/audit');

function sendInviteError(res, err) {
  if (err instanceof invites.InviteError) {
    return res.status(err.status).json({ error: err.code, code: err.code, message: err.message });
  }
  return null;
}

function publicUser(row) {
  return {
    id:                  row.id,
    email:               row.email,
    first_name:          row.first_name,
    last_name:           row.last_name,
    phone_number:        row.phone_number ?? null,
    user_type_id:        row.user_type_id,
    company_id:          row.company_id,
    company_type:        row.company_type,
    company_name:        row.company_name,
    name_auto_generated: false,
    email_verified:      row.email_verified ?? false,
    phone_verified:      row.phone_verified ?? false,
    two_factor_enabled:  false,
    two_factor_channel:  null,
  };
}

// ── GET /api/auth/invites/:token ──────────────────────────────────────────────
async function preview(req, res, next) {
  try {
    const row = await invites.lookupByToken(req.params.token);
    return res.json({ invite: invites.previewOf(row) });
  } catch (err) {
    if (sendInviteError(res, err)) return undefined;
    return next(err);
  }
}

// ── POST /api/auth/invites/:token/accept ──────────────────────────────────────
// Body: { first_name, last_name, password, terms_accepted: true }
async function accept(req, res, next) {
  try {
    const { first_name, last_name, password, terms_accepted } = req.body || {};
    if (!password) {
      return res.status(400).json({ error: 'Bad Request', message: 'Password is required' });
    }
    const strength = validatePasswordStrength(password);
    if (!strength.isValid) {
      return res.status(400).json({
        error: 'Bad Request', message: 'Password does not meet requirements', details: strength.errors,
      });
    }

    const { user, invite } = await invites.acceptInvite({
      token:         req.params.token,
      firstName:     first_name,
      lastName:      last_name,
      password,
      termsAccepted: terms_accepted,
    });

    // Audit as the new user (there is no req.user on this public route).
    recordAudit(
      { ...req, user: { user_id: user.id, company_id: user.company_id } },
      'user.invite_accepted',
      { target_type: 'user_invite', target_id: invite.id, metadata: { email: user.email } }
    );

    const token = generateToken({
      user_id:      user.id,
      company_id:   user.company_id,
      user_type_id: user.user_type_id,
      email:        user.email,
      company_type: user.company_type,
    });
    setAuthCookie(res, token);
    return res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    if (sendInviteError(res, err)) return undefined;
    return next(err);
  }
}

module.exports = { preview, accept };
