'use strict';

/**
 * Registered-endpoint webhook dispatcher.
 *
 * Fans an emitted event out to every active endpoint subscribed to its type,
 * persisting one webhook_deliveries row per (event, endpoint) and attempting
 * immediate delivery. Failures stay in the table with a future
 * next_attempt_at; the retry worker (scripts/deliver-webhooks.js) picks them
 * up on a schedule. This is the durable, customer-grade counterpart to the
 * fire-and-forget CRM feed.
 *
 * Signing matches the CRM feed (services/webhooks/sign.js) — HMAC-SHA256 over
 * the raw JSON body — but uses each endpoint's own secret.
 */

const axios = require('axios');
const { query } = require('../../database/db');
const { sign } = require('./sign');

// Exponential-ish backoff between retries, indexed by attempt number.
// attempt 1 fails → wait 30s, 2 → 2m, 3 → 10m, 4 → 1h, 5+ → 6h.
const BACKOFF_SECONDS = [30, 120, 600, 3600, 21600];

function timeoutMs() {
  return parseInt(process.env.WEBHOOK_TIMEOUT, 10) || 5_000;
}

/** Trim a receiver's response body to something safe to store. */
function snippet(data) {
  if (data == null) return null;
  const s = typeof data === 'string' ? data : JSON.stringify(data);
  return s.slice(0, 500);
}

async function markFailure(delivery, attempt, code, error, respSnippet) {
  const exhausted = attempt >= delivery.max_attempts;
  const status = exhausted ? 'exhausted' : 'failed';
  const nextInterval = exhausted
    ? null
    : `${BACKOFF_SECONDS[Math.min(attempt - 1, BACKOFF_SECONDS.length - 1)]} seconds`;
  await query(
    `UPDATE webhook_deliveries
        SET status = $2,
            attempt_count = $3,
            last_status_code = $4,
            last_error = $5,
            response_snippet = $6,
            next_attempt_at = CASE WHEN $7::text IS NULL
                                   THEN next_attempt_at
                                   ELSE NOW() + $7::interval END,
            updated_at = NOW()
      WHERE id = $1`,
    [delivery.id, status, attempt, code, error, respSnippet, nextInterval]
  );
}

/**
 * Attempt a single delivery and record the outcome. Shared by dispatch()
 * (fresh events) and the retry worker (due rows). `delivery` must carry:
 *   { id, event_type, payload (the envelope object), attempt_count,
 *     max_attempts, url, secret }
 * Returns true on 2xx, false otherwise. Never throws.
 */
async function deliverOne(delivery) {
  const body = JSON.stringify(delivery.payload);
  const attempt = delivery.attempt_count + 1;
  const headers = {
    'Content-Type':        'application/json',
    'X-Loudin-Signature': sign(body, delivery.secret),
    'X-Loudin-Event':     delivery.event_type,
    'X-Loudin-Event-Id':  delivery.payload?.event_id ?? '',
    'X-Loudin-Delivery':  String(delivery.id),
  };
  try {
    const resp = await axios.post(delivery.url, body, {
      headers,
      timeout: timeoutMs(),
      validateStatus: null, // we classify status ourselves
    });
    if (resp.status >= 200 && resp.status < 300) {
      await query(
        `UPDATE webhook_deliveries
            SET status = 'delivered', attempt_count = $2, last_status_code = $3,
                last_error = NULL, response_snippet = $4, delivered_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [delivery.id, attempt, resp.status, snippet(resp.data)]
      );
      return true;
    }
    await markFailure(delivery, attempt, resp.status, `HTTP ${resp.status}`, snippet(resp.data));
    return false;
  } catch (err) {
    await markFailure(
      delivery,
      attempt,
      err.response?.status ?? null,
      err.message || 'request failed',
      snippet(err.response?.data)
    );
    return false;
  }
}

/**
 * Fan an event envelope out to subscribed endpoints. Enqueues a delivery row
 * per endpoint and fires an immediate (non-blocking) attempt. Never throws —
 * webhook delivery must not affect the triggering request.
 */
async function dispatch(envelope) {
  let endpoints;
  try {
    const { rows } = await query(
      `SELECT id, url, secret
         FROM webhook_endpoints
        WHERE disabled_at IS NULL AND active AND $1 = ANY(event_types)`,
      [envelope.type]
    );
    endpoints = rows;
  } catch (err) {
    console.error(`[webhooks] dispatch lookup failed for "${envelope.type}":`, err.message);
    return;
  }
  if (endpoints.length === 0) return;

  for (const ep of endpoints) {
    try {
      const { rows: [row] } = await query(
        `INSERT INTO webhook_deliveries (endpoint_id, event_id, event_type, payload, status, next_attempt_at)
         VALUES ($1, $2, $3, $4::jsonb, 'pending', NOW())
         RETURNING id, attempt_count, max_attempts`,
        [ep.id, envelope.event_id, envelope.type, JSON.stringify(envelope)]
      );
      // Immediate best-effort attempt; the worker covers retries.
      void deliverOne({
        id:            row.id,
        event_type:    envelope.type,
        payload:       envelope,
        attempt_count: row.attempt_count,
        max_attempts:  row.max_attempts,
        url:           ep.url,
        secret:        ep.secret,
      }).catch((e) => console.error('[webhooks] deliverOne error:', e.message));
    } catch (err) {
      console.error(`[webhooks] failed to enqueue delivery for endpoint ${ep.id}:`, err.message);
    }
  }
}

module.exports = { dispatch, deliverOne, BACKOFF_SECONDS };
