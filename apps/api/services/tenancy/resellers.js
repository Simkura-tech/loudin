/**
 * Reseller lifecycle service.
 *
 * Today: termination only. (Activation is handled by the signup flow.)
 *
 * Termination is irreversible per the v1 product decision. The flow:
 *
 *   1. Stamp companies.{canceled_at, canceled_by, cancellation_reason,
 *      cancellation_reason_code, status='canceled'} on the reseller row.
 *   2. Unlock every end-user under this reseller — null out
 *      parent_company_id + parent_locked_at so they become "direct"
 *      customers.
 */

const { getClient } = require('../../database/db');
const { recordAudit } = require('../platform/audit');

/**
 * Terminate a reseller. Returns:
 *   { terminated: true,  reseller, end_users_unlocked }
 *   { terminated: false, reason: 'not_reseller' | 'already_terminated' | 'not_found' }
 */
async function terminate(resellerCompanyId, opts = {}) {
  const { req = null, reason = null, reasonCode = 'TERMINATED_BY_PLATFORM' } = opts;
  const actorUserId = req?.user?.user_id ?? null;

  const client = await getClient();
  let result;
  try {
    await client.query('BEGIN');

    const r = await client.query(
      `SELECT id, name, company_type, status, canceled_at
         FROM companies
        WHERE id = $1
          FOR UPDATE`,
      [resellerCompanyId]
    );
    const reseller = r.rows[0];
    if (!reseller) {
      await client.query('ROLLBACK');
      return { terminated: false, reason: 'not_found' };
    }
    if (reseller.company_type !== 'reseller') {
      await client.query('ROLLBACK');
      return { terminated: false, reason: 'not_reseller' };
    }
    if (reseller.canceled_at || reseller.status === 'canceled') {
      await client.query('ROLLBACK');
      return { terminated: false, reason: 'already_terminated' };
    }

    // 1. Mark reseller terminated.
    const updatedReseller = await client.query(
      `UPDATE companies
          SET status                    = 'canceled',
              canceled_at               = NOW(),
              canceled_by               = $2,
              cancellation_reason       = $3,
              cancellation_reason_code  = $4,
              updated_at                = NOW()
        WHERE id = $1
        RETURNING *`,
      [resellerCompanyId, actorUserId, reason, reasonCode]
    );

    // 2. Unlock every end-user under this reseller.
    const unlocked = await client.query(
      `UPDATE companies
          SET parent_company_id = NULL,
              parent_locked_at  = NULL,
              updated_at        = NOW()
        WHERE parent_company_id = $1 AND deleted_at IS NULL
        RETURNING id`,
      [resellerCompanyId]
    );

    await client.query('COMMIT');

    result = {
      terminated: true,
      reseller: updatedReseller.rows[0],
      end_users_unlocked: unlocked.rowCount,
    };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
    throw e;
  } finally {
    client.release();
  }

  // Best-effort audit log.
  if (req) {
    recordAudit(req, 'reseller.terminate', {
      target_type: 'company',
      target_id:   resellerCompanyId,
      metadata: {
        reason,
        reason_code: reasonCode,
        end_users_unlocked: result.end_users_unlocked,
      },
    });
  }

  return result;
}

module.exports = { terminate };
