#!/usr/bin/env node
/**
 * Process scheduled subscription cancellations.
 *
 * Finds end-user companies whose `cancel_effective_at` has passed and
 * flips them to status='canceled'. Designed to run nightly via cron or
 * systemd timer:
 *
 *   0 2 * * *   cd /opt/loudin && node apps/api/scripts/process-scheduled-cancellations.js
 *
 * Safe to run on demand (e.g. for QA): only acts on rows that are still
 * 'active' AND have an effective date in the past. Idempotent.
 *
 * What it does to each eligible row:
 *   status              → 'canceled'
 *   canceled_at         → NOW()
 *   cancel_effective_at → NULL   (the schedule has fired)
 *
 * canceled_by + cancellation_reason_code + cancellation_reason were
 * recorded at schedule time and stay intact for analytics/history.
 *
 * NOT done here (deferred):
 *   - Email to the canceling admin
 *   - Webhook out to a reseller when their end-user cancels
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { query, pool } = require('../database/db');

async function processScheduledCancellations() {
  const { rows } = await query(
    `UPDATE companies
        SET status              = 'canceled',
            canceled_at         = NOW(),
            cancel_effective_at = NULL,
            updated_at          = NOW()
      WHERE status = 'active'
        AND deleted_at IS NULL
        AND cancel_effective_at IS NOT NULL
        AND cancel_effective_at <= NOW()
  RETURNING id, name, canceled_by, cancellation_reason_code`
  );

  if (rows.length === 0) {
    console.log('No scheduled cancellations are due.');
    return 0;
  }

  console.log(`Processed ${rows.length} scheduled cancellation(s):`);
  for (const r of rows) {
    console.log(
      `  - #${r.id} "${r.name}" (by user #${r.canceled_by}, reason: ${r.cancellation_reason_code})`
    );
  }
  return rows.length;
}

// Only run when invoked directly; importable for tests / on-demand triggers.
if (require.main === module) {
  processScheduledCancellations()
    .then((n) => {
      console.log(`Done. ${n} row(s) flipped.`);
      return pool.end ? pool.end() : null;
    })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Failed to process scheduled cancellations:', err);
      process.exit(1);
    });
}

module.exports = { processScheduledCancellations };
