'use strict';

/**
 * Company provisioning — create a company and invite its first Admin in one
 * step, for someone acting on the new company's behalf.
 *
 * Two callers:
 *   - the platform admin   (POST /api/companies — end_user or installer)
 *   - an installer admin   (POST /api/installer/customers — end_user only,
 *                           followed by a grant to the installer)
 *
 * Self-signup (register / Google) is a different path: there the signing-up
 * user *is* the first admin and no invite is needed.
 *
 * Validation errors throw ProvisionError({ status, code }); the invite
 * module's InviteError may also surface and carries the same shape.
 */

const { query } = require('../../database/db');
const invites = require('../auth/invites');
const { deliverInvite } = require('../auth/inviteDelivery');

// Types anyone may provision. The platform company is seeded, never created.
const CREATABLE_TYPES = ['end_user', 'installer'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class ProvisionError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** True for errors the controller should turn into a JSON 4xx. */
function isProvisionError(err) {
  return err instanceof ProvisionError || err instanceof invites.InviteError;
}

/**
 * @returns {{ company, invite, acceptUrl, delivery, deliveryError, adminEmail }}
 *   `company` is the raw companies row; the controller shapes it.
 */
async function provisionCompany({
  name, companyType, companyEmail,
  adminEmail, adminFirstName, adminLastName,
  createdBy,
}) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    throw new ProvisionError(400, 'NAME_REQUIRED', 'name is required');
  }
  if (trimmedName.length > 255) {
    throw new ProvisionError(400, 'NAME_TOO_LONG', 'name is too long');
  }
  if (!CREATABLE_TYPES.includes(companyType)) {
    throw new ProvisionError(400, 'INVALID_COMPANY_TYPE',
      `company_type must be one of: ${CREATABLE_TYPES.join(', ')}`);
  }
  const email = String(adminEmail || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new ProvisionError(400, 'INVALID_EMAIL', 'A valid admin_email is required');
  }
  // Check before creating the company so a taken address never leaves an
  // orphan company behind.
  const taken = await query('SELECT 1 FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);
  if (taken.rowCount > 0) {
    throw new ProvisionError(409, 'EMAIL_IN_USE', 'An account with this email already exists');
  }

  const { rows: [company] } = await query(
    `INSERT INTO companies (name, company_type, status, company_email)
     VALUES ($1, $2, 'active', $3)
     RETURNING *`,
    [trimmedName, companyType, String(companyEmail || '').trim() || email]
  );

  const { invite, token } = await invites.createInvite({
    companyId: company.id,
    invitedBy: createdBy,
    email,
    firstName: adminFirstName,
    lastName:  adminLastName,
    role:      'admin',
  });
  const { acceptUrl, delivery, deliveryError } = await deliverInvite({
    invite, token,
    inviterUserId: createdBy,
    companyName:   company.name,
  });

  return { company, invite, acceptUrl, delivery, deliveryError, adminEmail: email };
}

module.exports = { CREATABLE_TYPES, ProvisionError, isProvisionError, provisionCompany };
