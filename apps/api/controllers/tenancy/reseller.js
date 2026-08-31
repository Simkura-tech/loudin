/**
 * Reseller controller — endpoints scoped to the caller's reseller company.
 *
 * Reseller admins use these to manage the end-user companies they sell to.
 * Every query is implicitly filtered by `parent_company_id = req.user.company_id`,
 * so a reseller can only ever see their own portfolio.
 *
 * The route file guards every endpoint with requireCompanyType('reseller')
 * (and requireAdmin where needed). Platform admins should use /api/companies
 * for the same data — they have a different lens (all tenants).
 */

const crypto = require('crypto');

const { query } = require('../../database/db');
const notifier  = require('../../services/notifications/notifier');
const templates = require('../../services/notifications/emailTemplates');
const { generateImpersonationToken } = require('../../utils/jwt');
const { setAuthCookie } = require('../../utils/authCookie');
const { recordAudit } = require('../../services/platform/audit');

/** Capabilities a reseller has while impersonating a customer.
 *  Tight scope per product decision: only People + Devices management. */
const IMPERSONATION_SCOPE = ['people', 'devices'];

const MAX_LIMIT = 200;

function publicCustomer(row) {
  return {
    id:                row.id,
    name:              row.name,
    status:            row.status,
    company_email:     row.company_email,
    parent_locked_at:  row.parent_locked_at,
    created_at:        row.created_at,
    user_count:        row.user_count   ?? 0,
    device_count:      row.device_count ?? 0,
    cancel_effective_at: row.cancel_effective_at,
  };
}

// â”€â”€ GET /api/reseller/customers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//   ?search=…            (name / company_email ILIKE)
//   ?status=active|suspended|canceled
//   ?limit=…&offset=…    limit clamped to MAX_LIMIT
async function listCustomers(req, res, next) {
  try {
    const resellerId = req.user.company_id;
    const limit  = Math.min(Number(req.query.limit)  || 100, MAX_LIMIT);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = (req.query.search || '').toString().trim();
    const status = (req.query.status || '').toString().trim();

    const params = [resellerId];
    let where = `c.company_type = 'end_user'
                 AND c.parent_company_id = $1
                 AND c.deleted_at IS NULL`;

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (c.name ILIKE $${params.length} OR c.company_email ILIKE $${params.length})`;
    }
    if (['active','suspended','canceled','inactive'].includes(status)) {
      params.push(status);
      where += ` AND c.status = $${params.length}`;
    }

    const filterParams = [...params];
    params.push(limit);  const lim = `$${params.length}`;
    params.push(offset); const off = `$${params.length}`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT c.id, c.name, c.status, c.company_email,
                c.parent_locked_at, c.cancel_effective_at, c.created_at,
                (SELECT COUNT(*)::int FROM users   u WHERE u.company_id = c.id AND u.deleted_at IS NULL) AS user_count,
                (SELECT COUNT(*)::int FROM devices d WHERE d.company_id = c.id AND d.deleted_at IS NULL) AS device_count
           FROM companies c
          WHERE ${where}
          ORDER BY c.parent_locked_at DESC NULLS LAST, c.created_at DESC
          LIMIT ${lim} OFFSET ${off}`,
        params
      ),
      query(`SELECT COUNT(*)::int AS n FROM companies c WHERE ${where}`, filterParams),
    ]);

    return res.json({
      customers: rows.map(publicCustomer),
      total:     countRows[0].n,
      limit,
      offset,
    });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ Ownership guard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Confirms the requested customer id is an end-user owned by the calling
// reseller. Returns the company row, or null if the customer doesn't
// exist OR is not theirs. We don't distinguish those two cases in the
// HTTP response (both â†’ 404) so a reseller can't probe for the existence
// of customers belonging to other resellers.
async function loadOwnedCustomer(resellerId, customerId) {
  const { rows } = await query(
    `SELECT id, name, status, company_type,
            company_email, company_phone, company_url,
            street, city, state, zip, country,
            parent_company_id, parent_locked_at,
            cancel_effective_at,
            created_at, updated_at
       FROM companies
      WHERE id = $1
        AND company_type = 'end_user'
        AND parent_company_id = $2
        AND deleted_at IS NULL`,
    [customerId, resellerId]
  );
  return rows[0] ?? null;
}

function notFoundCustomer(res) {
  return res.status(404).json({ error: 'Not Found', message: 'Customer not found' });
}

