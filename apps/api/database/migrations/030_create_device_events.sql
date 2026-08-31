-- device_events — every event we receive from Simkura for a device.
--
-- Ingested by the /api/webhooks/simkura receiver (push) and the planned
-- polling worker (pull). One row per Simkura event_id; the unique index
-- on simkura_event_id lets the receiver INSERT … ON CONFLICT DO NOTHING
-- so re-deliveries from Simkura's retry logic dedupe for free.
--
-- See INTEGRATION_REST.md for the canonical event taxonomy (dot-notation
-- event types: access.granted, access.denied, lock.state_changed, device.wake,
-- device.sleep, device.restart, command.sent, command.failed). Event types
-- and categories are intentionally NOT CHECK-constrained — Simkura can add
-- new types without a migration here, and the application layer maintains
-- the display allow-list.

CREATE TABLE IF NOT EXISTS device_events (
    id SERIAL PRIMARY KEY,

    -- Owning Loudin company. Looked up from devices.device_id at insert
    -- time (Simkura's payload company_id is THEIR id for us, not our id
    -- for the device's owner). NULL when the event arrives for a device
    -- we haven't claimed yet — keep the row so the data isn't lost.
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,

    -- Hardware identifier (matches devices.device_id). Stored as TEXT,
    -- NOT a foreign key, so a race against claim / a hard-delete in
    -- `devices` doesn't drop event history.
    device_id VARCHAR(255) NOT NULL,

    event_type     VARCHAR(100) NOT NULL,
    event_category VARCHAR(100),
    severity       VARCHAR(20) NOT NULL DEFAULT 'info'
        CHECK (severity IN ('info', 'warning', 'error')),

    -- Type-specific body + Simkura gateway context, both JSON.
    event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Simkura-side identifiers. UNIQUE on simkura_event_id powers the
    -- ON CONFLICT DO NOTHING dedupe in the receiver.
    simkura_event_id   VARCHAR(100) UNIQUE,
    simkura_webhook_id INTEGER,

    -- Event time per Simkura's payload vs. our wall-clock at ingest.
    event_timestamp TIMESTAMP WITH TIME ZONE,
    received_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_device_events_company_id  ON device_events(company_id)               WHERE company_id IS NOT NULL;
CREATE INDEX idx_device_events_device_id   ON device_events(device_id);
CREATE INDEX idx_device_events_event_type  ON device_events(event_type);
CREATE INDEX idx_device_events_received_at ON device_events(received_at DESC);
-- Composite for the per-device activity feed (DeviceDetailPage):
CREATE INDEX idx_device_events_device_time ON device_events(device_id, received_at DESC);

COMMENT ON TABLE  device_events                    IS 'Events from Simkura webhooks and the polling fallback. One row per Simkura event_id.';
COMMENT ON COLUMN device_events.device_id          IS 'Hardware identifier — matches devices.device_id but NOT an FK (events outlive devices)';
COMMENT ON COLUMN device_events.simkura_event_id   IS 'Unique id from the Simkura payload; powers receiver-side dedupe';
COMMENT ON COLUMN device_events.event_timestamp    IS 'Per Simkura: when the event occurred on the device side';
COMMENT ON COLUMN device_events.received_at        IS 'When our receiver wrote the row';
