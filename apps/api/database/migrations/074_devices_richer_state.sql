-- Mirror the rest of Simkura's /state snapshot onto devices.
--
-- The state-sync worker (hardware/simkura/stateSyncWorker.js) already
-- mirrors status / door_state / power_mode / battery / firmware /
-- connectivity. Simkura's payload carries more that the UI wants:
--
--   lock.override            → door_override          (door pinned by bwState,
--                                                      schedule suppressed)
--   power.deepSleepDuration  → deep_sleep_duration_s  (wake cadence, seconds)
--   osdpStage                → osdp_stage             (reader link: 0=Root …
--                                                      3=Connected)
--   counts.*                 → fw_*_count             (records ON the firmware —
--                                                      the device-side truth to
--                                                      compare against our
--                                                      junction tables)
--   config.cardType          → config_card_type       (0=26-bit, 1=32-bit HID,
--                                                      2=Mifare 1k)
--   config.latchInterval     → latch_interval_s       (momentary-unlock hold)
--
-- state_synced_at records when the poll last landed — webhooks bump
-- last_seen, but these columns only move on a successful /state fetch, so
-- the UI can say how fresh they are.
--
-- All nullable: NULL = not reported yet (old firmware / never polled).

ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS door_override         BOOLEAN,
    ADD COLUMN IF NOT EXISTS deep_sleep_duration_s INTEGER,
    ADD COLUMN IF NOT EXISTS osdp_stage            SMALLINT,
    ADD COLUMN IF NOT EXISTS fw_credential_count   INTEGER,
    ADD COLUMN IF NOT EXISTS fw_shift_count        INTEGER,
    ADD COLUMN IF NOT EXISTS fw_holiday_count      INTEGER,
    ADD COLUMN IF NOT EXISTS fw_door_shift_count   INTEGER,
    ADD COLUMN IF NOT EXISTS config_card_type      SMALLINT,
    ADD COLUMN IF NOT EXISTS latch_interval_s      SMALLINT,
    ADD COLUMN IF NOT EXISTS state_synced_at       TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN devices.door_override         IS 'Firmware override flag — door pinned by bwState, shifts will not flip it (NULL = not reported)';
COMMENT ON COLUMN devices.deep_sleep_duration_s IS 'Configured deep-sleep window in seconds (wake cadence)';
COMMENT ON COLUMN devices.osdp_stage            IS 'OSDP reader link stage: 0=Root, 1..2=negotiating, 3=Connected';
COMMENT ON COLUMN devices.fw_credential_count   IS 'Credentials currently stored on the firmware (device-side truth)';
COMMENT ON COLUMN devices.fw_shift_count        IS 'Shifts currently stored on the firmware';
COMMENT ON COLUMN devices.fw_holiday_count      IS 'Holidays currently stored on the firmware';
COMMENT ON COLUMN devices.fw_door_shift_count   IS 'Door-schedule bindings currently on the firmware';
COMMENT ON COLUMN devices.config_card_type      IS 'Provisioned reader/card type: 0=26-bit Wiegand, 1=32-bit HID, 2=Mifare 1k';
COMMENT ON COLUMN devices.latch_interval_s      IS 'Momentary-unlock hold time in seconds (bwProvision latchInterval)';
COMMENT ON COLUMN devices.state_synced_at       IS 'Last successful /state poll — freshness of the mirrored state columns';
