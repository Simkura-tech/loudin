'use strict';

/**
 * Invite delivery — turn a freshly created/rotated invite into an email.
 *
 * Shared by the workspace members controller (an Admin inviting a colleague)
 * and the platform companies controller (provisioning a company and inviting
 * its first Admin). Best-effort: a delivery failure never fails the request;
 * the caller gets `delivery: 'console'` plus the accept URL to hand over.
 */

const notifier  = require('../notifications/notifier');
const templates = require('../notifications/emailTemplates');
const { query } = require('../../database/db');

function frontendUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:8081').replace(/\/+$/, '');
}

function acceptUrlFor(token) {
  return `${frontendUrl()}/invite/${token}`;
}

/** "First Last" of the inviting user, or null. */
async function inviterName(userId) {
  if (!userId) return null;
  const { rows: [row] } = await query(
    `SELECT first_name, last_name FROM users WHERE id = $1`, [userId]
  );
  return row ? `${row.first_name} ${row.last_name}`.trim() : null;
}

/**
 * @param {object} p
 * @param {object} p.invite       publicInvite() shape (email, expires_at)
 * @param {string} p.token        raw token (never stored)
 * @param {number} p.inviterUserId
 * @param {string} p.companyName  the workspace the invitee is joining
 */
async function deliverInvite({ invite, token, inviterUserId, companyName }) {
  const acceptUrl = acceptUrlFor(token);
  const payload = templates.inviteEmail({
    inviterName: await inviterName(inviterUserId),
    companyName: companyName || 'your workspace',
    acceptUrl,
    expiresAt: invite.expires_at,
  });
  const result = await notifier.sendEmail({
    to: invite.email,
    payload,
    preheaderForDevLog: `invite link: ${acceptUrl}`,
  });
  return { acceptUrl, delivery: result.delivered, deliveryError: result.error };
}

module.exports = { deliverInvite, acceptUrlFor };
