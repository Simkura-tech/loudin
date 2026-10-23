-- Migration 093: users.email unique among LIVE rows only.
--
-- Admins can now remove a login user (soft delete: users.deleted_at). The
-- original UNIQUE constraint on users.email would then keep the address
-- claimed forever, so the same colleague could never be invited back.
-- Every lookup by email already filters `deleted_at IS NULL`, so a partial
-- unique index preserves the guarantee that matters.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_live
    ON users (email)
    WHERE deleted_at IS NULL;
