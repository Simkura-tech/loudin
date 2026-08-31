-- Add submitted_at to device junction tables.
--
-- A junction row's lifecycle is now three timestamps:
--   * applied_at    — when the row was attached/modified in our DB
--   * submitted_at  — when the push orchestrator sent the corresponding
--                     bw* command to Simkura and received a 200 ACK
--   * synced_at     — when the device confirmed via webhook (command.sent)
--
-- For bwCred / bwShift Simkura does not currently raise command.sent
-- (per INTEGRATION_REST.md — only bwUnlock and bwProvision do). So
-- in practice synced_at stays NULL for credential / shift rows until
-- Simkura expands the event, or until we wire device.wake count
-- reconciliation. UI should treat (submitted_at IS NOT NULL) as
-- "pushed; device confirmation pending".

ALTER TABLE device_credentials ADD COLUMN submitted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE device_shifts      ADD COLUMN submitted_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN device_credentials.submitted_at IS
    'When the push orchestrator submitted the bwCred command to Simkura and got 200 back. NULL = not yet submitted.';
COMMENT ON COLUMN device_shifts.submitted_at IS
    'When the push orchestrator submitted the bwShift command to Simkura and got 200 back. NULL = not yet submitted.';
