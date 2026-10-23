'use strict';

/**
 * Installer grants — which installer companies may work inside which
 * customer workspaces (migration 092).
 *
 * Three callers share this module:
 *   - the customer's own admins   (controllers/tenancy/installers.js → workspace)
 *   - the installer's users       (controllers/tenancy/installers.js → installer)
 *   - the platform admin          (controllers/tenancy/installers.js → platform)
 *   - middleware/core/auth.js     (hasActiveGrant on every service-session request)
 *
 * Nothing here knows about money. Revenue share for installers lives
 * outside core; lifecycle events (installer.granted / installer.revoked) are
 * emitted by the controllers so a billing system can follow along.
 */

const { query } = require('../../database/db');

class InstallerError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function publicGrant(row) {
  return {
    id:         row.id,
    installer: {
      id:            row.installer_company_id,
      name:          row.installer_name,
      company_email: row.installer_email ?? null,
      status:        row.installer_status,
    },
    customer: {
      id:           row.customer_company_id,
      name:         row.customer_name,
      status:       row.customer_status,
      city:         row.customer_city ?? null,
      state:        row.customer_state ?? null,
      device_count: row.customer_device_count ?? undefined,
      user_count:   row.customer_user_count ?? undefined,
    },
    granted_by:  row.granted_by_name ?? null,
    granted_at:  row.granted_at,
    revoked_at:  row.revoked_at,
  };
}

const GRANT_SELECT = `
  SELECT g.*,
         i.name AS installer_name, i.company_email AS installer_email, i.status AS installer_status,
         c.name AS customer_name,  c.status AS customer_status, c.city AS customer_city, c.state AS customer_state,
         (SELECT COUNT(*)::int FROM devices d WHERE d.company_id = c.id AND d.deleted_at IS NULL) AS customer_device_count,
         (SELECT COUNT(*)::int FROM users   u WHERE u.company_id = c.id AND u.deleted_at IS NULL) AS customer_user_count,
         NULLIF(TRIM(CONCAT(gb.first_name, ' ', gb.last_name)), '') AS granted_by_name
    FROM installer_grants g
    JOIN companies i  ON i.id = g.installer_company_id
    JOIN companies c  ON c.id = g.customer_company_id
    LEFT JOIN users gb ON gb.id = g.granted_by
`;

// ── Lookups ──────────────────────────────────────────────────────────────────

/** Active installer companies, for pickers. */
async function listInstallerCompanies({ search } = {}) {
  const params = [];
  let where = `c.company_type = 'installer' AND c.status = 'active' AND c.deleted_at IS NULL`;
  if (search && String(search).trim()) {
    params.push(`%${String(search).trim()}%`);
    where += ` AND (c.name ILIKE $1 OR c.company_email ILIKE $1)`;
  }
  const { rows } = await query(
    `SELECT c.id, c.name, c.company_email, c.city, c.state, c.country
       FROM companies c
      WHERE ${where}
      ORDER BY c.name ASC
      LIMIT 200`,
    params
  );
  return rows;
}

/** Active grants on one customer company (who may work here). */
async function listGrantsForCustomer(customerCompanyId) {
  const { rows } = await query(
    `${GRANT_SELECT} WHERE g.customer_company_id = $1 AND g.revoked_at IS NULL ORDER BY g.granted_at DESC`,
    [customerCompanyId]
  );
  return rows.map(publicGrant);
}

/** Active grants held by one installer company (where may I work). */
async function listCustomersForInstaller(installerCompanyId) {
  const { rows } = await query(
    `${GRANT_SELECT} WHERE g.installer_company_id = $1 AND g.revoked_at IS NULL ORDER BY c.name ASC`,
    [installerCompanyId]
  );
  return rows.map(publicGrant);
}

/** Fast check used by the auth middleware on every service-session request. */
async function hasActiveGrant(installerCompanyId, customerCompanyId) {
  const { rowCount } = await query(
    `SELECT 1
       FROM installer_grants g
       JOIN companies i ON i.id = g.installer_company_id
       JOIN companies c ON c.id = g.customer_company_id
      WHERE g.installer_company_id = $1 AND g.customer_company_id = $2
        AND g.revoked_at IS NULL
        AND i.status = 'active' AND i.deleted_at IS NULL
        AND c.status NOT IN ('suspended', 'canceled') AND c.deleted_at IS NULL`,
    [installerCompanyId, customerCompanyId]
  );
  return rowCount > 0;
}

