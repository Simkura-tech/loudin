/**
 * Companies controller — Platform Admin only.
 *
 * Tenant management surface for Loudin staff. Lists every company on the
 * platform with aggregate counts (users, devices) and the parent reseller
 * (if any). Status changes (suspend / cancel / reactivate) will land here
 * later — out of scope for the first cut.
 */

const { query } = require('../../database/db');
const { recordAudit } = require('../../services/platform/audit');

const ALLOWED_TYPES    = ['platform', 'end_user', 'reseller'];
const ALLOWED_STATUSES = ['active', 'inactive', 'suspended', 'canceled'];
const MAX_LIMIT = 200;

// Canonical churn reason codes — keep in sync with the frontend dropdown.
// Free-form (no DB CHECK constraint) so we can grow the list without a
// migration; validation lives here.
const ALLOWED_CANCELLATION_REASON_CODES = new Set([
  'cost',
  'switched_competitor',
  'missing_features',
  'unused',
  'business_closed',
  'poor_quality',
  // 'exploring' — only end-users can use this when self-canceling. The
  // controllers accept any code from this set; UIs gate which ones they
  // offer per role.
  'exploring',
  'other',
]);

function notFound(res) {
  return res.status(404).json({ error: 'Not Found', message: 'Company not found' });
}

function publicCompany(row) {
  return {
    id:                  row.id,
    name:                row.name,
    company_type:        row.company_type,
    status:              row.status,
    parent_company_id:   row.parent_company_id,
    parent_company_name: row.parent_company_name ?? null,
    parent_locked_at:    row.parent_locked_at,
    company_email:       row.company_email,
    company_phone:       row.company_phone,
    company_url:         row.company_url,
    street:              row.street,
    city:                row.city,
    state:               row.state,
    zip:                 row.zip,
    country:             row.country,
    user_count:          row.user_count ?? 0,
    device_count:        row.device_count ?? 0,
    // Lifecycle audit — non-null when an action has happened.
    suspended_at:             row.suspended_at,
    suspended_by:             row.suspended_by,
    suspension_reason:        row.suspension_reason,
    reactivated_at:           row.reactivated_at,
    reactivated_by:           row.reactivated_by,
    canceled_at:              row.canceled_at,
    canceled_by:              row.canceled_by,
    cancellation_reason:      row.cancellation_reason,
    cancellation_reason_code: row.cancellation_reason_code,
    cancel_effective_at:      row.cancel_effective_at,
    created_at:               row.created_at,
    updated_at:               row.updated_at,
  };
}

