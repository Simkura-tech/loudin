/**
 * People groups controller — flat (single-level) groupings of people for
 * access-rule bundling later. Each person belongs to at most one group.
 *
 * Tenant-scoped via req.user.company_id. Soft delete. The schema's
 * ON DELETE SET NULL on people.group_id means deleting a group unassigns
 * its members rather than cascading their deletion.
 */

const { query } = require('../../database/db');

const ALLOWED_STATUSES = ['active', 'inactive'];

function badRequest(res, message, details) {
  return res.status(400).json({ error: 'Bad Request', message, ...(details && { details }) });
}

function notFound(res) {
  return res.status(404).json({ error: 'Not Found', message: 'Group not found' });
}

function publicGroup(row) {
  return {
    id:           row.id,
    name:         row.name,
    description:  row.description,
    status:       row.status,
    member_count: row.member_count ?? 0,
    created_at:   row.created_at,
    updated_at:   row.updated_at,
  };
}

function validatePayload(body, { partial = false } = {}) {
  const errors = [];
  const out = {};

  if (!partial || body.name !== undefined) {
    const v = (body.name ?? '').toString().trim();
    if (!v) errors.push('name is required');
    else if (v.length > 255) errors.push('name too long');
    else out.name = v;
  }

  if (body.description !== undefined) {
    out.description = body.description === null
      ? null
      : (String(body.description).trim() || null);
  }

  if (body.status !== undefined) {
    if (!ALLOWED_STATUSES.includes(body.status)) {
      errors.push(`status must be one of: ${ALLOWED_STATUSES.join(', ')}`);
    } else {
      out.status = body.status;
    }
  }

  return { ok: errors.length === 0, errors, data: out };
}

// ── GET /api/people-groups ────────────────────────────────────────────────────
async function list(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT g.id, g.name, g.description, g.status, g.created_at, g.updated_at,
              COALESCE(p.cnt, 0)::int AS member_count
         FROM people_groups g
    LEFT JOIN (
              SELECT group_id, COUNT(*) AS cnt
                FROM people
               WHERE deleted_at IS NULL AND group_id IS NOT NULL
            GROUP BY group_id
         ) p ON p.group_id = g.id
        WHERE g.company_id = $1 AND g.deleted_at IS NULL
     ORDER BY g.name`,
      [req.user.company_id]
    );
    return res.json({ groups: rows.map(publicGroup) });
  } catch (err) {
    return next(err);
  }
}

// ── GET /api/people-groups/:id ────────────────────────────────────────────────
async function get(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT g.id, g.name, g.description, g.status, g.created_at, g.updated_at,
              (SELECT COUNT(*)::int FROM people
                WHERE group_id = g.id AND deleted_at IS NULL) AS member_count
         FROM people_groups g
        WHERE g.id = $1 AND g.company_id = $2 AND g.deleted_at IS NULL`,
      [Number(req.params.id), req.user.company_id]
    );
    if (rows.length === 0) return notFound(res);
    return res.json({ group: publicGroup(rows[0]) });
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/people-groups ───────────────────────────────────────────────────
async function create(req, res, next) {
  try {
    const v = validatePayload(req.body);
    if (!v.ok) return badRequest(res, 'Invalid payload', v.errors);

    const d = v.data;
    try {
      const { rows } = await query(
        `INSERT INTO people_groups (company_id, name, description, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, description, status, created_at, updated_at`,
        [req.user.company_id, d.name, d.description ?? null, d.status ?? 'active']
      );
      return res.status(201).json({ group: publicGroup({ ...rows[0], member_count: 0 }) });
    } catch (e) {
      if (e.code === '23505') {
        return res.status(409).json({ error: 'Conflict', message: 'A group with this name already exists' });
      }
      throw e;
    }
  } catch (err) {
    return next(err);
  }
}

// ── PATCH /api/people-groups/:id ──────────────────────────────────────────────
async function update(req, res, next) {
  try {
    const v = validatePayload(req.body, { partial: true });
    if (!v.ok) return badRequest(res, 'Invalid payload', v.errors);

    const fields = Object.keys(v.data);
    if (fields.length === 0) return badRequest(res, 'No fields to update');

    const sets = fields.map((f, i) => `${f} = $${i + 1}`);
    const params = fields.map((f) => v.data[f]);
    params.push(Number(req.params.id), req.user.company_id);

    try {
      const { rows } = await query(
        `UPDATE people_groups
            SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
          WHERE id = $${params.length - 1}
            AND company_id = $${params.length}
            AND deleted_at IS NULL
          RETURNING id, name, description, status, created_at, updated_at`,
        params
      );
      if (rows.length === 0) return notFound(res);

      // Re-fetch the member count rather than recomputing inline.
      const { rows: counts } = await query(
        `SELECT COUNT(*)::int AS n FROM people WHERE group_id = $1 AND deleted_at IS NULL`,
        [rows[0].id]
      );
      return res.json({ group: publicGroup({ ...rows[0], member_count: counts[0].n }) });
    } catch (e) {
      if (e.code === '23505') {
        return res.status(409).json({ error: 'Conflict', message: 'A group with this name already exists' });
      }
      throw e;
    }
  } catch (err) {
    return next(err);
  }
}

// ── DELETE /api/people-groups/:id ─────────────────────────────────────────────
// Soft-delete. people.group_id rows are not touched here — the FK's
// ON DELETE SET NULL handles hard deletes only. For consistency with the
// product's "removing a group unassigns its members" promise, we explicitly
// NULL out group_id on every member at delete time.
async function destroy(req, res, next) {
  try {
    const id = Number(req.params.id);
    const companyId = req.user.company_id;

    const { rowCount } = await query(
      `UPDATE people_groups
          SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
      [id, companyId]
    );
    if (rowCount === 0) return notFound(res);

    await query(
      `UPDATE people
          SET group_id = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE group_id = $1 AND company_id = $2`,
      [id, companyId]
    );
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, get, create, update, destroy };
