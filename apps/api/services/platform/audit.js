/**
 * Audit logging service.
 *
 * One function: recordAudit(req, action, opts) — writes a row to
 * audit_log capturing the actor, the tenant the action lands on,
 * action key, and optional target/metadata.
 *
 * Fire-and-forget: insert errors are logged to stderr but never
 * propagated. The point is to have audit be a side effect of the
 * mutation, not a gate on it.
 *
 * When req.impersonation is set (populated by the impersonation
 * middleware), actor_company_id stays as the impersonator's company
 * (the reseller), and on_behalf_of_company_id is the impersonated
 * customer. When no impersonation is active, the two are equal.
 */

const { query } = require('../../database/db');

/**
 * @param {Object} req               — Express request (must have req.user from authenticate middleware)
 * @param {string} action            — dot-notation action key (e.g. 'company.suspend')
 * @param {Object} [opts]
 * @param {string} [opts.target_type]
 * @param {string|number} [opts.target_id]
 * @param {Object} [opts.metadata]
 */
async function recordAudit(req, action, opts = {}) {
  try {
    const user = req.user || {};
    const impersonation = req.impersonation || null;

    const actorUserId    = user.user_id    ?? null;
    const actorCompanyId = impersonation
      ? impersonation.impersonator_company_id ?? null
      : user.company_id ?? null;
    const onBehalfOf     = user.company_id ?? null;

    const targetId = opts.target_id != null ? String(opts.target_id) : null;
    const ip = req.ip || req.headers?.['x-forwarded-for'] || null;
    const ua = req.get ? req.get('user-agent') : (req.headers?.['user-agent'] || null);

    await query(
      `INSERT INTO audit_log
         (actor_user_id, actor_company_id, on_behalf_of_company_id,
          action, target_type, target_id, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        actorUserId,
        actorCompanyId,
        onBehalfOf,
        action,
        opts.target_type ?? null,
        targetId,
        opts.metadata ? JSON.stringify(opts.metadata) : null,
        typeof ip === 'string' ? ip.slice(0, 45) : null,
        ua || null,
      ]
    );
  } catch (err) {
    // Never block the request on audit failures — but make sure we see them.
    console.error('[audit] failed to record action', action, err.message);
  }
}

module.exports = { recordAudit };