// â”€â”€ GET /api/companies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//   ?type=platform|end_user|reseller
//   ?status=active|inactive|suspended|canceled
//   ?search=…           matches name / company_email (ILIKE)
//   ?limit=…&offset=…   (limit clamped to MAX_LIMIT)
async function list(req, res, next) {
  try {
    const limit  = Math.min(Number(req.query.limit)  || 100, MAX_LIMIT);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = (req.query.search || '').toString().trim();
    const type   = req.query.type;
    const status = req.query.status;

    const filterParams = [];
    let where = 'c.deleted_at IS NULL';

    if (type && ALLOWED_TYPES.includes(type)) {
      filterParams.push(type);
      where += ` AND c.company_type = $${filterParams.length}`;
    }
    if (status && ALLOWED_STATUSES.includes(status)) {
      filterParams.push(status);
      where += ` AND c.status = $${filterParams.length}`;
    }
    if (search) {
      filterParams.push(`%${search}%`);
      const idx = filterParams.length;
      where += ` AND (c.name ILIKE $${idx} OR c.company_email ILIKE $${idx})`;
    }

    const listParams = [...filterParams, limit, offset];
    const lim = `$${listParams.length - 1}`;
    const off = `$${listParams.length}`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT c.id, c.name, c.company_type, c.status,
                c.parent_company_id, c.parent_locked_at, p.name AS parent_company_name,
                c.company_email, c.company_phone, c.company_url,
                c.street, c.city, c.state, c.zip, c.country,
                c.suspended_at, c.suspended_by, c.suspension_reason,
                c.reactivated_at, c.reactivated_by,
                c.canceled_at, c.canceled_by,
                c.cancellation_reason, c.cancellation_reason_code,
                c.created_at, c.updated_at,
                (SELECT COUNT(*)::int FROM users   u WHERE u.company_id = c.id AND u.deleted_at IS NULL) AS user_count,
                (SELECT COUNT(*)::int FROM devices d WHERE d.company_id = c.id AND d.deleted_at IS NULL) AS device_count
           FROM companies c
      LEFT JOIN companies p ON p.id = c.parent_company_id AND p.deleted_at IS NULL
          WHERE ${where}
          ORDER BY c.created_at DESC
          LIMIT ${lim} OFFSET ${off}`,
        listParams
      ),
      query(`SELECT COUNT(*)::int AS n FROM companies c WHERE ${where}`, filterParams),
    ]);

    return res.json({ companies: rows.map(publicCompany), total: countRows[0].n, limit, offset });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ GET /api/companies/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function get(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT c.id, c.name, c.company_type, c.status,
              c.parent_company_id, c.parent_locked_at, p.name AS parent_company_name,
              c.company_email, c.company_phone, c.company_url,
              c.street, c.city, c.state, c.zip, c.country,
              c.suspended_at, c.suspended_by, c.suspension_reason,
              c.reactivated_at, c.reactivated_by,
              c.canceled_at, c.canceled_by,
              c.cancellation_reason, c.cancellation_reason_code,
              c.cancel_effective_at,
              c.created_at, c.updated_at,
              (SELECT COUNT(*)::int FROM users   u WHERE u.company_id = c.id AND u.deleted_at IS NULL) AS user_count,
              (SELECT COUNT(*)::int FROM devices d WHERE d.company_id = c.id AND d.deleted_at IS NULL) AS device_count
         FROM companies c
    LEFT JOIN companies p ON p.id = c.parent_company_id AND p.deleted_at IS NULL
        WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [Number(req.params.id)]
    );
    if (rows.length === 0) return notFound(res);
    return res.json({ company: publicCompany(rows[0]) });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ GET /api/companies/:id/users â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Lists the software users for a given company.
async function listUsers(req, res, next) {
  try {
    const companyId = Number(req.params.id);
    const { rows } = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone_number,
              u.user_type_id, u.status, u.last_login_at, u.created_at
         FROM users u
        WHERE u.company_id = $1 AND u.deleted_at IS NULL
        ORDER BY u.created_at ASC`,
      [companyId]
    );
    return res.json({ users: rows, total: rows.length });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ GET /api/companies/:id/devices â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Lists this company's claimed devices (from our DB; Simkura merge is on
// /api/platform/devices for the full fleet view).
async function listDevices(req, res, next) {
  try {
    const companyId = Number(req.params.id);
    const { rows } = await query(
      `SELECT id, device_id, device_type, firmware_version,
              device_name, location, notes,
              status, door_state, battery_percent, power_mode,
              last_seen, created_at, updated_at
         FROM devices
        WHERE company_id = $1 AND deleted_at IS NULL
        ORDER BY device_name`,
      [companyId]
    );
    return res.json({ devices: rows, total: rows.length });
  } catch (err) {
    return next(err);
  }
}

function badRequest(res, msg) {
  return res.status(400).json({ error: 'Bad Request', message: msg });
}

// â”€â”€ Lifecycle actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// All three transitions share a row-fetch + state-check + UPDATE shape; this
// helper keeps the endpoints concise.
async function loadCompanyForAction(id) {
  const { rows } = await query(
    `SELECT id, name, company_type, status FROM companies WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

function conflict(res, message) {
  return res.status(409).json({ error: 'Conflict', message });
}

// â”€â”€ POST /api/companies/:id/suspend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Body: { reason: string }  — free text; required.
async function suspend(req, res, next) {
  try {
    const id     = Number(req.params.id);
    const reason = (req.body?.reason ?? '').toString().trim();
    if (!reason) {
      return res.status(400).json({ error: 'Bad Request', message: 'reason is required' });
    }

    const company = await loadCompanyForAction(id);
    if (!company) return notFound(res);
    if (company.company_type === 'platform') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'The platform company cannot be suspended.',
      });
    }
    if (company.status === 'suspended') {
      return conflict(res, 'Company is already suspended.');
    }
    if (company.status === 'canceled') {
      return conflict(res, 'Company is canceled — reactivate it before suspending.');
    }

    const { rows } = await query(
      `UPDATE companies
          SET status            = 'suspended',
              suspended_at      = NOW(),
              suspended_by      = $2,
              suspension_reason = $3,
              updated_at        = NOW()
        WHERE id = $1
    RETURNING id`,
      [id, req.user.user_id, reason]
    );
    if (rows.length === 0) return notFound(res);

    recordAudit(req, 'company.suspend', {
      target_type: 'company',
      target_id:   id,
      metadata:    { reason },
    });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/companies/:id/reactivate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// No body. Flips status back to 'active' and records who/when. Original
// suspension / cancellation columns are left in place as history.
async function reactivate(req, res, next) {
  try {
    const id      = Number(req.params.id);
    const company = await loadCompanyForAction(id);
    if (!company) return notFound(res);
    if (company.status === 'active') {
      return conflict(res, 'Company is already active.');
    }

    // Reactivation also withdraws any scheduled self-service cancel —
    // if an admin overrides a tenant back to active, they shouldn't
    // silently re-cancel at the next month boundary.
    await query(
      `UPDATE companies
          SET status              = 'active',
              reactivated_at      = NOW(),
              reactivated_by      = $2,
              cancel_effective_at = NULL,
              updated_at          = NOW()
        WHERE id = $1`,
      [id, req.user.user_id]
    );
    recordAudit(req, 'company.reactivate', {
      target_type: 'company',
      target_id:   id,
      metadata:    { previous_status: company.status },
    });

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/companies/:id/cancel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Body: { reason_code: string, details?: string }
//   reason_code is required, validated against ALLOWED_CANCELLATION_REASON_CODES.
//   details is optional free text — most useful when reason_code === 'other'.
async function cancel(req, res, next) {
  try {
    const id          = Number(req.params.id);
    const reasonCode  = (req.body?.reason_code ?? '').toString().trim();
    const details     = (req.body?.details ?? '').toString().trim() || null;

    if (!ALLOWED_CANCELLATION_REASON_CODES.has(reasonCode)) {
      return res.status(400).json({
        error:   'Bad Request',
        message: `reason_code must be one of: ${[...ALLOWED_CANCELLATION_REASON_CODES].join(', ')}`,
      });
    }

    const company = await loadCompanyForAction(id);
    if (!company) return notFound(res);
    if (company.company_type === 'platform') {
      return res.status(400).json({
        error:   'Bad Request',
        message: 'The platform company cannot be canceled.',
      });
    }
    if (company.status === 'canceled') {
      return conflict(res, 'Company is already canceled.');
    }

    await query(
      `UPDATE companies
          SET status                   = 'canceled',
              canceled_at              = NOW(),
              canceled_by              = $2,
              cancellation_reason_code = $3,
              cancellation_reason      = $4,
              updated_at               = NOW()
        WHERE id = $1`,
      [id, req.user.user_id, reasonCode, details]
    );
    recordAudit(req, 'company.cancel', {
      target_type: 'company',
      target_id:   id,
      metadata:    { reason_code: reasonCode, details, source: 'platform_admin' },
    });

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/companies/:id/reseller â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Platform-admin override of an end-user's reseller link. Body:
//   { reseller_id: number }  â†’ reassign / set
//   { reseller_id: null }    â†’ detach (back to direct)
// End-user-only target; platform / reseller companies have no parent.
async function setReseller(req, res, next) {
  try {
    const id = Number(req.params.id);
    const raw = req.body?.reseller_id;
    const wantsDetach = raw === null;
    const resellerId  = wantsDetach ? null : Number(raw);

    if (!wantsDetach && (!Number.isFinite(resellerId) || resellerId <= 0)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'reseller_id must be a positive integer or null',
      });
    }

    const company = await loadCompanyForAction(id);
    if (!company) return notFound(res);
    if (company.company_type !== 'end_user') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Only end-user companies can be linked to a reseller.',
      });
    }

    let resellerName = null;
    if (resellerId !== null) {
      const { rows } = await query(
        `SELECT id, name FROM companies
          WHERE id = $1
            AND company_type = 'reseller'
            AND status = 'active'
            AND deleted_at IS NULL`,
        [resellerId]
      );
      if (rows.length === 0) {
        return res.status(400).json({
          error:   'Bad Request',
          message: 'reseller_id does not match an active reseller.',
        });
      }
      resellerName = rows[0].name;
    }

    await query(
      `UPDATE companies
          SET parent_company_id = $2::int,
              parent_locked_at  = CASE WHEN $2::int IS NULL THEN NULL ELSE NOW() END,
              updated_at        = NOW()
        WHERE id = $1`,
      [id, resellerId]
    );

    recordAudit(req, 'company.reseller_changed', {
      target_type: 'company',
      target_id:   id,
      metadata:    {
        reseller_id:   resellerId,
        reseller_name: resellerName,
        source:        'platform_admin',
        detached:      wantsDetach,
      },
    });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/platform/companies/:id/terminate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Platform-admin-only. Reseller-only. Irreversible per v1 product decision:
//   * Reseller row â†’ status='canceled' + canceled_* stamped.
//   * Every end-user under this reseller has parent_company_id nulled.
//
// Body: { reason_code: string, details?: string }
async function terminateReseller(req, res, next) {
  try {
    const id         = Number(req.params.id);
    const reasonCode = (req.body?.reason_code ?? '').toString().trim();
    const details    = (req.body?.details ?? '').toString().trim() || null;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Bad Request', message: 'invalid company id' });
    }
    if (!ALLOWED_CANCELLATION_REASON_CODES.has(reasonCode)) {
      return res.status(400).json({
        error:   'Bad Request',
        message: `reason_code must be one of: ${[...ALLOWED_CANCELLATION_REASON_CODES].join(', ')}`,
      });
    }

    const resellers = require('../../services/tenancy/resellers');
    const result = await resellers.terminate(id, {
      req,
      reason:     details,
      reasonCode,
    });

    if (!result.terminated) {
      const status = result.reason === 'not_found' ? 404
                   : result.reason === 'not_reseller' ? 400
                   : 409; // already_terminated
      return res.status(status).json({
        error:   status === 404 ? 'Not Found' : status === 400 ? 'Bad Request' : 'Conflict',
        code:    result.reason.toUpperCase(),
        message: result.reason === 'not_reseller'
                   ? 'Only resellers can be terminated through this endpoint.'
                 : result.reason === 'already_terminated'
                   ? 'Reseller is already terminated.'
                   : 'Reseller not found.',
      });
    }

    return res.json({
      ok: true,
      end_users_unlocked: result.end_users_unlocked,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  list, get, listUsers, listDevices,
  suspend, reactivate, cancel,
  setReseller,
  terminateReseller,
  ALLOWED_CANCELLATION_REASON_CODES,
};
