-- Device release audit — mirror of assigned_by/assigned_at for the reverse
-- direction.
--
-- When an end-user (or platform admin) "releases" a device, we soft-delete
-- it (deleted_at = NOW) so it stops counting toward subscription quantity.
-- These two columns capture who pressed the button and when, so the
-- devices list can render a "Deactivated by X on Y" line and so support
-- can answer "what happened to this device?" without trawling audit_log.
--
-- Pattern matches assigned_by from migration 009: plain INTEGER, no FK
-- (users can be soft-deleted and we don't want a release record to
-- disappear with them).

ALTER TABLE devices
    ADD COLUMN released_by INTEGER,
    ADD COLUMN released_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN devices.released_by IS
    'User id who released (soft-deleted) the device. Plain INTEGER — no FK, mirrors assigned_by.';
COMMENT ON COLUMN devices.released_at IS
    'Timestamp the device was released. Should equal deleted_at for rows released via the normal flow; differs only if a row was soft-deleted by some other path.';
