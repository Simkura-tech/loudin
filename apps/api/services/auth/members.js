/**
 * Members service — manage the login users of one company.
 *
 * Invites (adding users) and the members listing live in
 * services/auth/invites.js. This file is the other half: what an Admin can
 * do to a user who already exists.
 *
 *   updateMember()  — change role (admin ↔ user) and/or status
 *                     (active ↔ inactive). Inactive users can't sign in and
 *                     any live session is cut on its next request
 *                     (middleware/core/auth.js re-checks the row).
 *   removeMember()  — soft delete (users.deleted_at). The email becomes
 *                     available again (migration 093).
 *
 * Guards, in order:
 *   - the target must be a live user of the caller's company → 404
 *   - the caller can't target themselves → 400 SELF_TARGET (demoting or
 *     deactivating yourself is how a workspace loses its admin)
 *   - the last active admin can't be demoted, deactivated or removed
 *     → 409 LAST_ADMIN (defence in depth: because the caller is always an
 *     active admin and never the target, this only trips on a race)
 */

const { query, getClient } = require('../../database/db');

const ROLE_TO_USER_TYPE = { admin: 1, user: 2 };
const USER_TYPE_TO_ROLE = { 1: 'admin', 2: 'user' };
const ADMIN_TYPE = 1;

/** Statuses an Admin may set. 'suspended' / 'pending' are system-owned. */
const SETTABLE_STATUSES = new Set(['active', 'inactive']);

class MemberError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function publicMember(row) {
  return {
    id:            row.id,
    email:         row.email,
    first_name:    row.first_name,
    last_name:     row.last_name,
    user_type_id:  row.user_type_id,
    role:          USER_TYPE_TO_ROLE[row.user_type_id] || 'user',
    status:        row.status,
    last_login_at: row.last_login_at,
    created_at:    row.created_at,
  };
}

function parseId(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new MemberError(400, 'INVALID_ID', 'A valid user id is required');
  }
  return id;
}

/** Lock and return the target row, or throw 404. Runs inside the caller's transaction. */
async function lockTarget(client, companyId, userId) {
  const { rows: [row] } = await client.query(
    `SELECT id, email, first_name, last_name, user_type_id, status, last_login_at, created_at
       FROM users
      WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
      FOR UPDATE`,
    [userId, companyId]
  );
  if (!row) throw new MemberError(404, 'MEMBER_NOT_FOUND', 'User not found in this workspace');
  return row;
}

/** Throw unless at least one OTHER active admin would remain in the company. */
async function assertAnotherAdmin(client, companyId, excludingUserId) {
  const { rows: [{ n }] } = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM users
      WHERE company_id = $1 AND id <> $2
        AND user_type_id = $3 AND status = 'active' AND deleted_at IS NULL`,
    [companyId, excludingUserId, ADMIN_TYPE]
  );
  if (n === 0) {
    throw new MemberError(409, 'LAST_ADMIN',
      'This is the last active admin of the workspace. Make someone else an admin first.');
  }
}

function isActiveAdmin(row) {
  return row.user_type_id === ADMIN_TYPE && row.status === 'active';
}

/**
 * @param {object} p
 * @param {number} p.companyId    caller's company (req.user.company_id)
 * @param {number} p.actorUserId  caller (req.user.user_id)
 * @param {number|string} p.userId  target
 * @param {'admin'|'user'} [p.role]
 * @param {'active'|'inactive'} [p.status]
 * @returns {{ member: object, changes: { role?: {from,to}, status?: {from,to} } }}
 */
async function updateMember({ companyId, actorUserId, userId, role, status }) {
  const id = parseId(userId);

  if (role !== undefined && !ROLE_TO_USER_TYPE[role]) {
    throw new MemberError(400, 'INVALID_ROLE', `role must be one of: ${Object.keys(ROLE_TO_USER_TYPE).join(', ')}`);
  }
  if (status !== undefined && !SETTABLE_STATUSES.has(status)) {
    throw new MemberError(400, 'INVALID_STATUS', `status must be one of: ${[...SETTABLE_STATUSES].join(', ')}`);
  }
  if (role === undefined && status === undefined) {
    throw new MemberError(400, 'NOTHING_TO_UPDATE', 'Provide a role and/or a status to change');
  }
  if (id === actorUserId) {
    throw new MemberError(400, 'SELF_TARGET', "You can't change your own role or status");
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const row = await lockTarget(client, companyId, id);

    const nextType   = role   !== undefined ? ROLE_TO_USER_TYPE[role] : row.user_type_id;
    const nextStatus = status !== undefined ? status : row.status;

    const changes = {};
    if (nextType !== row.user_type_id) {
      changes.role = { from: USER_TYPE_TO_ROLE[row.user_type_id], to: role };
    }
    if (nextStatus !== row.status) {
      changes.status = { from: row.status, to: nextStatus };
    }
    if (Object.keys(changes).length === 0) {
      await client.query('ROLLBACK');
      return { member: publicMember(row), changes };
    }

    // Losing an active admin (demotion or deactivation) needs another one left.
    const losesAdmin = isActiveAdmin(row) && !(nextType === ADMIN_TYPE && nextStatus === 'active');
    if (losesAdmin) await assertAnotherAdmin(client, companyId, id);

    const { rows: [updated] } = await client.query(
      `UPDATE users
          SET user_type_id = $1, status = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id, email, first_name, last_name, user_type_id, status, last_login_at, created_at`,
      [nextType, nextStatus, id]
    );
    await client.query('COMMIT');
    return { member: publicMember(updated), changes };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Soft-delete a user. Their open sessions end on the next request.
 * @returns {object} the removed member (as it was)
 */
async function removeMember({ companyId, actorUserId, userId }) {
  const id = parseId(userId);
  if (id === actorUserId) {
    throw new MemberError(400, 'SELF_TARGET', "You can't remove yourself from the workspace");
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const row = await lockTarget(client, companyId, id);
    if (isActiveAdmin(row)) await assertAnotherAdmin(client, companyId, id);

    await client.query(
      `UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );
    // Any invite the removed user sent stays valid; invited_by is informational.
    await client.query('COMMIT');
    return publicMember(row);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Per-request liveness check used by middleware/core/auth.js: is this user
 * still allowed in, and what is their role right now? Returns null when the
 * account is gone or not active.
 */
async function liveUser(userId) {
  const { rows: [row] } = await query(
    `SELECT user_type_id, status FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  if (!row || row.status !== 'active') return null;
  return row;
}

module.exports = { MemberError, updateMember, removeMember, liveUser, publicMember };
