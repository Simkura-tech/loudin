-- Simkura v2 read migration: the state-sync worker now mirrors the v2
-- device resource (GET /api/v2/devices/:id — state is embedded, no separate
-- /state endpoint). New v2 field worth persisting:
--
--   power.batteryHealth → battery_health ('ok' | 'low' | 'dead' — dead means
--   the lock is in safe mode and the motor cannot actuate)
--
-- Columns that were fed by v1-only /state fields and are NO LONGER REFRESHED
-- (kept for existing rows; candidates for removal in a later cleanup):
--   osdp_stage            (v2 reports reader.type/connection instead of a stage)
--   config_card_type      (not exposed on the v2 read surface)
--   deep_sleep_duration_s (no v2 equivalent)
--   fw_door_shift_count   (v2 counts are credentials/shifts/holidays only)

ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS battery_health VARCHAR(8)
        CHECK (battery_health IN ('ok', 'low', 'dead'));

COMMENT ON COLUMN devices.battery_health IS
    'Firmware-reported battery health from the Simkura v2 device resource (ok | low | dead; dead = safe mode, motor cannot move). NULL for plug-in devices or when unreported.';
