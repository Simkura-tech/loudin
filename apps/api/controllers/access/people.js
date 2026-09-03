/**
 * People controller — door-access credential holders.
 *
 * All routes are tenant-scoped to req.user.company_id. Soft delete via
 * deleted_at; queries always filter it out.
 *
 * No cross-company access; even Platform Admins go through this same path
 * (they'd impersonate / switch company context separately when that's
 * reintroduced).
 */

const { query } = require('../../database/db');
const events = require('../../integrations/events');

const ALLOWED_STATUSES = ['active', 'inactive', 'suspended'];
const MAX_LIMIT = 200;

function badRequest(res, message, details) {
  return res.status(400).json({ error: 'Bad Request', message, ...(details && { details }) });
}

function notFound(res) {
  return res.status(404).json({ error: 'Not Found', message: 'Person not found' });
}

function publicPerson(row) {
  return {
    id:           row.id,
    first_name:   row.first_name,
    last_name:    row.last_name,
    email:        row.email,
    phone_number: row.phone_number,
    employee_id:  row.employee_id,
    department:   row.department,
    job_title:    row.job_title,
    status:       row.status,
    notes:        row.notes,
    group_id:     row.group_id ?? null,
    group_name:   row.group_name ?? null,
    created_at:   row.created_at,
    updated_at:   row.updated_at,
  };
}

function validatePayload(body, { partial = false } = {}) {
  const errors = [];
  const out = {};

  const setIfPresent = (key, transform = (v) => v) => {
    if (body[key] !== undefined) out[key] = transform(body[key]);
  };

  // Required (on create only)
  if (!partial || body.first_name !== undefined) {
    const v = (body.first_name ?? '').toString().trim();
    if (!v) errors.push('first_name is required');
    else if (v.length > 100) errors.push('first_name too long');
    else out.first_name = v;
  }
  if (!partial || body.last_name !== undefined) {
    const v = (body.last_name ?? '').toString().trim();
    if (!v) errors.push('last_name is required');
    else if (v.length > 100) errors.push('last_name too long');
    else out.last_name = v;
  }

  // Optional
  setIfPresent('email',        (v) => (v ?? null) && String(v).trim().toLowerCase() || null);
  setIfPresent('phone_number', (v) => (v ?? null) && String(v).trim() || null);
  setIfPresent('employee_id',  (v) => (v ?? null) && String(v).trim() || null);
  setIfPresent('department',   (v) => (v ?? null) && String(v).trim() || null);
  setIfPresent('job_title',    (v) => (v ?? null) && String(v).trim() || null);
  setIfPresent('notes',        (v) => (v ?? null) && String(v).trim() || null);

  if (body.status !== undefined) {
    if (!ALLOWED_STATUSES.includes(body.status)) {
      errors.push(`status must be one of: ${ALLOWED_STATUSES.join(', ')}`);
    } else {
      out.status = body.status;
    }
  }

  if (body.group_id !== undefined) {
    if (body.group_id === null || body.group_id === '') {
      out.group_id = null;
    } else {
      const n = Number(body.group_id);
      if (!Number.isInteger(n) || n <= 0) errors.push('group_id must be a positive integer or null');
      else out.group_id = n;
    }
  }

  return { ok: errors.length === 0, errors, data: out };
}

async function groupBelongsToCompany(groupId, companyId) {
  if (groupId == null) return true;
  const { rows } = await query(
    'SELECT 1 FROM people_groups WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL',
    [groupId, companyId]
  );
  return rows.length > 0;
}

