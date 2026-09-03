-- Door override mode — the three-way value the v2 resource reports as
-- doors[].lock.override (0 = schedule-controlled, 1 = command override,
-- 2 = holiday override), which migration 074 collapsed into the boolean
-- door_override. The UI's "Door mode" control needs the distinction: a door
-- under a holiday is in Normal mode (following its calendar), not pinned
-- by an admin.
--
--   none      no override — the door follows its shifts and holidays
--   command   an admin pinned it (lock.set-state locked / unlocked / lockdown)
--   holiday   a holiday window is in effect
--
-- door_override stays for compatibility (true ⇔ mode != 'none'). NULL =
-- never reported.

ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS door_override_mode VARCHAR(8)
        CHECK (door_override_mode IN ('none', 'command', 'holiday'));

UPDATE devices
   SET door_override_mode = CASE WHEN door_override THEN 'command' ELSE 'none' END
 WHERE door_override IS NOT NULL
   AND door_override_mode IS NULL;

COMMENT ON COLUMN devices.door_override_mode IS
    'Simkura v2 doors[0].lock.override: none (schedule-controlled) | command (admin-pinned) | holiday (calendar window). NULL = never reported.';
