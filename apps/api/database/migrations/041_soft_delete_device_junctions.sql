-- Soft-delete on device_credentials / device_shifts to track pending removals.
--
-- A junction row's full lifecycle:
--   * deleted_at IS NULL, synced_at IS NULL          → pending addition
--   * deleted_at IS NULL, synced_at IS NOT NULL      → in sync
--   * deleted_at IS NULL, synced_at < applied_at     → pending re-apply
--   * deleted_at IS NOT NULL                          → pending removal
--                                                       (firmware still has it
--                                                       cached; the "Update
--                                                       device" flow will fire
--                                                       a deactivate command
--                                                       and then HARD-delete
--                                                       the row.)
--
-- The "Update device" button compares applied_at / synced_at / deleted_at
-- and pushes the right bw* commands to bring the firmware in line.

ALTER TABLE device_credentials ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE device_shifts      ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;

-- The original unique constraints would block re-attach after a detach
-- (the soft-deleted history row stays in the table and conflicts on the
-- next INSERT). Replace them with partial indexes that only enforce
-- uniqueness for active (non-deleted) rows.
ALTER TABLE device_credentials DROP CONSTRAINT unique_device_credential;
CREATE UNIQUE INDEX unique_device_credential_active
    ON device_credentials(device_id, credential_id)
    WHERE deleted_at IS NULL;

ALTER TABLE device_shifts DROP CONSTRAINT unique_device_shift;
CREATE UNIQUE INDEX unique_device_shift_active
    ON device_shifts(device_id, shift_id)
    WHERE deleted_at IS NULL;

-- Indexes for the per-device "what's pending" queries.
CREATE INDEX idx_device_credentials_deleted_at
    ON device_credentials(device_id, deleted_at)
    WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_device_shifts_deleted_at
    ON device_shifts(device_id, deleted_at)
    WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN device_credentials.deleted_at IS
    'Soft delete. Non-null = pending removal (firmware still has it cached).';
COMMENT ON COLUMN device_shifts.deleted_at IS
    'Soft delete. Non-null = pending removal (firmware still has it cached).';
