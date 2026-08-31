/**
 * Platform webhook management — register / edit / delete endpoints, browse
 * deliveries, redeliver.
 *
 * Gated by cookie auth + requirePlatformAdmin (same as platformApiKeys). The
 * signing secret is returned in full only right after create/rotate; list/get
 * responses return a masked hint. Delete is a soft-disable so delivery history
 * survives.
 */

const svc = require('../../services/platform/webhookEndpoints');
const dispatcher = require('../../services/webhooks/dispatcher');

function badRequest(res, message, details) {
  return res.status(400).json({ error: 'Bad Request', message, ...(details && { details }) });
}
function notFound(res, message = 'Endpoint not found') {
  return res.status(404).json({ error: 'Not Found', message });
}

function maskSecret(secret) {
  if (!secret) return null;
  const tail = secret.slice(-4);
  return `whsec_…${tail}`;
}

function publicEndpoint(row, { includeSecret = false } = {}) {
  return {
    id:          row.id,
    name:        row.name,
    url:         row.url,
    event_types: row.event_types || [],
    active:      row.active,
    status:      row.disabled_at ? 'disabled' : (row.active ? 'active' : 'paused'),
    secret_hint: maskSecret(row.secret),
    ...(includeSecret ? { secret: row.secret } : {}),
    created_by:  row.created_by ?? null,
    created_at:  row.created_at,
    updated_at:  row.updated_at,
    disabled_at: row.disabled_at ?? null,
  };
}

// ── GET /api/platform/webhooks ───────────────────────────────────────────────
async function list(req, res, next) {
  try {
    const rows = await svc.listEndpoints();
    return res.json({
      endpoints: rows.map((r) => publicEndpoint(r)),
      available_events: svc.ALLOWED_EVENT_TYPES,
    });
  } catch (err) { return next(err); }
}

// ── POST /api/platform/webhooks ──────────────────────────────────────────────
// Body: { name, url, event_types: string[] }. Returns the secret in full once.
async function create(req, res, next) {
  try {
    const { name, url, event_types } = req.body || {};
    const row = await svc.createEndpoint({
      name, url, eventTypes: event_types, createdBy: req.user.user_id,
    });
    return res.status(201).json({ endpoint: publicEndpoint(row, { includeSecret: true }) });
  } catch (err) {
    if (err instanceof Error && /required|valid|event type|https|url|empty/i.test(err.message)) {
      return badRequest(res, err.message);
    }
    return next(err);
  }
}

// ── PATCH /api/platform/webhooks/:id ─────────────────────────────────────────
// Body: any of { name, url, event_types, active }.
async function update(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
    const { name, url, event_types, active } = req.body || {};
    const row = await svc.updateEndpoint(id, { name, url, eventTypes: event_types, active });
    if (!row) return notFound(res);
    return res.json({ endpoint: publicEndpoint(row) });
  } catch (err) {
    if (err instanceof Error && /valid|event type|https|url|empty/i.test(err.message)) {
      return badRequest(res, err.message);
    }
    return next(err);
  }
}

// ── DELETE /api/platform/webhooks/:id ────────────────────────────────────────
async function remove(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
    const ok = await svc.deleteEndpoint(id);
    if (!ok) return notFound(res, 'Endpoint not found or already deleted');
    return res.status(204).end();
  } catch (err) { return next(err); }
}

// ── POST /api/platform/webhooks/:id/rotate-secret ────────────────────────────
async function rotateSecret(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
    const row = await svc.rotateSecret(id);
    if (!row) return notFound(res);
    return res.json({ endpoint: publicEndpoint(row, { includeSecret: true }) });
  } catch (err) { return next(err); }
}

// ── GET /api/platform/webhooks/:id/deliveries ────────────────────────────────
async function listDeliveries(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
    const rows = await svc.listDeliveries(id);
    return res.json({ deliveries: rows });
  } catch (err) { return next(err); }
}

// ── POST /api/platform/webhooks/deliveries/:id/redeliver ─────────────────────
// Re-queues a failed/exhausted delivery and fires an immediate attempt.
async function redeliver(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return badRequest(res, 'id must be a positive integer');
    const delivery = await svc.requeueDelivery(id);
    if (!delivery) return notFound(res, 'Delivery not found or not in a redeliverable state');

    // Fire an immediate attempt (best-effort); the worker would also pick it up.
    const ep = await svc.getEndpoint(delivery.endpoint_id);
    if (ep && !ep.disabled_at) {
      void dispatcher.deliverOne({
        id:            delivery.id,
        event_type:    delivery.event_type,
        payload:       delivery.payload,
        attempt_count: delivery.attempt_count,
        max_attempts:  delivery.max_attempts,
        url:           ep.url,
        secret:        ep.secret,
      }).catch((e) => console.error('[webhooks] redeliver attempt error:', e.message));
    }
    return res.status(202).json({ delivery: { id: delivery.id, status: 'pending' } });
  } catch (err) { return next(err); }
}

module.exports = { list, create, update, remove, rotateSecret, listDeliveries, redeliver };
