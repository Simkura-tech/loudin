-- Cellular connectivity, reported by Simkura's device-state endpoint
-- (GET /api/v1/devices/:id/state → connectivity: { carrier, signal }).
--
-- Only newer firmwares report these — older devices send an empty carrier
-- and signal 0, which the state-sync worker stores as NULL. Signal is kept
-- as the raw integer the firmware reports (no unit conversion here).

ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS carrier VARCHAR(64),
    ADD COLUMN IF NOT EXISTS signal_strength INTEGER;

COMMENT ON COLUMN devices.carrier         IS 'Cellular carrier reported by the firmware (newer firmwares only; NULL when unreported).';
COMMENT ON COLUMN devices.signal_strength IS 'Raw cellular signal value reported by the firmware (newer firmwares only; NULL when unreported).';
