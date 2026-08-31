-- Episode marker for the device.offline_extended webhook.
--
-- The state-sync worker emits device.offline_extended once when a claimed
-- device's last_seen goes stale past the alert threshold, and stamps
-- offline_alerted_at so the sweep doesn't re-fire every cycle. The stamp is
-- cleared when the device is seen again, so a NEW offline episode alerts
-- again. See hardware/simkura/stateSyncWorker.js.

ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS offline_alerted_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN devices.offline_alerted_at IS 'When device.offline_extended was last emitted for the current offline episode; NULL when the device is current (cleared on next check-in).';