// ── GET /api/people ───────────────────────────────────────────────────────────
//   ?search=…   matches first_name / last_name / email / employee_id (ILIKE)
//   ?status=active|inactive|suspended
//   ?group_id=…    'none' filters to people with no group; integer filters by id
//   ?limit=…&offset=…   (limit clamped to MAX_LIMIT)
async function list(req, res, next) {
  try {
    const companyId = req.user.company_id;
    const limit  = Math.min(Number(req.query.limit)  || 50, MAX_LIMIT);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const search = (req.query.search || '').toString().trim();
    const status = req.query.status;
    const groupFilter = req.query.group_id;

    const filterParams = [companyId];
    let where = 'p.company_id = $1 AND p.deleted_at IS NULL';

    if (status && ALLOWED_STATUSES.includes(status)) {
      filterParams.push(status);
      where += ` AND p.status = $${filterParams.length}`;
    }

    if (groupFilter === 'none') {
      where += ' AND p.group_id IS NULL';
    } else if (groupFilter !== undefined && groupFilter !== '') {
      const n = Number(groupFilter);
      if (Number.isInteger(n) && n > 0) {
        filterParams.push(n);
        where += ` AND p.group_id = $${filterParams.length}`;
      }
    }

    if (search) {
      filterParams.push(`%${search}%`);
      const idx = filterParams.length;
      where += ` AND (p.first_name ILIKE $${idx} OR p.last_name ILIKE $${idx}
                       OR p.email ILIKE $${idx} OR p.employee_id ILIKE $${idx})`;
    }

    const listParams = [...filterParams, limit, offset];
    const lim = `$${listParams.length - 1}`;
    const off = `$${listParams.length}`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT p.id, p.first_name, p.last_name, p.email, p.phone_number, p.employee_id,
                p.department, p.job_title, p.status, p.notes,
                p.group_id, g.name AS group_name,
                p.created_at, p.updated_at
           FROM people p
      LEFT JOIN people_groups g
             ON g.id = p.group_id AND g.deleted_at IS NULL
          WHERE ${where}
          ORDER BY p.last_name, p.first_name
          LIMIT ${lim} OFFSET ${off}`,
        listParams
      ),
      query(`SELECT COUNT(*)::int AS n FROM people p WHERE ${where}`, filterParams),
    ]);

    return res.json({ people: rows.map(publicPerson), total: countRows[0].n, limit, offset });
  } catch (err) {
    return next(err);
  }
}

// ── GET /api/people/:id ───────────────────────────────────────────────────────
async function get(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT p.id, p.first_name, p.last_name, p.email, p.phone_number, p.employee_id,
              p.department, p.job_title, p.status, p.notes,
              p.group_id, g.name AS group_name,
              p.created_at, p.updated_at
         FROM people p
    LEFT JOIN people_groups g
           ON g.id = p.group_id AND g.deleted_at IS NULL
        WHERE p.id = $1 AND p.company_id = $2 AND p.deleted_at IS NULL`,
      [Number(req.params.id), req.user.company_id]
    );
    if (rows.length === 0) return notFound(res);
    return res.json({ person: publicPerson(rows[0]) });
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/people ──────────────────────────────────────────────────────────
async function create(req, res, next) {
  try {
    const v = validatePayload(req.body);
    if (!v.ok) return badRequest(res, 'Invalid payload', v.errors);

    const d = v.data;
    if (d.group_id !== undefined &&
        !(await groupBelongsToCompany(d.group_id, req.user.company_id))) {
      return badRequest(res, 'group_id is not in this workspace');
    }

    const { rows } = await query(
      `WITH inserted AS (
         INSERT INTO people (
           company_id, first_name, last_name, email, phone_number, employee_id,
           department, job_title, status, notes, group_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *
       )
       SELECT p.id, p.first_name, p.last_name, p.email, p.phone_number, p.employee_id,
              p.department, p.job_title, p.status, p.notes,
              p.group_id, g.name AS group_name,
              p.created_at, p.updated_at
         FROM inserted p
    LEFT JOIN people_groups g
           ON g.id = p.group_id AND g.deleted_at IS NULL`,
      [
        req.user.company_id,
        d.first_name, d.last_name,
        d.email ?? null, d.phone_number ?? null, d.employee_id ?? null,
        d.department ?? null, d.job_title ?? null,
        d.status ?? 'active',
        d.notes ?? null,
        d.group_id ?? null,
      ]
    );
    // First credential holder = the company has moved from evaluating to
    // actually setting up staff access — a positive-engagement signal.
    // Fire-and-forget; count-after-insert === 1 means this was the first.
    void (async () => {
      const [{ rows: [cnt] }, { rows: [comp] }] = await Promise.all([
        query(
          `SELECT COUNT(*)::int AS n FROM people
            WHERE company_id = $1 AND deleted_at IS NULL`,
          [req.user.company_id]
        ),
        query(
          `SELECT company_type, parent_company_id FROM companies WHERE id = $1`,
          [req.user.company_id]
        ),
      ]);
      if (cnt.n === 1 && comp) {
        void events.emit('company.first_person_added', {
          company:  { id: req.user.company_id, type: comp.company_type },
          actor:    { user_id: req.user.user_id },
          person:   { person_id: rows[0].id },
        });
      }
    })().catch((err) => console.error('[people.create] first-person emit failed:', err.message));

    return res.status(201).json({ person: publicPerson(rows[0]) });
  } catch (err) {
    return next(err);
  }
}

// ── PATCH /api/people/:id ─────────────────────────────────────────────────────
async function update(req, res, next) {
  try {
    const v = validatePayload(req.body, { partial: true });
    if (!v.ok) return badRequest(res, 'Invalid payload', v.errors);

    const fields = Object.keys(v.data);
    if (fields.length === 0) return badRequest(res, 'No fields to update');

    if (v.data.group_id !== undefined &&
        !(await groupBelongsToCompany(v.data.group_id, req.user.company_id))) {
      return badRequest(res, 'group_id is not in this workspace');
    }

    const sets = fields.map((f, i) => `${f} = $${i + 1}`);
    const params = fields.map((f) => v.data[f]);
    params.push(Number(req.params.id), req.user.company_id);

    const { rows } = await query(
      `WITH updated AS (
         UPDATE people
            SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
          WHERE id = $${params.length - 1}
            AND company_id = $${params.length}
            AND deleted_at IS NULL
          RETURNING *
       )
       SELECT p.id, p.first_name, p.last_name, p.email, p.phone_number, p.employee_id,
              p.department, p.job_title, p.status, p.notes,
              p.group_id, g.name AS group_name,
              p.created_at, p.updated_at
         FROM updated p
    LEFT JOIN people_groups g
           ON g.id = p.group_id AND g.deleted_at IS NULL`,
      params
    );
    if (rows.length === 0) return notFound(res);
    return res.json({ person: publicPerson(rows[0]) });
  } catch (err) {
    return next(err);
  }
}

// ── DELETE /api/people/:id ────────────────────────────────────────────────────
// Soft delete — keeps audit-log integrity in any future credential records.
async function destroy(req, res, next) {
  try {
    const { rowCount } = await query(
      `UPDATE people
          SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
      [Number(req.params.id), req.user.company_id]
    );
    if (rowCount === 0) return notFound(res);
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, get, create, update, destroy };
