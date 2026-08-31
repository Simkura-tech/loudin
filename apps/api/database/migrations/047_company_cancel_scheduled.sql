-- End-user self-service subscription cancellation — scheduled state.
--
-- When an end-user admin cancels their subscription, we don't flip
-- `status` to 'canceled' immediately. Instead we record a future
-- effective date in `cancel_effective_at`. A nightly job
-- (scripts/process-scheduled-cancellations.js) flips status='canceled'
-- on or after that date.
--
-- Lifecycle:
--   1. End-user admin requests cancel → cancel_effective_at = start of
--      next calendar month, canceled_by/reason_code/reason populated,
--      status STAYS 'active'.
--   2. Until the effective date the company can undo (clears
--      cancel_effective_at + the recorded reason fields).
--   3. On/after the effective date, the daily job sets
--      status = 'canceled', canceled_at = NOW(), clears
--      cancel_effective_at. canceled_by + reason fields stay (history).
--   4. Platform-admin reactivate also clears cancel_effective_at so
--      reactivating a scheduled-cancel withdraws the schedule.

ALTER TABLE companies
    ADD COLUMN cancel_effective_at TIMESTAMP WITH TIME ZONE;

-- Lets the daily job find expiring rows cheaply.
CREATE INDEX idx_companies_cancel_effective_at
    ON companies(cancel_effective_at)
    WHERE cancel_effective_at IS NOT NULL;

COMMENT ON COLUMN companies.cancel_effective_at IS
    'When a scheduled self-service cancellation takes effect. NULL = no scheduled cancellation. Cleared on undo, on platform-admin reactivate, or when the daily processor flips status to canceled.';
