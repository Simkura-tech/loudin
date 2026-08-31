'use strict';

/**
 * Lifecycle-event emit path.
 *
 * Builds one signed envelope per event and fans it out to every registered
 * webhook endpoint subscribed to its type (durable: webhook_deliveries rows,
 * retried by scripts/deliver-webhooks.js).
 *
 * Envelope (all events):
 *   event_id    — UUID, idempotency key for receivers
 *   type        — e.g. 'company.signed_up', 'device.added'
 *   occurred_at — ISO-8601 timestamp
 *   company     — { id, type }  (the company the event happened in)
 *   reseller    — { company_id } (present when company.type === 'end_user')
 *   actor       — { user_id }    (present when a user triggered the event)
 *   device      — { device_id }  (present for device lifecycle events)
 *
 * Whether an endpoint actually receives an event is governed by its
 * subscription + the allow-list in services/platform/webhookEndpoints.js —
 * the dispatcher no-ops when nothing is subscribed.
 *
 * Fire-and-forget: never throws, never blocks the triggering request.
 */

const crypto = require('crypto');
const dispatcher = require('../services/webhooks/dispatcher');

/** Build the common event envelope. */
function buildEnvelope(type, payload) {
  return {
    event_id:    crypto.randomUUID(),
    type,
    occurred_at: new Date().toISOString(),
    ...payload,
  };
}

async function emit(type, payload) {
  void dispatcher.dispatch(buildEnvelope(type, payload));
}

module.exports = { emit, buildEnvelope };
