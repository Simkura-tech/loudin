-- Migration 094: pending email-address change.
--
-- Changing your sign-in email is confirmed by a code sent to the NEW address
-- (controllers/auth/me.js → requestEmailChange / confirmEmailChange). The new
-- address is parked here until the code is entered; on confirm it moves into
-- users.email and this column is cleared. Nullable, no uniqueness — two users
-- may have the same pending_email in flight; the live-only unique index on
-- users.email (migration 093) is what actually prevents a collision, enforced
-- at the moment of confirm.

ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email VARCHAR(255);

-- The code confirming an email change is a new OTP purpose. verification_codes
-- (migration 043) pins the allowed purposes with a CHECK, so widen it to admit
-- 'verify_email_change' alongside the existing ones.
ALTER TABLE verification_codes DROP CONSTRAINT IF EXISTS verification_codes_purpose_check;
ALTER TABLE verification_codes ADD CONSTRAINT verification_codes_purpose_check
    CHECK (purpose IN ('login_2fa', 'password_reset', 'verify_email', 'verify_phone', 'verify_email_change'));
