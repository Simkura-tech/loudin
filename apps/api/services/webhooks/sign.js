'use strict';

/**
 * Shared outbound-webhook signing.
 *
 * The registered-endpoint dispatcher (services/webhooks/dispatcher.js) signs
 * every payload the same way — HMAC-SHA256 over the raw JSON body, keyed by
 * the endpoint's own secret. Receivers verify by recomputing this over the
 * raw request body.
 *
 * Header: X-Loudin-Signature: sha256=<hex>
 */

const crypto = require('crypto');

function sign(body, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

module.exports = { sign };