async function getGrant(grantId) {
  const { rows: [row] } = await query(`${GRANT_SELECT} WHERE g.id = $1`, [grantId]);
  return row ? { raw: row, grant: publicGrant(row) } : null;
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Grant an installer company access to a customer company. Idempotent: an
 * existing active grant is returned unchanged with `created: false`.
 */
async function grant({ installerCompanyId, customerCompanyId, grantedBy }) {
  const ids = [installerCompanyId, customerCompanyId].map(Number);
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new InstallerError(400, 'INVALID_COMPANY', 'installer_company_id and customer_company_id must be integers');
  }
  if (ids[0] === ids[1]) {
    throw new InstallerError(400, 'SAME_COMPANY', 'A company cannot be its own installer');
  }

  const { rows } = await query(
    `SELECT id, company_type, status FROM companies WHERE id = ANY($1::int[]) AND deleted_at IS NULL`,
    [ids]
  );
  const installer = rows.find((r) => r.id === ids[0]);
  const customer  = rows.find((r) => r.id === ids[1]);
  if (!installer || installer.company_type !== 'installer') {
    throw new InstallerError(404, 'INSTALLER_NOT_FOUND', 'Installer company not found');
  }
  if (installer.status !== 'active') {
    throw new InstallerError(409, 'INSTALLER_INACTIVE', `Installer company is ${installer.status}`);
  }
  if (!customer || customer.company_type !== 'end_user') {
    throw new InstallerError(404, 'CUSTOMER_NOT_FOUND', 'Customer company not found');
  }
  if (customer.status === 'canceled') {
    throw new InstallerError(409, 'CUSTOMER_CANCELED', 'This workspace has been canceled');
  }

  const existing = await query(
    `SELECT id FROM installer_grants
      WHERE installer_company_id = $1 AND customer_company_id = $2 AND revoked_at IS NULL`,
    ids
  );
  if (existing.rowCount > 0) {
    const found = await getGrant(existing.rows[0].id);
    return { grant: found.grant, created: false };
  }

  const { rows: [inserted] } = await query(
    `INSERT INTO installer_grants (installer_company_id, customer_company_id, granted_by)
     VALUES ($1, $2, $3) RETURNING id`,
    [ids[0], ids[1], grantedBy ?? null]
  );
  const found = await getGrant(inserted.id);
  return { grant: found.grant, created: true };
}

/**
 * Revoke a grant. `customerCompanyId` / `installerCompanyId` narrow which
 * rows the caller may touch (customer admins their own, installers their
 * own, platform anything). Idempotent on already-revoked rows.
 */
async function revoke({ grantId, revokedBy, customerCompanyId, installerCompanyId }) {
  const found = await getGrant(Number(grantId));
  if (!found) throw new InstallerError(404, 'GRANT_NOT_FOUND', 'Grant not found');
  const { raw } = found;
  if (customerCompanyId != null && raw.customer_company_id !== Number(customerCompanyId)) {
    throw new InstallerError(404, 'GRANT_NOT_FOUND', 'Grant not found');
  }
  if (installerCompanyId != null && raw.installer_company_id !== Number(installerCompanyId)) {
    throw new InstallerError(404, 'GRANT_NOT_FOUND', 'Grant not found');
  }
  if (raw.revoked_at) return { grant: found.grant, changed: false };

  await query(
    `UPDATE installer_grants SET revoked_at = NOW(), revoked_by = $2, updated_at = NOW() WHERE id = $1`,
    [raw.id, revokedBy ?? null]
  );
  const after = await getGrant(raw.id);
  return { grant: after.grant, changed: true };
}

module.exports = {
  InstallerError,
  listInstallerCompanies,
  listGrantsForCustomer,
  listCustomersForInstaller,
  hasActiveGrant,
  getGrant,
  grant,
  revoke,
};
