/**
 * Credentials controller — PINs, HID cards, MIFARE cards.
 *
 * Tenant-scoped via req.user.company_id. Soft delete via deleted_at.
 *
 * Note: credential_value (PIN) is stored plain because the firmware compares
 * against it directly. See the TODO in 010_create_credentials.sql.
 */

const { query } = require('../../database/db');

const ALLOWED_TYPES    = ['pin', 'HID', 'mifare'];
const ALLOWED_STATUSES = ['active', 'inactive'];

function badRequest(res, message, details) {
  return res.status(400).json({ error: 'Bad Request', message, ...(details && { details }) });
}

function notFound(res) {
  return res.status(404).json({ error: 'Not Found', message: 'Credential not found' });
}

function conflict(res, message) {
  return res.status(409).json({ error: 'Conflict', message });
}

/**
 * A company can't hold two credentials with the same value — the door only
 * compares values, so duplicates are ambiguous (and break the event→person
 * matching in the webhook receiver). Enforced by the unique indexes in
 * migration 071; this lookup exists to return a friendly message instead
 * of a raw constraint error. Returns the conflicting row or null.
 */
async function findDuplicate(companyId, d) {
  if (d.credential_type === 'pin') {
    const { rows } = await query(
      `SELECT id, credential_name FROM credentials
        WHERE company_id = $1 AND credential_type = 'pin'
          AND credential_value = $2 AND deleted_at IS NULL
        LIMIT 1`,
      [companyId, d.credential_value]
    );
    return rows[0] ?? null;
  }
  // Card: same number, regardless of facility code or card type — event
  // payloads may omit the facility code, so number alone must be unambiguous.
  const { rows } = await query(
    `SELECT id, credential_name FROM credentials
      WHERE company_id = $1 AND card_number = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [companyId, d.card_number]
  );
  return rows[0] ?? null;
}

/** True when err is a violation of one of the migration-071 unique indexes. */
function isDuplicateCredentialError(err) {
  return err?.code === '23505' &&
    (err.constraint === 'uq_credentials_company_pin' ||
     err.constraint === 'uq_credentials_company_card');
}

function duplicateMessage(type) {
  return type === 'pin'
    ? 'This PIN is already in use in this workspace'
    : 'A card with this number is already in this workspace';
}

function publicCredential(row) {
  return {
    id:               row.id,
    person_id:        row.person_id,
    // Present when the SELECT joined `people`; null on endpoints that
    // don't (e.g. create / update RETURNING). Frontend treats these as
    // optional.
    person_first_name:  row.person_first_name  ?? null,
    person_last_name:   row.person_last_name   ?? null,
    person_employee_id: row.person_employee_id ?? null,
    credential_name:  row.credential_name,
    credential_type:  row.credential_type,
    credential_value: row.credential_value,
    facility_code:    row.facility_code,
    card_number:      row.card_number,
    status:           row.status,
    valid_from:       row.valid_from,
    valid_until:      row.valid_until,
    description:      row.description,
    notes:            row.notes,
    created_at:       row.created_at,
    updated_at:       row.updated_at,
  };
}

function validatePayload(body, { partial = false } = {}) {
  const errors = [];
  const out = {};

  const setIfPresent = (key, transform = (v) => v) => {
    if (body[key] !== undefined) out[key] = transform(body[key]);
  };

  // credential_type — required on create, immutable on update.
  if (!partial) {
    if (!ALLOWED_TYPES.includes(body.credential_type)) {
      errors.push(`credential_type must be one of: ${ALLOWED_TYPES.join(', ')}`);
    } else {
      out.credential_type = body.credential_type;
    }
  } else if (body.credential_type !== undefined) {
    errors.push('credential_type is immutable; delete and recreate to change');
  }

  // credential_name — required on create.
  if (!partial || body.credential_name !== undefined) {
    const v = (body.credential_name ?? '').toString().trim();
    if (!v) errors.push('credential_name is required');
    else if (v.length > 255) errors.push('credential_name too long');
    else out.credential_name = v;
  }

  // person_id — optional. If supplied, must be a number (we'll verify
  // it belongs to the company below in the controller).
  if (body.person_id !== undefined) {
    if (body.person_id === null) {
      out.person_id = null;
    } else {
      const n = Number(body.person_id);
      if (!Number.isInteger(n) || n <= 0) errors.push('person_id must be a positive integer or null');
      else out.person_id = n;
    }
  }

  // Type-specific bits — validated only when type is known.
  const t = out.credential_type ?? (partial ? null : null);
  if (t === 'pin') {
    if (body.credential_value !== undefined) {
      const v = String(body.credential_value).trim();
      if (!/^[0-9]{5,8}$/.test(v)) errors.push('PIN must be 5–8 digits');
      else out.credential_value = v;
    } else if (!partial) {
      errors.push('credential_value (PIN) is required for type=pin');
    }
  }
  if (t === 'HID' || t === 'mifare') {
    if (body.card_number !== undefined) {
      const v = String(body.card_number).trim();
      if (!v) errors.push('card_number is required for card credentials');
      else if (v.length > 100) errors.push('card_number too long');
      else out.card_number = v;
    } else if (!partial) {
      errors.push('card_number is required for type=HID|mifare');
    }
    if (body.facility_code !== undefined) {
      const v = body.facility_code === null ? null : String(body.facility_code).trim() || null;
      out.facility_code = v;
    }
  }

  setIfPresent('description', (v) => (v ?? null) && String(v).trim() || null);
  setIfPresent('notes',       (v) => (v ?? null) && String(v).trim() || null);

  if (body.status !== undefined) {
    if (!ALLOWED_STATUSES.includes(body.status)) {
      errors.push(`status must be one of: ${ALLOWED_STATUSES.join(', ')}`);
    } else {
      out.status = body.status;
    }
  }

  // valid_from / valid_until are intentionally not surfaced — the product
  // has no expiration concept today. Columns remain in the schema for the
  // future scheduled-access feature.

  return { ok: errors.length === 0, errors, data: out };
}

async function personBelongsToCompany(personId, companyId) {
  if (personId == null) return true;
  const { rows } = await query(
    'SELECT 1 FROM people WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL',
    [personId, companyId]
  );
  return rows.length > 0;
}

// ── GET /api/credentials?person_id=X&status=Y&type=Z ──────────────────────────
async function list(req, res, next) {
  try {
    const companyId = req.user.company_id;
    const filters = [companyId];
    let where = 'c.company_id = $1 AND c.deleted_at IS NULL';

    if (req.query.person_id) {
      filters.push(Number(req.query.person_id));
      where += ` AND c.person_id = $${filters.length}`;
    }
    if (req.query.status && ALLOWED_STATUSES.includes(req.query.status)) {
      filters.push(req.query.status);
      where += ` AND c.status = $${filters.length}`;
    }
    if (req.query.type && ALLOWED_TYPES.includes(req.query.type)) {
      filters.push(req.query.type);
      where += ` AND c.credential_type = $${filters.length}`;
    }

    // LEFT JOIN people so each credential row carries the owner's name
    // for UI surfaces (e.g. the per-device "Add credential" picker) that
    // would otherwise need a second round-trip to look it up.
    const { rows } = await query(
      `SELECT c.id, c.person_id,
              p.first_name  AS person_first_name,
              p.last_name   AS person_last_name,
              p.employee_id AS person_employee_id,
              c.credential_name, c.credential_type, c.credential_value,
              c.facility_code, c.card_number, c.status,
              c.valid_from, c.valid_until,
              c.description, c.notes, c.created_at, c.updated_at
         FROM credentials c
         LEFT JOIN people p ON p.id = c.person_id AND p.deleted_at IS NULL
        WHERE ${where}
        ORDER BY c.created_at DESC`,
      filters
    );

    return res.json({ credentials: rows.map(publicCredential) });
  } catch (err) {
    return next(err);
  }
}

// ── GET /api/credentials/:id ──────────────────────────────────────────────────
async function get(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT id, person_id, credential_name, credential_type, credential_value,
              facility_code, card_number, status, valid_from, valid_until,
              description, notes, created_at, updated_at
         FROM credentials
        WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
      [Number(req.params.id), req.user.company_id]
    );
    if (rows.length === 0) return notFound(res);
    return res.json({ credential: publicCredential(rows[0]) });
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/credentials ─────────────────────────────────────────────────────
async function create(req, res, next) {
  try {
    const v = validatePayload(req.body);
    if (!v.ok) return badRequest(res, 'Invalid payload', v.errors);

    const d = v.data;
    if (!(await personBelongsToCompany(d.person_id ?? null, req.user.company_id))) {
      return badRequest(res, 'person_id is not in this workspace');
    }

    const dupe = await findDuplicate(req.user.company_id, d);
    if (dupe) {
      return conflict(res, `${duplicateMessage(d.credential_type)} ("${dupe.credential_name}")`);
    }

    const { rows } = await query(
      `INSERT INTO credentials (
         company_id, person_id, credential_name, credential_type,
         credential_value, facility_code, card_number,
         status, valid_from, valid_until, description, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, person_id, credential_name, credential_type, credential_value,
                 facility_code, card_number, status, valid_from, valid_until,
                 description, notes, created_at, updated_at`,
      [
        req.user.company_id,
        d.person_id ?? null,
        d.credential_name,
        d.credential_type,
        d.credential_value ?? null,
        d.facility_code  ?? null,
        d.card_number    ?? null,
        d.status         ?? 'active',
        d.valid_from     ?? null,
        d.valid_until    ?? null,
        d.description    ?? null,
        d.notes          ?? null,
      ]
    );
    return res.status(201).json({ credential: publicCredential(rows[0]) });
  } catch (err) {
    // Race backstop: two concurrent creates can both pass the pre-check;
    // the unique index catches the loser.
    if (isDuplicateCredentialError(err)) {
      return conflict(res, duplicateMessage(req.body?.credential_type));
    }
    return next(err);
  }
}

// ── PATCH /api/credentials/:id ────────────────────────────────────────────────
async function update(req, res, next) {
  try {
    const v = validatePayload(req.body, { partial: true });
    if (!v.ok) return badRequest(res, 'Invalid payload', v.errors);

    const fields = Object.keys(v.data);
    if (fields.length === 0) return badRequest(res, 'No fields to update');

    if (v.data.person_id !== undefined &&
        !(await personBelongsToCompany(v.data.person_id, req.user.company_id))) {
      return badRequest(res, 'person_id is not in this workspace');
    }

    const sets = fields.map((f, i) => `${f} = $${i + 1}`);
    const params = fields.map((f) => v.data[f]);
    params.push(Number(req.params.id), req.user.company_id);

    const { rows } = await query(
      `UPDATE credentials
          SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${params.length - 1}
          AND company_id = $${params.length}
          AND deleted_at IS NULL
        RETURNING id, person_id, credential_name, credential_type, credential_value,
                  facility_code, card_number, status, valid_from, valid_until,
                  description, notes, created_at, updated_at`,
      params
    );
    if (rows.length === 0) return notFound(res);
    return res.json({ credential: publicCredential(rows[0]) });
  } catch (err) {
    // PATCH can't change credential_value/card_number today (type-specific
    // fields are dropped by the partial validator), but keep the backstop
    // in case that changes.
    if (isDuplicateCredentialError(err)) {
      return conflict(res, 'Another credential in this workspace already uses this value');
    }
    return next(err);
  }
}

// ── DELETE /api/credentials/:id ───────────────────────────────────────────────
async function destroy(req, res, next) {
  try {
    const { rowCount } = await query(
      `UPDATE credentials
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
