/**
 * Workspace controller — the signed-in user's company.
 *
 * GET returns the full company record (minus reseller-internal fields like
 * the Simkura API key). PATCH lets an Admin edit the human-managed columns:
 * display name, contact info, structured address. Everything else
 * (company_type, parent_company_id, status, audit columns, Simkura
 * credentials) is owned elsewhere and not editable here.
 */

const { query } = require('../../database/db');
const { ALLOWED_CANCELLATION_REASON_CODES } = require('./companies');
const { recordAudit } = require('../../services/platform/audit');
const events = require('../../integrations/events');

const EDITABLE_FIELDS = [
  'name',
  'company_email',
  'company_phone',
  'company_url',
  // Shipping (legacy "main address") columns
  'street', 'city', 'state', 'zip', 'country',
  // Lead contact (named person)
  'lead_contact_name', 'lead_contact_email', 'lead_contact_phone', 'lead_contact_title',
  // Billing address — optional. When billing_same_as_shipping=true, billing_* should be null.
  'billing_street', 'billing_city', 'billing_state', 'billing_zip', 'billing_country',
  'billing_same_as_shipping',
  // Identity / legal
  'tax_id',
  // Notification preferences (JSONB)
  'notification_preferences',
];

const MAX_LENGTHS = {
  name:               255,
  company_email:      255,
  company_phone:       50,
  company_url:        500,
  street:             255,
  city:               100,
  state:              100,
  zip:                 20,
  country:            100,
  lead_contact_name:  255,
  lead_contact_email: 255,
  lead_contact_phone:  50,
  lead_contact_title: 100,
  billing_street:     255,
  billing_city:       100,
  billing_state:      100,
  billing_zip:         20,
  billing_country:    100,
  tax_id:              50,
};

/** Known notification preference keys. Unknown keys on input are stripped;
 *  values must be booleans. Defaults live in the DB column default. */
const NOTIFICATION_PREF_KEYS = new Set([
  'device_incidents',
  'weekly_digest',
  'billing_alerts',
  'security_alerts',
  'marketing_updates',
]);

function sanitizeNotificationPrefs(input) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) return null;
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (NOTIFICATION_PREF_KEYS.has(k) && typeof v === 'boolean') out[k] = v;
  }
  return out;
}

function badRequest(res, message, details) {
  return res.status(400).json({ error: 'Bad Request', message, ...(details && { details }) });
}

function publicCompany(row) {
  return {
    id:            row.id,
    name:          row.name,
    company_type:  row.company_type,
    status:        row.status,
    company_email: row.company_email,
    company_phone: row.company_phone,
    company_url:   row.company_url,
    // Shipping (legacy main address)
    street:        row.street,
    city:          row.city,
    state:         row.state,
    zip:           row.zip,
    country:       row.country,
    // Lead contact (named person)
    lead_contact_name:  row.lead_contact_name,
    lead_contact_email: row.lead_contact_email,
    lead_contact_phone: row.lead_contact_phone,
    lead_contact_title: row.lead_contact_title,
    // Billing address
    billing_street:           row.billing_street,
    billing_city:             row.billing_city,
    billing_state:            row.billing_state,
    billing_zip:              row.billing_zip,
    billing_country:          row.billing_country,
    billing_same_as_shipping: row.billing_same_as_shipping,
    // Identity / legal
    tax_id:                   row.tax_id,
    // Notification toggles (JSONB)
    notification_preferences: row.notification_preferences,
    // Reseller (parent) link. Joined on the GET path; null for direct
    // tenants or non-end-user companies.
    parent_company_id:   row.parent_company_id,
    parent_company_name: row.parent_company_name ?? null,
    parent_locked_at:    row.parent_locked_at,
    // Subscription cancellation surface (self-service end-user flow).
    // Other lifecycle audit fields are platform-admin-only and aren't
    // exposed on /api/workspace.
    cancel_effective_at:      row.cancel_effective_at,
    cancellation_reason_code: row.cancellation_reason_code,
    cancellation_reason:      row.cancellation_reason,
    created_at:    row.created_at,
    updated_at:    row.updated_at,
  };
}

