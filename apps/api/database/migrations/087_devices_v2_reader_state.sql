-- Retire the v1-era state columns and mirror their v2 replacements.
--
-- Migration 083 stopped refreshing four columns fed by the old v1 /state
-- endpoint and flagged them for cleanup. The v2 device resource reports the
-- same concerns differently, and the state-sync worker now mirrors those:
--
--   dropped                 v2 replacement
--   osdp_stage            → doors[].reader.protocol / .connection
--                           (osdp|wiegand, secure|insecure)
--   config_card_type      → the device-level cardFormats[] list, already
--                           mirrored as devices.card_formats (migration 085)
--   deep_sleep_duration_s → nothing (no v2 equivalent)
--   fw_door_shift_count   → nothing (v2 counts are credentials/shifts/holidays)
--
-- New per-door / power state worth persisting:
--   doors[].lock.position    → door_position (open|closed; NULL unless the
--                              board's door-position-sensing feature is on)
--   doors[].reader.technology→ reader_technology — the installer-recorded
--                              value written via lock.configure
--                              (readerTechnology); now read back so the UI
--                              can show and prefill it
--   power.batteryChemistry   → battery_chemistry (alkaline|lithium|li-ion)
--
-- Door 1 only, like every other mirrored door field.

ALTER TABLE devices
    DROP COLUMN IF EXISTS osdp_stage,
    DROP COLUMN IF EXISTS config_card_type,
    DROP COLUMN IF EXISTS deep_sleep_duration_s,
    DROP COLUMN IF EXISTS fw_door_shift_count;

ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS door_position     VARCHAR(8)
        CHECK (door_position IN ('open', 'closed')),
    ADD COLUMN IF NOT EXISTS reader_protocol   VARCHAR(8)
        CHECK (reader_protocol IN ('osdp', 'wiegand')),
    ADD COLUMN IF NOT EXISTS reader_connection VARCHAR(8)
        CHECK (reader_connection IN ('secure', 'insecure')),
    ADD COLUMN IF NOT EXISTS reader_technology VARCHAR(12)
        CHECK (reader_technology IN ('prox', 'smartcard', 'nfc', 'ble', 'multi')),
    ADD COLUMN IF NOT EXISTS battery_chemistry VARCHAR(8)
        CHECK (battery_chemistry IN ('alkaline', 'lithium', 'li-ion'));

COMMENT ON COLUMN devices.door_position IS
    'Simkura v2 doors[0].lock.position (open | closed). NULL unless the board has door-position-sensing and the device has reported.';
COMMENT ON COLUMN devices.reader_protocol IS
    'Simkura v2 doors[0].reader.protocol (osdp | wiegand) — wire protocol to the reader, fixed at installation.';
COMMENT ON COLUMN devices.reader_connection IS
    'Simkura v2 doors[0].reader.connection (secure | insecure) — OSDP secure-channel status. NULL for wiegand.';
COMMENT ON COLUMN devices.reader_technology IS
    'Simkura v2 doors[0].reader.technology (prox | smartcard | nfc | ble | multi) — installer-recorded via lock.configure.';
COMMENT ON COLUMN devices.battery_chemistry IS
    'Simkura v2 power.batteryChemistry (alkaline | lithium | li-ion) — recorded via device.configure; drives low-battery thresholds.';
