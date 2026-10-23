'use strict';

/**
 * User invites — add a login user to an EXISTING company.
 *
 * The data model always allowed many users per company, but every creation
 * path (register, Google, create-admin) made a new company alongside the
 * user. This service is the missing "add a user to my workspace" path:
 *
 *   createInvite()  — Admin posts email + role; we store a hashed single-use
 *                     token and return the raw token ONCE so the caller can
 *                     build the accept URL (email + copy-link).
 *   lookupByToken() — public preview for the /invite/:token page.
 *   acceptInvite()  — creates the users row, consumes the invite. Runs in
 *                     one transaction so a crash can't leave a consumed
 *                     invite without a user (or vice versa).
 *   resendInvite()  — rotates the token + expiry (the old link stops working).
 *   revokeInvite()  — closes an open invite.
 *   listMembers()   — users + open invites for the admin UI.
 *
 * Tokens: 32 random bytes, base64url in the URL; only SHA-256(token) is
 * stored. Not bcrypt — the token already has 256 bits of entropy, so a fast
 * hash is fine and keeps lookups indexable.
 */

const crypto = require('crypto');
const { query, getClient } = require('../../database/db');
const { hashPassword } = require('../../utils/password');
const legal = require('../../config/legal');

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ROLE_TO_USER_TYPE = { admin: 1, user: 2 };
const USER_TYPE_TO_ROLE = { 1: 'admin', 2: 'user' };

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
function isPlausibleEmail(email) {
  // Deliberately loose — the authoritative check is whether the invite
  // email arrives. Just reject things that cannot be an address.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255;
}
function inviteState(row) {
  if (row.accepted_at) return 'accepted';
  if (row.revoked_at)  return 'revoked';
  if (new Date(row.expires_at).getTime() <= Date.now()) return 'expired';
  return 'pending';
}

/** Shape an invite row for API responses (never includes the token hash). */
function publicInvite(row) {
  return {
    id:           row.id,
    email:        row.email,
    first_name:   row.first_name,
    last_name:    row.last_name,
    role:         USER_TYPE_TO_ROLE[row.user_type_id] || 'admin',
    user_type_id: row.user_type_id,
    state:        inviteState(row),
    invited_by:   row.invited_by_name ?? null,
    expires_at:   row.expires_at,
    created_at:   row.created_at,
  };
}

class InviteError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ── Admin side ───────────────────────────────────────────────────────────────

/**
 * @returns {{ invite: object, token: string }} token is returned ONCE.
 */
async function createInvite({ companyId, invitedBy, email, firstName, lastName, role }) {
  const normalized = normalizeEmail(email);
  if (!isPlausibleEmail(normalized)) {
    throw new InviteError(400, 'INVALID_EMAIL', 'A valid email address is required');
  }
  const userTypeId = ROLE_TO_USER_TYPE[role || 'admin'];
  if (!userTypeId) {
    throw new InviteError(400, 'INVALID_ROLE', `role must be one of: ${Object.keys(ROLE_TO_USER_TYPE).join(', ')}`);
  }

  // users.email is globally unique — an existing account anywhere means the
  // address cannot become a second user here.
  const existing = await query(
    'SELECT 1 FROM users WHERE email = $1 AND deleted_at IS NULL', [normalized]
  );
  if (existing.rowCount > 0) {
    throw new InviteError(409, 'EMAIL_IN_USE', 'An account with this email already exists');
  }

  const token = newToken();
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Supersede any older open invite for this address in this company.
    await client.query(
      `UPDATE user_invites
          SET revoked_at = NOW(), updated_at = NOW()
        WHERE company_id = $1 AND lower(email) = $2
          AND accepted_at IS NULL AND revoked_at IS NULL`,
      [companyId, normalized]
    );
    const { rows: [row] } = await client.query(
      `INSERT INTO user_invites
         (company_id, email, first_name, last_name, user_type_id, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        companyId, normalized,
        String(firstName || '').trim() || null,
        String(lastName  || '').trim() || null,
        userTypeId, hashToken(token), invitedBy,
        new Date(Date.now() + INVITE_TTL_MS),
      ]
    );
    await client.query('COMMIT');
    return { invite: publicInvite(row), token };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Rotate the token + expiry of an open-or-expired invite. Returns the new raw token. */
async function resendInvite({ companyId, inviteId }) {
  const { rows: [row] } = await query(
    `SELECT * FROM user_invites WHERE id = $1 AND company_id = $2`, [inviteId, companyId]
  );
  if (!row) throw new InviteError(404, 'NOT_FOUND', 'Invite not found');
  if (row.accepted_at) throw new InviteError(409, 'ALREADY_ACCEPTED', 'This invite has already been accepted');
  if (row.revoked_at)  throw new InviteError(409, 'REVOKED', 'This invite was revoked — send a new one instead');

  const token = newToken();
  const { rows: [updated] } = await query(
    `UPDATE user_invites
        SET token_hash = $1, expires_at = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *`,
    [hashToken(token), new Date(Date.now() + INVITE_TTL_MS), row.id]
  );
  return { invite: publicInvite(updated), token };
}

async function revokeInvite({ companyId, inviteId }) {
  const { rows: [row] } = await query(
    `SELECT * FROM user_invites WHERE id = $1 AND company_id = $2`, [inviteId, companyId]
  );
  if (!row) throw new InviteError(404, 'NOT_FOUND', 'Invite not found');
  if (row.accepted_at) throw new InviteError(409, 'ALREADY_ACCEPTED', 'This invite has already been accepted');
  if (row.revoked_at) return publicInvite(row); // idempotent
  const { rows: [updated] } = await query(
    `UPDATE user_invites SET revoked_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
    [row.id]
  );
  return publicInvite(updated);
}