/** Single source of truth for the workspace SELECT — joins the parent
 *  reseller so the response carries the human-readable name. Used by GET
 *  and as the follow-up after PATCH/POST mutations. */
async function loadWorkspace(companyId) {
  const { rows } = await query(
    `SELECT c.id, c.name, c.company_type, c.status,
            c.company_email, c.company_phone, c.company_url,
            c.street, c.city, c.state, c.zip, c.country,
            c.lead_contact_name, c.lead_contact_email, c.lead_contact_phone, c.lead_contact_title,
            c.billing_street, c.billing_city, c.billing_state, c.billing_zip, c.billing_country,
            c.billing_same_as_shipping,
            c.tax_id,
            c.notification_preferences,
            c.parent_company_id, c.parent_locked_at,
            p.name AS parent_company_name,
            c.cancel_effective_at, c.cancellation_reason_code, c.cancellation_reason,
            c.created_at, c.updated_at
       FROM companies c
  LEFT JOIN companies p ON p.id = c.parent_company_id AND p.deleted_at IS NULL
      WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [companyId]
  );
  return rows[0] ?? null;
}

const SELECT_COLUMNS = `
  id, name, company_type, status,
  company_email, company_phone, company_url,
  street, city, state, zip, country,
  lead_contact_name, lead_contact_email, lead_contact_phone, lead_contact_title,
  billing_street, billing_city, billing_state, billing_zip, billing_country,
  billing_same_as_shipping,
  tax_id,
  notification_preferences,
  cancel_effective_at, cancellation_reason_code, cancellation_reason,
  created_at, updated_at
`;

// â”€â”€ GET /api/workspace â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function get(req, res, next) {
  try {
    const row = await loadWorkspace(req.user.company_id);
    if (!row) {
      return res.status(404).json({ error: 'Not Found', message: 'Workspace not found' });
    }
    return res.json({ workspace: publicCompany(row) });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ PATCH /api/workspace â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function update(req, res, next) {
  try {
    const out = {};
    const errors = [];

    for (const k of Object.keys(req.body || {})) {
      if (!EDITABLE_FIELDS.includes(k)) {
        errors.push(`field "${k}" is not editable`);
      }
    }

    if (req.body.name !== undefined) {
      const v = String(req.body.name).trim();
      if (!v)                              errors.push('name cannot be empty');
      else if (v.length > MAX_LENGTHS.name) errors.push('name too long');
      else {
        out.name = v;
        // A user-entered name is no longer a placeholder — clear the flag so
        // the "name your workspace" prompt stops showing. Set server-side,
        // not via req.body, so it can't be toggled back on by a client.
        out.name_auto_generated = false;
      }
    }

    // Email-validated fields share the same pattern.
    for (const k of ['company_email', 'lead_contact_email']) {
      if (req.body[k] !== undefined) {
        const raw = req.body[k];
        const v = raw === null ? null : (String(raw).trim() || null);
        if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors.push(`${k} is not a valid email`);
        else if (v && v.length > MAX_LENGTHS[k]) errors.push(`${k} too long`);
        else out[k] = v ? v.toLowerCase() : null;
      }
    }

    // Plain nullable strings — trimmed, empty becomes null, length-checked.
    const NULLABLE_STRING_FIELDS = [
      'company_phone', 'company_url',
      'street', 'city', 'state', 'zip', 'country',
      'lead_contact_name', 'lead_contact_phone', 'lead_contact_title',
      'billing_street', 'billing_city', 'billing_state', 'billing_zip', 'billing_country',
      'tax_id',
    ];
    for (const k of NULLABLE_STRING_FIELDS) {
      if (req.body[k] !== undefined) {
        const raw = req.body[k];
        const v = raw === null ? null : (String(raw).trim() || null);
        if (v && v.length > MAX_LENGTHS[k]) errors.push(`${k} too long`);
        else out[k] = v;
      }
    }

    if (req.body.billing_same_as_shipping !== undefined) {
      if (typeof req.body.billing_same_as_shipping !== 'boolean') {
        errors.push('billing_same_as_shipping must be a boolean');
      } else {
        out.billing_same_as_shipping = req.body.billing_same_as_shipping;
        // When the toggle goes on, null out billing_* columns to keep the
        // record clean. Callers that send both true + billing_street get
        // the toggle's intent honored.
        if (out.billing_same_as_shipping === true) {
          for (const k of ['billing_street','billing_city','billing_state','billing_zip','billing_country']) {
            if (out[k] === undefined) out[k] = null;
            else if (out[k] != null)  out[k] = null;
          }
        }
      }
    }

    if (req.body.notification_preferences !== undefined) {
      const cleaned = sanitizeNotificationPrefs(req.body.notification_preferences);
      if (cleaned === null) errors.push('notification_preferences must be an object of boolean toggles');
      else out.notification_preferences = cleaned;
    }

    if (errors.length) return badRequest(res, 'Invalid payload', errors);
    const fields = Object.keys(out);
    if (fields.length === 0) return badRequest(res, 'No fields to update');

    const sets = fields.map((f, i) => `${f} = $${i + 1}`);
    const params = fields.map((f) => out[f]);
    params.push(req.user.company_id);

    const { rowCount } = await query(
      `UPDATE companies
          SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${params.length}
          AND deleted_at IS NULL`,
      params
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Workspace not found' });
    }
    const fresh = await loadWorkspace(req.user.company_id);

    return res.json({ workspace: publicCompany(fresh) });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/workspace/cancel-subscription â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// End-user-admin only. Schedules cancellation for the first day of next
// month (status stays 'active' until then). A nightly job flips status
// to 'canceled' on/after the effective date.
async function scheduleCancel(req, res, next) {
  try {
    const companyId  = req.user.company_id;
    const reasonCode = (req.body?.reason_code ?? '').toString().trim();
    const details    = (req.body?.details ?? '').toString().trim() || null;

    if (!ALLOWED_CANCELLATION_REASON_CODES.has(reasonCode)) {
      return badRequest(res,
        `reason_code must be one of: ${[...ALLOWED_CANCELLATION_REASON_CODES].join(', ')}`);
    }

    // Only end-users self-cancel. Resellers and the platform company use
    // different flows.
    const { rows: companyRows } = await query(
      `SELECT company_type, status, cancel_effective_at, parent_company_id
         FROM companies WHERE id = $1 AND deleted_at IS NULL`,
      [companyId]
    );
    if (companyRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Workspace not found' });
    }
    const row = companyRows[0];
    if (row.company_type !== 'end_user') {
      return res.status(403).json({
        error:   'Forbidden',
        message: 'Self-service cancellation is only available for end-user companies.',
      });
    }
    if (row.status !== 'active') {
      return res.status(409).json({
        error:   'Conflict',
        message: `Cannot schedule cancellation: workspace is ${row.status}.`,
      });
    }
    if (row.cancel_effective_at) {
      return res.status(409).json({
        error:   'Conflict',
        message: 'A cancellation is already scheduled. Undo it before scheduling a new one.',
      });
    }

    // Effective date = first day of next month, so the tenant keeps access
    // through the rest of the current calendar month.
    const { rows } = await query(
      `UPDATE companies
          SET cancel_effective_at      = date_trunc('month', NOW()) + INTERVAL '1 month',
              canceled_by              = $2,
              cancellation_reason_code = $3,
              cancellation_reason      = $4,
              updated_at               = NOW()
        WHERE id = $1
    RETURNING cancel_effective_at`,
      [companyId, req.user.user_id, reasonCode, details]
    );
    recordAudit(req, 'subscription.cancel_scheduled', {
      target_type: 'company',
      target_id:   companyId,
      metadata:    {
        reason_code: reasonCode,
        details,
        effective_at: rows[0].cancel_effective_at,
        source: 'self_service',
      },
    });

    void events.emit('company.subscription_cancelled', {
      company:  { id: companyId, type: 'end_user' },
      reseller: row.parent_company_id ? { company_id: row.parent_company_id } : undefined,
      actor:    { user_id: req.user.user_id },
      cancellation: {
        reason_code:        reasonCode,
        cancel_effective_at: rows[0].cancel_effective_at,
      },
    });

    return res.json({
      ok: true,
      cancel_effective_at: rows[0].cancel_effective_at,
    });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/workspace/cancel-subscription/undo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Withdraw a scheduled cancellation. Clears the schedule + the recorded
// reason so a future re-cancel starts fresh.
async function undoScheduledCancel(req, res, next) {
  try {
    const companyId = req.user.company_id;

    const { rows } = await query(
      `UPDATE companies
          SET cancel_effective_at      = NULL,
              canceled_by              = NULL,
              cancellation_reason_code = NULL,
              cancellation_reason      = NULL,
              updated_at               = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
          AND cancel_effective_at IS NOT NULL
          AND status = 'active'
    RETURNING id`,
      [companyId]
    );
    if (rows.length === 0) {
      return res.status(409).json({
        error:   'Conflict',
        message: 'No pending cancellation to undo.',
      });
    }
    recordAudit(req, 'subscription.cancel_undo', {
      target_type: 'company',
      target_id:   companyId,
    });

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ GET /api/workspace/resellers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Public-within-the-app list of active resellers, for the end-user
// attach flow's search-and-pick. Returns the minimum needed for a
// picker: id + display name. No counts, no internal codes.
async function listResellers(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT id, name
         FROM companies
        WHERE company_type = 'reseller'
          AND status = 'active'
          AND deleted_at IS NULL
        ORDER BY name`
    );
    return res.json({ resellers: rows });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/workspace/attach-reseller â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// End-user-admin only. One-shot: links the caller's company to a
// reseller by id, sets parent_locked_at, refuses if already linked.
// Platform admins use a separate endpoint to override.
async function attachReseller(req, res, next) {
  try {
    const companyId  = req.user.company_id;
    const resellerId = Number(req.body?.reseller_id);

    if (!Number.isFinite(resellerId) || resellerId <= 0) {
      return badRequest(res, 'reseller_id is required');
    }

    // Caller must be an end_user. Resellers and the platform company can
    // never have a parent.
    const { rows: meRows } = await query(
      `SELECT id, company_type, parent_company_id, name
         FROM companies WHERE id = $1 AND deleted_at IS NULL`,
      [companyId]
    );
    if (meRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Workspace not found' });
    }
    const me = meRows[0];
    if (me.company_type !== 'end_user') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only end-user workspaces can attach to a reseller.',
      });
    }
    if (me.parent_company_id) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'This workspace is already attached to a reseller. Contact support to change it.',
      });
    }

    // Look up the reseller by id. Only active resellers can be attached
    // to; suspended / canceled / deleted ones return the same "not
    // found" so we don't leak existence.
    const { rows: rRows } = await query(
      `SELECT id, name FROM companies
        WHERE id = $1
          AND company_type = 'reseller'
          AND status = 'active'
          AND deleted_at IS NULL`,
      [resellerId]
    );
    if (rRows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'That reseller is no longer available.',
      });
    }
    const reseller = rRows[0];

    await query(
      `UPDATE companies
          SET parent_company_id = $2,
              parent_locked_at  = NOW(),
              updated_at        = NOW()
        WHERE id = $1`,
      [companyId, reseller.id]
    );

    recordAudit(req, 'company.reseller_attached', {
      target_type: 'company',
      target_id:   companyId,
      metadata:    {
        reseller_id:   reseller.id,
        reseller_name: reseller.name,
        source:        'self_service',
      },
    });

    const fresh = await loadWorkspace(companyId);
    return res.json({ workspace: publicCompany(fresh) });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  get, update,
  scheduleCancel, undoScheduledCancel,
  attachReseller, listResellers,
};
