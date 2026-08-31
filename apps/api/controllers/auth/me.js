/**
 * /api/me — the signed-in user's own profile.
 *
 * Self-service: requireAdmin is NOT applied to these endpoints. Anyone with
 * a valid session can edit their own name / phone or change their password.
 *
 * Reading the user lives on /api/auth/me (existing) — this controller is
 * write-side: profile updates and password changes.
 */

const { query } = require('../../database/db');
const { hashPassword, comparePassword, validatePasswordStrength } = require('../../utils/password');

const EDITABLE_PROFILE_FIELDS = ['first_name', 'last_name', 'phone_number'];

function badRequest(res, message, details) {
  return res.status(400).json({ error: 'Bad Request', message, ...(details && { details }) });
}

function publicProfile(row, company) {
  return {
    id:             row.id,
    email:          row.email,
    first_name:     row.first_name,
    last_name:      row.last_name,
    phone_number:   row.phone_number,
    user_type_id:   row.user_type_id,
    company_id:     row.company_id,
    email_verified: row.email_verified,
    phone_verified: row.phone_verified,
    company_type:   company.company_type,
    company_name:   company.name,
  };
}

// ── PATCH /api/me ─────────────────────────────────────────────────────────────
async function updateProfile(req, res, next) {
  try {
    const out = {};
    const errors = [];

    for (const k of Object.keys(req.body || {})) {
      if (!EDITABLE_PROFILE_FIELDS.includes(k)) {
        errors.push(`field "${k}" is not editable`);
      }
    }

    if (req.body.first_name !== undefined) {
      const v = String(req.body.first_name).trim();
      if (!v)                  errors.push('first_name cannot be empty');
      else if (v.length > 100) errors.push('first_name too long');
      else                     out.first_name = v;
    }
    if (req.body.last_name !== undefined) {
      const v = String(req.body.last_name).trim();
      if (!v)                  errors.push('last_name cannot be empty');
      else if (v.length > 100) errors.push('last_name too long');
      else                     out.last_name = v;
    }
    if (req.body.phone_number !== undefined) {
      const raw = req.body.phone_number;
      const v = raw === null ? null : (String(raw).trim() || null);
      if (v && v.length > 50) errors.push('phone_number too long');
      else out.phone_number = v;
    }

    if (errors.length) return badRequest(res, 'Invalid payload', errors);
    const fields = Object.keys(out);
    if (fields.length === 0) return badRequest(res, 'No fields to update');

    const sets = fields.map((f, i) => `${f} = $${i + 1}`);
    const params = fields.map((f) => out[f]);
    params.push(req.user.user_id);

    const { rows } = await query(
      `WITH updated AS (
         UPDATE users
            SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
          WHERE id = $${params.length}
          RETURNING *
       )
       SELECT u.id, u.email, u.first_name, u.last_name, u.phone_number,
              u.user_type_id, u.company_id, u.email_verified, u.phone_verified,
              c.company_type, c.name
         FROM updated u
         JOIN companies c ON c.id = u.company_id`,
      params
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }
    const row = rows[0];
    return res.json({
      user: publicProfile(row, { company_type: row.company_type, name: row.name }),
    });
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/me/password ─────────────────────────────────────────────────────
async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return badRequest(res, 'current_password and new_password are required');
    }

    const strength = validatePasswordStrength(new_password);
    if (!strength.isValid) {
      return badRequest(res, 'New password does not meet requirements', strength.errors);
    }
    if (current_password === new_password) {
      return badRequest(res, 'New password must be different from the current password');
    }

    const { rows } = await query(
      'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
      [req.user.user_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }
    const ok = await comparePassword(current_password, rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Current password is incorrect' });
    }

    const newHash = await hashPassword(new_password);
    await query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newHash, req.user.user_id]
    );
    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = { updateProfile, changePassword };
