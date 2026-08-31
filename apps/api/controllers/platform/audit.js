/**
 * Audit log read controller — platform-admin only.
 *
 * Writes go through services/platform/audit.js (recordAudit). This file is the
 * read side: filtered, paginated list of entries with joined actor/tenant
 * names so the eventual UI doesn't need a fan-out of follow-up queries.
 */

const { query } = require('../../database/db');

const MAX_LIMIT = 500;

// â”€â”€ GET /api/audit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//   ?actor_user_id=…
//   ?on_behalf_of_company_id=…
//   ?action=…                 (exact match; supports prefix via trailing '*'
//                              — e.g. 'company.*' matches all company actions)
//   ?target_type=…&target_id=…
//   ?since=ISO&until=ISO
//   ?limit=…&offset=…
async function list(req, res, next) {
  try {
    const limit  = Math.min(Number(req.query.limit)  || 100, MAX_LIMIT);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const params = [];
    const where  = ['1=1'];

    if (req.query.actor_user_id) {
      params.push(Number(req.query.actor_user_id));
      where.push(`a.actor_user_id = $${params.length}`);
    }
    if (req.query.on_behalf_of_company_id) {
      params.push(Number(req.query.on_behalf_of_company_id));
      where.push(`a.on_behalf_of_company_id = $${params.length}`);
    }
    if (req.query.action) {
      const action = String(req.query.action);
      if (action.endsWith('*')) {
        params.push(action.slice(0, -1) + '%');
        where.push(`a.action LIKE $${params.length}`);
      } else {
        params.push(action);
        where.push(`a.action = $${params.length}`);
      }
    }
    if (req.query.target_type) {
      params.push(String(req.query.target_type));
      where.push(`a.target_type = $${params.length}`);
    }
    if (req.query.target_id) {
      params.push(String(req.query.target_id));
      where.push(`a.target_id = $${params.length}`);
    }
    if (req.query.since) {
      params.push(String(req.query.since));
      where.push(`a.created_at >= $${params.length}`);
    }
    if (req.query.until) {
      params.push(String(req.query.until));
      where.push(`a.created_at <= $${params.length}`);
    }

    const filterParams = [...params];
    params.push(limit);  const lim = `$${params.length}`;
    params.push(offset); const off = `$${params.length}`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT a.id, a.actor_user_id, a.actor_company_id, a.on_behalf_of_company_id,
                a.action, a.target_type, a.target_id, a.metadata,
                a.ip_address, a.user_agent, a.created_at,
                u.email      AS actor_email,
                u.first_name AS actor_first_name,
                u.last_name  AS actor_last_name,
                ac.name      AS actor_company_name,
                oc.name      AS on_behalf_of_company_name
           FROM audit_log a
      LEFT JOIN users      u  ON u.id  = a.actor_user_id
      LEFT JOIN companies  ac ON ac.id = a.actor_company_id
      LEFT JOIN companies  oc ON oc.id = a.on_behalf_of_company_id
          WHERE ${where.join(' AND ')}
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT ${lim} OFFSET ${off}`,
        params
      ),
      query(
        `SELECT COUNT(*)::int AS n FROM audit_log a WHERE ${where.join(' AND ')}`,
        filterParams
      ),
    ]);

    return res.json({
      entries: rows,
      total:   countRows[0].n,
      limit,
      offset,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { list };
