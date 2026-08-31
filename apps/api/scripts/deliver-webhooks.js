#!/usr/bin/env node
/**
 * Retry due webhook deliveries.
 *
 * The dispatcher attempts delivery immediately when an event fires. Anything
 * that fails stays in webhook_deliveries with status 'failed'/'pending' and a
 * future next_attempt_at. This worker picks up everything that's now due and
 * retries it, applying the dispatcher's backoff / exhaustion rules.
 *
 * Runs every minute in production via the loudin-deliver-webhooks systemd
 * timer (deploy/systemd/), installed by setup-api-vm.sh and kept in sync by
 * deploy-api.sh. Run manually any time:
 *
 *   node apps/api/scripts/deliver-webhooks.js
 *
 * Safe to run on demand and concurrently: rows are claimed with
 * FOR UPDATE SKIP LOCKED so overlapping runs never double-send. Idempotent.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { query, getClient, pool } = require('../database/db');
const dispatcher = require('../services/webhooks/dispatcher');

const BATCH_SIZE = parseInt(process.env.WEBHOOK_BATCH_SIZE, 10) || 100;

/**
 * Claim up to BATCH_SIZE due deliveries (joined to their endpoint) inside a
 * short transaction, so a concurrent worker skips the locked rows. We don't
 * mutate them here — deliverOne records the outcome — but the row lock is
 * released on COMMIT, which we do immediately after reading. To avoid two
 * workers grabbing the same row between read and send, we stamp
 * next_attempt_at forward by a lease window as we claim.
 */
async function claimDue(client) {
  const { rows } = await client.query(
    `SELECT d.id, d.event_type, d.payload, d.attempt_count, d.max_attempts,
            e.url, e.secret, e.disabled_at
       FROM webhook_deliveries d
       JOIN webhook_endpoints e ON e.id = d.endpoint_id
      WHERE d.status IN ('pending', 'failed')
        AND d.next_attempt_at <= NOW()
      ORDER BY d.next_attempt_at
      LIMIT $1
      FOR UPDATE OF d SKIP LOCKED`,
    [BATCH_SIZE]
  );
  if (rows.length > 0) {
    // Lease: push next_attempt_at out 5 minutes so another run in this window
    // won't re-claim them before deliverOne settles the row.
    const ids = rows.map((r) => r.id);
    await client.query(
      `UPDATE webhook_deliveries SET next_attempt_at = NOW() + INTERVAL '5 minutes'
        WHERE id = ANY($1::int[])`,
      [ids]
    );
  }
  return rows;
}

async function deliverDueWebhooks() {
  const client = await getClient();
  let claimed;
  try {
    await client.query('BEGIN');
    claimed = await claimDue(client);
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* swallow */ }
    throw err;
  } finally {
    client.release();
  }

  if (claimed.length === 0) {
    console.log('No webhook deliveries are due.');
    return 0;
  }

  let ok = 0;
  for (const d of claimed) {
    // Endpoint disabled after the delivery was queued — mark exhausted so it
    // stops cycling. (deliverOne would still POST; we skip instead.)
    if (d.disabled_at) {
      await query(
        `UPDATE webhook_deliveries
            SET status = 'exhausted', last_error = 'endpoint disabled', updated_at = NOW()
          WHERE id = $1`,
        [d.id]
      );
      continue;
    }
    const delivered = await dispatcher.deliverOne(d);
    if (delivered) ok++;
  }

  console.log(`Processed ${claimed.length} due deliver(y/ies): ${ok} delivered, ${claimed.length - ok} still failing.`);
  return claimed.length;
}

// Only run when invoked directly; importable for tests / on-demand triggers.
if (require.main === module) {
  deliverDueWebhooks()
    .then((n) => {
      console.log(`Done. ${n} delivery row(s) processed.`);
      return pool.end ? pool.end() : null;
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Failed to process webhook deliveries:', err);
      process.exit(1);
    });
}

module.exports = { deliverDueWebhooks };