// â”€â”€ GET /api/reseller/customers/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function getCustomer(req, res, next) {
  try {
    const resellerId = req.user.company_id;
    const customerId = Number(req.params.id);
    const row = await loadOwnedCustomer(resellerId, customerId);
    if (!row) return notFoundCustomer(res);

    const { rows: countRows } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM users   u WHERE u.company_id = c.id AND u.deleted_at IS NULL) AS user_count,
         (SELECT COUNT(*)::int FROM devices d WHERE d.company_id = c.id AND d.deleted_at IS NULL) AS device_count
         FROM companies c WHERE c.id = $1`,
      [customerId]
    );

    return res.json({
      customer: {
        id:               row.id,
        name:             row.name,
        status:           row.status,
        company_email:    row.company_email,
        company_phone:    row.company_phone,
        company_url:      row.company_url,
        street:  row.street, city: row.city, state: row.state, zip: row.zip, country: row.country,
        parent_locked_at: row.parent_locked_at,
        cancel_effective_at: row.cancel_effective_at,
        created_at:       row.created_at,
        updated_at:       row.updated_at,
        user_count:       countRows[0].user_count,
        device_count:     countRows[0].device_count,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ GET /api/reseller/customers/:id/devices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function getCustomerDevices(req, res, next) {
  try {
    const resellerId = req.user.company_id;
    const customerId = Number(req.params.id);
    const owned = await loadOwnedCustomer(resellerId, customerId);
    if (!owned) return notFoundCustomer(res);

    const { rows } = await query(
      `SELECT id, device_id, device_type, firmware_version,
              device_name, location, notes,
              status, door_state, battery_percent, power_mode,
              last_seen, created_at, updated_at
         FROM devices
        WHERE company_id = $1 AND deleted_at IS NULL
        ORDER BY device_name`,
      [customerId]
    );
    return res.json({ devices: rows, total: rows.length });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ GET /api/reseller/customers/:id/users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function getCustomerUsers(req, res, next) {
  try {
    const resellerId = req.user.company_id;
    const customerId = Number(req.params.id);
    const owned = await loadOwnedCustomer(resellerId, customerId);
    if (!owned) return notFoundCustomer(res);

    const { rows } = await query(
      `SELECT id, email, first_name, last_name, phone_number,
              user_type_id, status, last_login_at, created_at
         FROM users
        WHERE company_id = $1 AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [customerId]
    );
    return res.json({ users: rows, total: rows.length });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ GET /api/reseller/devices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Cross-customer device list: every device whose owner is one of the
