-- Add google_id to users for Google OAuth sign-in.
--
-- Nullable: existing email+password users have no Google account linked.
-- Unique: one Google account maps to at most one Loudin user.
--
-- password_hash was already made NULLABLE in migration 003 in anticipation
-- of OAuth-only accounts (see the TODO comment there). No change needed.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;

COMMENT ON COLUMN users.google_id IS
  'Google sub (subject) identifier — set when the user signs in via Google OAuth. NULL for password-only accounts.';

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL;
