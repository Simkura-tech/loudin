-- device_events.simkura_webhook_id was declared INTEGER, but the actual
-- value Simkura sends in webhook payloads is a UUID (e.g.
-- "4cc0ca69-d7fb-41f9-a6cd-9c826ad330ec"). Result: every inbound
-- webhook insert was failing with code 22P02:
--   invalid input syntax for type integer: "<uuid>"
--
-- The receiver acks Simkura 200 BEFORE running the insert (see
-- routes/webhooks.js — Simkura wants <10s ACK), so the failures were
-- silent: no Simkura retries, but no rows landing in our DB either.
-- Discovered during 2026-05-21 prod log triage.
--
-- Widen the column to VARCHAR(80) to match the symmetry with
-- simkura_event_id (VARCHAR(100)) and to accept UUIDs / any future
-- identifier format Simkura adopts. USING clause handles the cast for
-- any existing rows (in practice the column is all NULL since every
-- insert with a real value was rejected).

ALTER TABLE device_events
    ALTER COLUMN simkura_webhook_id TYPE VARCHAR(80)
    USING simkura_webhook_id::TEXT;

COMMENT ON COLUMN device_events.simkura_webhook_id IS
    'Webhook-delivery identifier supplied by Simkura. UUID-shaped today; stored as VARCHAR for resilience to future format changes.';