// caller's end-user customers. Pool / unassigned devices are excluded;
// they'd come from a separate `reseller_company_id = me` query (deferred).
//
// Query params:
//   ?search=…          matches device_name / device_id (ILIKE)
//   ?status=…          online | offline | error | maintenance
//   ?customer_id=…     restrict to a single customer (must belong to caller)
//   ?limit=…&offset=…  paginated; limit clamped to MAX_LIMIT
async function listDevices(req, res, next) {
  try {
    const resellerId = req.user.company_id;
    const limit  = Math.min(Number(req.query.limit)  || 100, MAX_LIMIT);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = (req.query.search || '').toString().trim();
    const status = (req.query.status || '').toString().trim();
    const customerId = Number(req.query.customer_id);

    const params = [resellerId];
    let where = `c.parent_company_id = $1
                 AND c.company_type = 'end_user'
                 AND c.deleted_at IS NULL
                 AND d.deleted_at IS NULL`;

    if (Number.isFinite(customerId) && customerId > 0) {
      params.push(customerId);
      where += ` AND c.id = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (d.device_name ILIKE $${params.length} OR d.device_id ILIKE $${params.length})`;
    }
    if (['online','offline','error','maintenance'].includes(status)) {
      params.push(status);
      where += ` AND d.status = $${params.length}`;
    }

    const filterParams = [...params];
    params.push(limit);  const lim = `$${params.length}`;
    params.push(offset); const off = `$${params.length}`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT d.id, d.device_id, d.device_type, d.firmware_version,
                d.device_name, d.location, d.notes,
                d.status, d.door_state, d.battery_percent, d.power_mode,
                d.last_seen, d.created_at, d.updated_at,
                c.id   AS customer_id,
                c.name AS customer_name,
                c.status AS customer_status
           FROM devices d
           JOIN companies c ON c.id = d.company_id
          WHERE ${where}
          ORDER BY d.last_seen DESC NULLS LAST, d.device_name ASC
          LIMIT ${lim} OFFSET ${off}`,
        params
      ),
      query(
        `SELECT COUNT(*)::int AS n
           FROM devices d
           JOIN companies c ON c.id = d.company_id
          WHERE ${where}`,
        filterParams
      ),
    ]);

    return res.json({
      devices: rows,
      total:   countRows[0].n,
      limit,
      offset,
    });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/reseller/customers/:id/impersonate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Issues a short-lived impersonation token that puts the reseller admin
// "in" the customer's workspace, scoped to People + Devices.
//
// JWT shape during impersonation:
//   company_id    = customer's id        â† so tenant-scoped queries hit the
//   company_type  = 'end_user'             impersonated workspace
//   user_id       = reseller admin's id  â† actor identity stays
//   user_type_id  = 1 (Admin)            â† so admin-gated routes work
//   impersonation = { impersonator_user_id, impersonator_company_id,
//                     impersonator_company_type, scope, started_at }
//
// Audit log row written with action='impersonation.start'.
async function impersonateCustomer(req, res, next) {
  try {
    const resellerId = req.user.company_id;
    const customerId = Number(req.params.id);

    // Refuse nested impersonation — keep the actor history clear.
    if (req.impersonation) {
      return res.status(409).json({
        error:   'Conflict',
        message: 'You are already impersonating a customer. End that session first.',
      });
    }

    const row = await loadOwnedCustomer(resellerId, customerId);
    if (!row) return notFoundCustomer(res);

    if (row.status !== 'active') {
      return res.status(409).json({
        error:   'Conflict',
        message: `Cannot impersonate a ${row.status} customer.`,
      });
    }

    const started_at = new Date().toISOString();
    const token = generateImpersonationToken({
      user_id:      req.user.user_id,
      company_id:   row.id,
      user_type_id: 1, // Admin within the impersonated workspace
      email:        req.user.email,
      company_type: 'end_user',
      impersonation: {
        impersonator_user_id:      req.user.user_id,
        impersonator_company_id:   resellerId,
        impersonator_company_type: 'reseller',
        scope:                     IMPERSONATION_SCOPE,
        started_at,
      },
    });
    setAuthCookie(res, token);

    recordAudit(req, 'impersonation.start', {
      target_type: 'company',
      target_id:   row.id,
      metadata:    { scope: IMPERSONATION_SCOPE, customer_name: row.name },
    });

    return res.json({
      ok: true,
      impersonating: {
        company_id:   row.id,
        company_name: row.name,
        scope:        IMPERSONATION_SCOPE,
        started_at,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// ── GET /api/reseller/invite ─────────────────────────────────────────────────
// The reseller's current customer-invite token, or null if none has been
// generated yet. The frontend builds the shareable URL from the token
// (`/signup?invite=<token>`), so the server doesn't need to know its origin.
async function getInvite(req, res, next) {
  try {
    const { rows: [row] } = await query(
      `SELECT customer_invite_token            AS token,
              customer_invite_token_created_at AS created_at
         FROM companies WHERE id = $1`,
      [req.user.company_id]
    );
    return res.json({
      invite: row?.token ? { token: row.token, created_at: row.created_at } : null,
    });
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/reseller/invite/rotate ─────────────────────────────────────────
// Generate the invite token, or replace an existing one. Replacement is the
// revocation mechanism: links carrying the old token stop resolving the
// moment this commits.
async function rotateInvite(req, res, next) {
  try {
    const token = `inv_${crypto.randomBytes(18).toString('base64url')}`;
    const { rows: [row] } = await query(
      `UPDATE companies
          SET customer_invite_token            = $2,
              customer_invite_token_created_at = NOW(),
              updated_at                       = NOW()
        WHERE id = $1
        RETURNING customer_invite_token            AS token,
                  customer_invite_token_created_at AS created_at`,
      [req.user.company_id, token]
    );

    recordAudit(req, 'reseller.invite_rotated', {
      target_type: 'company',
      target_id:   req.user.company_id,
    });

    return res.json({ invite: { token: row.token, created_at: row.created_at } });
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/reseller/invite/send ───────────────────────────────────────────
// Email the invite link to a prospective customer, from Loudin on the
// reseller's behalf. Lazily generates the token if the reseller has never
// created a link — asking to send one implies wanting one to exist.
//
// Route-level rate limit (per reseller, see routes/client/reseller.js)
// keeps this from being usable as a spam cannon; the response includes
// `delivered` ('email' | 'console') so the dev UI can hint when the
// email provider isn't configured and the payload went to the API log.
const INVITE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendInvite(req, res, next) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!INVITE_EMAIL_RE.test(email)) {
      return res.status(400).json({
        error:   'Bad Request',
        message: 'A valid email address is required',
      });
    }

    const { rows: [me] } = await query(
      `SELECT name,
              customer_invite_token            AS token,
              customer_invite_token_created_at AS created_at
         FROM companies WHERE id = $1`,
      [req.user.company_id]
    );

    let { token, created_at } = me;
    if (!token) {
      token = `inv_${crypto.randomBytes(18).toString('base64url')}`;
      const { rows: [fresh] } = await query(
        `UPDATE companies
            SET customer_invite_token            = $2,
                customer_invite_token_created_at = NOW(),
                updated_at                       = NOW()
          WHERE id = $1
          RETURNING customer_invite_token_created_at AS created_at`,
        [req.user.company_id, token]
      );
      created_at = fresh.created_at;
    }

    const base = (process.env.FRONTEND_URL || 'http://localhost:8081').replace(/\/+$/, '');
    const inviteUrl = `${base}/signup?invite=${encodeURIComponent(token)}`;

    const result = await notifier.sendEmail({
      to:      email,
      payload: templates.resellerInviteEmail({ resellerName: me.name, inviteUrl }),
      preheaderForDevLog: `customer invite from ${me.name}`,
    });

    recordAudit(req, 'reseller.invite_sent', {
      target_type: 'company',
      target_id:   req.user.company_id,
      metadata:    { to: email, delivered: result.delivered },
    });

    return res.json({
      ok:        true,
      delivered: result.delivered,
      invite:    { token, created_at },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listCustomers,
  getCustomer,
  getCustomerDevices,
  getCustomerUsers,
  listDevices,
  impersonateCustomer,
  getInvite,
  rotateInvite,
  sendInvite,
};
