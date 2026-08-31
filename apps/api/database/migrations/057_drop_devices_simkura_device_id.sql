-- Drop devices.simkura_device_id.
--
-- The hardware `device_id` is the single canonical identifier for a device
-- (see feedback-device-id-canonical). Simkura's internal row UUID was being
-- mirrored into this column but never load-bearing: nothing joins on it,
-- the command path uses device_id in the URL, and the platform-fleet merge
-- pairs by hardware id. Keeping the column was just a footgun where future
-- code might accidentally start using Simkura's UUID as a reference.

ALTER TABLE devices DROP COLUMN IF EXISTS simkura_device_id;