/** Users + open (incl. expired-but-not-closed) invites for one company. */
async function listMembers(companyId) {
  const [users, invites] = await Promise.all([
    query(
      `SELECT id, email, first_name, last_name, user_type_id, status,
              last_login_at, created_at
         FROM users
        WHERE company_id = $1 AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [companyId]
    ),
    query(
      `SELECT i.*, NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS invited_by_name
         FROM user_invites i
         LEFT JOIN users u ON u.id = i.invited_by
        WHERE i.company_id = $1
          AND i.accepted_at IS NULL AND i.revoked_at IS NULL
        ORDER BY i.created_at DESC`,
      [companyId]
    ),
  ]);
  return {
    users:   users.rows.map((u) => ({ ...u, role: USER_TYPE_TO_ROLE[u.user_type_id] || 'user' })),
    invites: invites.rows.map(publicInvite),
  };
}

// ── Invitee side ─────────────────────────────────────────────────────────────

/**
 * Resolve a raw URL token to its invite + company. Throws InviteError with a
 * state-specific code so the public page can explain what happened.
 */
async function lookupByToken(token) {
  if (!token || typeof token !== 'string' || token.length > 128) {
    throw new InviteError(404, 'INVITE_NOT_FOUND', 'This invite link is not valid');
  }
  const { rows: [row] } = await query(
    `SELECT i.*, c.name AS company_name, c.status AS company_status,
            c.company_type,
            NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') AS invited_by_name
       FROM user_invites i
       JOIN companies c ON c.id = i.company_id
       LEFT JOIN users u ON u.id = i.invited_by
      WHERE i.token_hash = $1`,
    [hashToken(token)]
  );
  if (!row) throw new InviteError(404, 'INVITE_NOT_FOUND', 'This invite link is not valid');

  const state = inviteState(row);
  if (state === 'accepted') throw new InviteError(410, 'INVITE_ACCEPTED', 'This invite has already been used — sign in instead');
  if (state === 'revoked')  throw new InviteError(410, 'INVITE_REVOKED',  'This invite was withdrawn. Ask your administrator for a new one');
  if (state === 'expired')  throw new InviteError(410, 'INVITE_EXPIRED',  'This invite has expired. Ask your administrator to resend it');
  if (row.company_status === 'suspended' || row.company_status === 'canceled') {
    throw new InviteError(403, 'COMPANY_INACTIVE', `This workspace is ${row.company_status}`);
  }
  return row;
}

/**
 * Create the user and consume the invite. Returns the new user row shaped
 * like the login path expects (company_type / company_name included) so the
 * controller can issueSession() on it.
 */
async function acceptInvite({ token, firstName, lastName, password, termsAccepted }) {
  const invite = await lookupByToken(token);

  const first = String(firstName ?? invite.first_name ?? '').trim();
  const last  = String(lastName  ?? invite.last_name  ?? '').trim();
  if (!first || !last) throw new InviteError(400, 'NAME_REQUIRED', 'First and last name are required');
  if (termsAccepted !== true) {
    throw new InviteError(400, 'TERMS_REQUIRED', 'You must accept the Terms of Service and Privacy Policy');
  }

  const passwordHash = await hashPassword(password);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Re-check under the transaction: someone may have registered this
    // address since the preview, and users.email is UNIQUE.
    const dup = await client.query(
      'SELECT 1 FROM users WHERE email = $1 AND deleted_at IS NULL', [invite.email]
    );
    if (dup.rowCount > 0) {
      throw new InviteError(409, 'EMAIL_IN_USE', 'An account with this email already exists — sign in instead');
    }

    // Lock + re-verify the invite row so two concurrent accepts cannot both win.
    const { rows: [fresh] } = await client.query(
      `SELECT accepted_at, revoked_at, expires_at FROM user_invites WHERE id = $1 FOR UPDATE`,
      [invite.id]
    );
    if (!fresh || inviteState(fresh) !== 'pending') {
      throw new InviteError(410, 'INVITE_NOT_OPEN', 'This invite is no longer open');
    }

    const { rows: [user] } = await client.query(
      `INSERT INTO users (
         company_id, user_type_id, email, first_name, last_name,
         password_hash, status,
         terms_accepted_at, terms_version,
         privacy_accepted_at, privacy_version
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), $7, NOW(), $8)
       RETURNING id, email, first_name, last_name, phone_number,
                 user_type_id, company_id, email_verified, phone_verified`,
      [
        invite.company_id, invite.user_type_id, invite.email, first, last, passwordHash,
        legal.TERMS_VERSION, legal.PRIVACY_VERSION,
      ]
    );

    await client.query(
      `UPDATE user_invites
          SET accepted_at = NOW(), accepted_user_id = $1, updated_at = NOW()
        WHERE id = $2`,
      [user.id, invite.id]
    );

    await client.query('COMMIT');
    return {
      user: {
        ...user,
        company_type: invite.company_type,
        company_name: invite.company_name,
        name_auto_generated: false,
      },
      invite,
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Public preview payload for the accept page. */
function previewOf(row) {
  return {
    email:        row.email,
    first_name:   row.first_name,
    last_name:    row.last_name,
    role:         USER_TYPE_TO_ROLE[row.user_type_id] || 'admin',
    company_name: row.company_name,
    invited_by:   row.invited_by_name ?? null,
    expires_at:   row.expires_at,
  };
}

module.exports = {
  INVITE_TTL_MS,
  InviteError,
  createInvite,
  resendInvite,
  revokeInvite,
  listMembers,
  lookupByToken,
  acceptInvite,
  previewOf,
};
