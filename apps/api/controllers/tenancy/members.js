/**
 * Members controller — the login users of the signed-in company, and the
 * invites that add more of them.
 *
 * People (door-access credential holders) live in /api/people. This is the
 * other population: accounts that can sign in and manage the workspace.
 *
 * All routes are Admin-only and tenant-scoped by req.user.company_id. The
 * invitee-facing half (preview + accept, no session) is in
 * controllers/auth/invites.js.
 */

const invites = require('../../services/auth/invites');
const members = require('../../services/auth/members');
const { deliverInvite } = require('../../services/auth/inviteDelivery');
const { recordAudit } = require('../../services/platform/audit');
const { query } = require('../../database/db');

function sendInviteError(res, err) {
  if (err instanceof invites.InviteError || err instanceof members.MemberError) {
    return res.status(err.status).json({ error: err.code, code: err.code, message: err.message });
  }
  return null;
}

/** Email the invite link for the caller's own workspace (services/auth/inviteDelivery.js). */
async function deliver({ req, invite, token }) {
  const { rows: [row] } = await query(`SELECT name FROM companies WHERE id = $1`, [req.user.company_id]);
  return deliverInvite({
    invite, token,
    inviterUserId: req.user.user_id,
    companyName:   row?.name,
  });
}

// ── GET /api/workspace/members ────────────────────────────────────────────────
async function list(req, res, next) {
  try {
    const result = await invites.listMembers(req.user.company_id);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/workspace/invites ───────────────────────────────────────────────
// Body: { email, first_name?, last_name?, role? ('admin' | 'user', default admin) }
//
// The response includes accept_url so the inviting Admin can hand the link
// over directly (and so dev instances without an email provider still work).
// Only the inviter ever sees it; the stored row holds a hash.
async function create(req, res, next) {
  try {
    const { email, first_name, last_name, role } = req.body || {};
    const { invite, token } = await invites.createInvite({
      companyId: req.user.company_id,
      invitedBy: req.user.user_id,
      email,
      firstName: first_name,
      lastName:  last_name,
      role,
    });

    const { acceptUrl, delivery, deliveryError } = await deliver({ req, invite, token });

    recordAudit(req, 'user.invited', {
      target_type: 'user_invite',
      target_id:   invite.id,
      metadata:    { email: invite.email, role: invite.role, delivery },
    });

    return res.status(201).json({
      invite,
      accept_url: acceptUrl,
      delivery,
      ...(deliveryError && { delivery_error: deliveryError }),
    });
  } catch (err) {
    if (sendInviteError(res, err)) return undefined;
    return next(err);
  }
}

// ── POST /api/workspace/invites/:id/resend ────────────────────────────────────
async function resend(req, res, next) {
  try {
    const inviteId = Number(req.params.id);
    if (!Number.isInteger(inviteId)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid invite id' });
    }
    const { invite, token } = await invites.resendInvite({
      companyId: req.user.company_id,
      inviteId,
    });
    const { acceptUrl, delivery, deliveryError } = await deliver({ req, invite, token });

    recordAudit(req, 'user.invite_resent', {
      target_type: 'user_invite',
      target_id:   invite.id,
      metadata:    { email: invite.email, delivery },
    });

    return res.json({
      invite,
      accept_url: acceptUrl,
      delivery,
      ...(deliveryError && { delivery_error: deliveryError }),
    });
  } catch (err) {
    if (sendInviteError(res, err)) return undefined;
    return next(err);
  }
}

// ── DELETE /api/workspace/invites/:id ─────────────────────────────────────────
async function revoke(req, res, next) {
  try {
    const inviteId = Number(req.params.id);
    if (!Number.isInteger(inviteId)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid invite id' });
    }
    const invite = await invites.revokeInvite({ companyId: req.user.company_id, inviteId });

    recordAudit(req, 'user.invite_revoked', {
      target_type: 'user_invite',
      target_id:   invite.id,
      metadata:    { email: invite.email },
    });

    return res.json({ invite });
  } catch (err) {
    if (sendInviteError(res, err)) return undefined;
    return next(err);
  }
}

// ── PATCH /api/workspace/members/:id ──────────────────────────────────────────
// Body: { role?: 'admin' | 'user', status?: 'active' | 'inactive' }
//
// Guards (services/auth/members.js): not yourself, not the last active admin.
// A deactivated user's live session ends on their next request.
async function update(req, res, next) {
  try {
    const { role, status } = req.body || {};
    const { member, changes } = await members.updateMember({
      companyId:   req.user.company_id,
      actorUserId: req.user.user_id,
      userId:      req.params.id,
      role,
      status,
    });

    if (changes.role) {
      recordAudit(req, 'user.role_changed', {
        target_type: 'user', target_id: member.id,
        metadata: { email: member.email, from: changes.role.from, to: changes.role.to },
      });
    }
    if (changes.status) {
      recordAudit(req, changes.status.to === 'active' ? 'user.reactivated' : 'user.deactivated', {
        target_type: 'user', target_id: member.id,
        metadata: { email: member.email, from: changes.status.from, to: changes.status.to },
      });
    }

    return res.json({ member });
  } catch (err) {
    if (sendInviteError(res, err)) return undefined;
    return next(err);
  }
}

// ── DELETE /api/workspace/members/:id ─────────────────────────────────────────
// Soft delete. The address can be invited again afterwards (migration 093).
async function remove(req, res, next) {
  try {
    const member = await members.removeMember({
      companyId:   req.user.company_id,
      actorUserId: req.user.user_id,
      userId:      req.params.id,
    });
    recordAudit(req, 'user.removed', {
      target_type: 'user', target_id: member.id,
      metadata: { email: member.email, role: member.role },
    });
    return res.status(204).end();
  } catch (err) {
    if (sendInviteError(res, err)) return undefined;
    return next(err);
  }
}

module.exports = { list, create, resend, revoke, update, remove };
