-- Holidays become a first-class per-device record, pushed to the lock like
-- shifts. Two changes:
--
-- 1. device_holidays gets the same sync-trail lifecycle as device_shifts
--    (migrations 041 / 058 / 084): a soft-delete marker for pending
--    removals, submitted_at + simkura_command_id for the push → ack loop,
--    and the UNIQUE constraint relaxed to "unique while active" so a
--    holiday can be re-attached after a pending removal.
--
-- 2. holidays.access_mode gains 'lockdown'. The v2 holidays.add `behavior`
--    vocabulary is locked | unlocked | lockdown; Loudin's modes map as
--      open       → unlocked
--      locked     → locked
--      lockdown   → lockdown
--      restricted → (custom hours — no firmware equivalent; not pushable)
--    'restricted' stays in the CHECK for existing rows but the device UI
--    doesn't offer it and the push skips it as unmappable.

ALTER TABLE device_holidays
    ADD COLUMN IF NOT EXISTS submitted_at       TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS deleted_at         TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS simkura_command_id VARCHAR(64);

ALTER TABLE device_holidays DROP CONSTRAINT IF EXISTS unique_device_holiday;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_device_holiday_active
    ON device_holidays (device_id, holiday_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_device_holidays_deleted_at
    ON device_holidays (device_id, deleted_at)
    WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_holidays_command_id
    ON device_holidays (simkura_command_id)
    WHERE simkura_command_id IS NOT NULL;

COMMENT ON COLUMN device_holidays.submitted_at IS
    'Stamped when Simkura accepted the holidays.add (202); synced_at lands on the matching command.sent.';
COMMENT ON COLUMN device_holidays.deleted_at IS
    'Soft-delete: the holiday was removed in Loudin but the lock still holds it until the next push.';
COMMENT ON COLUMN device_holidays.simkura_command_id IS
    'The cmd_… record id from the 202, matched by services/access/commandAck.';

ALTER TABLE holidays DROP CONSTRAINT IF EXISTS holidays_access_mode_check;
ALTER TABLE holidays
    ADD CONSTRAINT holidays_access_mode_check
        CHECK (access_mode IN ('open', 'restricted', 'locked', 'lockdown'));

COMMENT ON COLUMN holidays.access_mode IS
    'open = door held unlocked; locked = door locked, credentials still work; lockdown = door pinned locked against everything; restricted = custom_hours only (not pushable to Simkura hardware)';
