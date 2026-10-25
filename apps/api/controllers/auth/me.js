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
const otp = require('../../services/auth/otp');
const notifier = require('../../services/notifications/notifier');

const EDITABLE_PROFILE_FIELDS = ['first_name', 'last_name', 'phone_number'];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function badRequest(res, message, details) {
  return res.status(400).json({ error: 'Bad Request', message, ...(details && { details }) });
}

/** "alice@example.com" → "a••••@example.com" — hint without disclosing. */
function maskEmail(dest) {
  const [user, domain] = String(dest).split('@');
  if (!domain) return dest;
  const head = user[0] ?? '';
  return `${head}${'•'.repeat(Math.max(1, user.length - 1))}@${domain}`;
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

// ── POST /api/me/email ────────────────────────────────────────────────────────
// Body: { new_email, current_password? }. Starts an email change: parks the
// new address in users.pending_email and sends a confirmation code TO that
// address. current_password is required for password accounts (so a hijacked
// session can't silently move the login address); OAuth-only accounts (no
// password_hash) skip it. Nothing changes until confirmEmailChange().
async function requestEmailChange(req, res, next) {
  try {
    const { new_email, current_password } = req.body || {};
    if (!new_email) return badRequest(res, 'new_email is required');
    const normalized = String(new_email).trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) return badRequest(res, 'Enter a valid email address');

    const { rows } = await query(
      'SELECT id, email, password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
      [req.user.user_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    const user = rows[0];

    if (normalized === user.email) return badRequest(res, 'That is already your email address');

    if (user.password_hash) {
      if (!current_password) return badRequest(res, 'current_password is required to change your email');
      const ok = await comparePassword(current_password, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Unauthorized', message: 'Current password is incorrect' });
    }

    // Live-only uniqueness (migration 093). Checked here for a friendly error;
    // re-checked atomically by the unique index on confirm.
    const dup = await query('SELECT 1 FROM users WHERE email = $1 AND deleted_at IS NULL', [normalized]);
    if (dup.rowCount > 0) return res.status(409).json({ error: 'Conflict', message: 'That email is already in use' });

    await query('UPDATE users SET pending_email = $1, updated_at = NOW() WHERE id = $2', [normalized, user.id]);

    const { code } = await otp.issueCode({
      userId: user.id, purpose: 'verify_email_change', channel: 'email', destination: normalized,
    });
    const delivery = await notifier.sendCode({
      channel: 'email', destination: normalized, code, purpose: 'verify_email_change',
    });
    return res.json({
      ok:               true,
      pending_email:    normalized,
      destination_hint: maskEmail(normalized),
      delivery_method:  delivery.delivered,
    });
  } catch (err) {
    return next(err);
  }
}

// ── POST /api/me/email/confirm ────────────────────────────────────────────────
// Body: { code }. Commits pending_email → email on a correct code and marks
// the new address verified.
async function confirmEmailChange(req, res, next) {
  try {
    const { code } = req.body || {};
    if (!code) return badRequest(res, 'code is required');

    const { rows } = await query(
      'SELECT id, pending_email FROM users WHERE id = $1 AND deleted_at IS NULL',
      [req.user.user_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    const user = rows[0];
    if (!user.pending_email) return badRequest(res, 'No email change is pending');

    const result = await otp.verifyCode({
      userId: user.id, purpose: 'verify_email_change', code: String(code).trim(),
    });
    if (!result.ok) {
      return res.status(400).json({ error: 'Bad Request', message: 'Invalid or expired code', code: result.reason });
    }

    let updated;
    try {
      const r = await query(
        `WITH updated AS (
           UPDATE users
              SET email = pending_email, pending_email = NULL,
                  email_verified = true, email_verified_at = NOW(),
                  updated_at = NOW()
            WHERE id = $1
            RETURNING *
         )
         SELECT u.id, u.email, u.first_name, u.last_name, u.phone_number,
                u.user_type_id, u.company_id, u.email_verified, u.phone_verified,
                c.company_type, c.name
           FROM updated u
           JOIN companies c ON c.id = u.company_id`,
        [user.id]
      );
      updated = r.rows[0];
    } catch (e) {
      if (e.code === '23505') {
        // Someone claimed the address between request and confirm.
        await query('UPDATE users SET pending_email = NULL WHERE id = $1', [user.id]);
        return res.status(409).json({ error: 'Conflict', message: 'That email was just taken — try a different address' });
      }
      throw e;
    }
    return res.json({
      user: publicProfile(updated, { company_type: updated.company_type, name: updated.name }),
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  updateProfile, changePassword,
  requestEmailChange, confirmEmailChange,
};
