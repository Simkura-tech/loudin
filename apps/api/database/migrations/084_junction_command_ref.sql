-- Command-record correlation for the junction sync trail.
--
-- Simkura v2 command events (command.sent / command.failed) carry
-- `commandRef` — the `cmd_…` id returned in the 202 when the command was
-- queued. Storing that id on the junction row lets the webhook receiver
-- stamp synced_at when the gateway actually delivers the command to the
-- device, instead of the push orchestrator stamping it at API-ACK time.
--
-- Lifecycle (migration 058, refined):
--   applied_at          — row attached/modified in our DB
--   submitted_at        — Simkura accepted the command (202);
--                         simkura_command_id records which one
--   synced_at           — command.sent arrived for that id, or the
--                         state-sync reconcile saw the record reach 'sent'
--
-- A failed / expired / cancelled command clears submitted_at and
-- simkura_command_id so the next push re-sends the row.
--
-- Existing rows keep the synced_at they got from the 202-stamping era —
-- nothing to backfill; they are "in sync" as far as we ever knew.

ALTER TABLE device_credentials ADD COLUMN IF NOT EXISTS simkura_command_id VARCHAR(64);
ALTER TABLE device_shifts      ADD COLUMN IF NOT EXISTS simkura_command_id VARCHAR(64);

-- Webhook / reconcile lookup: WHERE simkura_command_id = $1. Partial —
-- only rows with a command outstanding carry an id.
CREATE INDEX IF NOT EXISTS idx_device_credentials_command_id
    ON device_credentials (simkura_command_id) WHERE simkura_command_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_device_shifts_command_id
    ON device_shifts (simkura_command_id) WHERE simkura_command_id IS NOT NULL;

COMMENT ON COLUMN device_credentials.simkura_command_id IS
    'Simkura v2 command id (cmd_…) from the 202 that queued this row''s credentials.add. Matched against command.sent/failed data.commandRef to stamp synced_at. NULL once confirmed or never submitted.';
COMMENT ON COLUMN device_shifts.simkura_command_id IS
    'Simkura v2 command id (cmd_…) from the 202 that queued this row''s shifts.add. Matched against command.sent/failed data.commandRef to stamp synced_at. NULL once confirmed or never submitted.';
