/**
 * Platform API key management — mint / list / revoke.
 *
 * Gated by the standard cookie auth + requirePlatformAdmin middleware.
 * The plaintext is returned exactly once — at create time. Lists never
 * include the secret or hash. Revoke is a soft-revoke (sets revoked_at)
 * so the audit trail survives.
 */

const apiKey = require('../../services/platform/apiKey');

function badRequest(res, message, details) {
  return res.status(400).json({ error: 'Bad Request', message, ...(details && { details }) });
}

function publicKey(row) {
  return {
    id:           row.id,
    name:         row.name,
    prefix:       row.prefix,
    scopes:       row.scopes || [],
    created_by:   row.created_by ?? null,
    created_at:   row.created_at,
    last_used_at: row.last_used_at ?? null,
    revoked_at:   row.revoked_at ?? null,
    status:       row.revoked_at ? 'revoked' : 'active',
  };
}

// â”€â”€ GET /api/platform/api-keys â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function list(req, res, next) {
  try {
    const rows = await apiKey.listKeys();
    return res.json({
      keys: rows.map(publicKey),
      available_scopes: apiKey.ALLOWED_SCOPES,
    });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ POST /api/platform/api-keys â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Body: { name, scopes: string[] }
// Returns: { key: { id, name, prefix, scopes, ... }, token } — token is
// the plaintext, shown ONCE.
async function create(req, res, next) {
  try {
    const { name, scopes } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return badRequest(res, 'name is required');
    }
    if (name.trim().length > 120) {
      return badRequest(res, 'name must be 120 characters or fewer');
    }
    if (!Array.isArray(scopes) || scopes.length === 0) {
      return badRequest(res, 'pick at least one scope');
    }

    const result = await apiKey.createKey({
      name:       name.trim(),
      scopes,
      createdBy:  req.user.user_id,
    });
    return res.status(201).json({
      key:   publicKey({ ...result, last_used_at: null, revoked_at: null }),
      token: result.token,
    });
  } catch (err) {
    return next(err);
  }
}

// â”€â”€ DELETE /api/platform/api-keys/:id â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function revoke(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
    const ok = await apiKey.revokeKey(id);
    if (!ok) return res.status(404).json({ error: 'Not Found', message: 'Key not found or already revoked' });
    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, create, revoke };
