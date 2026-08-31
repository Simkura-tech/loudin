-- 2FA + password reset support.
--
-- `verification_codes` holds short-lived one-time codes for:
--   - login_2fa       — second factor after password validates
--   - password_reset  — forgot-password flow
--   - verify_email    — confirming an email address (e.g. during 2FA enroll)
--   - verify_phone    — confirming a phone number (e.g. during 2FA enroll)
--
-- Codes are stored hashed (bcrypt). Each row tracks attempts so a brute-force
-- guess can be rate-limited. `used_at` marks single-use consumption.
--
-- Lifecycle: on issue we delete any prior (user_id, purpose) row that's
-- unconsumed, then INSERT a fresh one — so only one valid code per
-- (user, purpose) is in flight at a time.

CREATE TABLE IF NOT EXISTS verification_codes (
    id SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose     VARCHAR(50)  NOT NULL
        CHECK (purpose IN ('login_2fa', 'password_reset', 'verify_email', 'verify_phone')),
    channel     VARCHAR(20)  NOT NULL CHECK (channel IN ('email', 'sms')),
    destination VARCHAR(255) NOT NULL,
    code_hash   VARCHAR(255) NOT NULL,
    expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at     TIMESTAMP WITH TIME ZONE,
    attempts    INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_verification_codes_user_purpose
    ON verification_codes(user_id, purpose)
    WHERE used_at IS NULL;
CREATE INDEX idx_verification_codes_expires_at
    ON verification_codes(expires_at)
    WHERE used_at IS NULL;

COMMENT ON TABLE  verification_codes IS '6-digit OTPs for 2FA + password reset. Stored hashed.';
COMMENT ON COLUMN verification_codes.purpose      IS 'What this code unlocks';
COMMENT ON COLUMN verification_codes.destination  IS 'The email or phone we sent the code to — captured for audit';
COMMENT ON COLUMN verification_codes.attempts     IS 'Failed verify attempts; we throttle / lock after a small number';

-- ── users 2FA columns ─────────────────────────────────────────────────────────
ALTER TABLE users
    ADD COLUMN two_factor_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN two_factor_channel VARCHAR(20)
        CHECK (two_factor_channel IS NULL OR two_factor_channel IN ('email', 'sms'));

COMMENT ON COLUMN users.two_factor_enabled IS
    'True once the user has enrolled and confirmed a second factor.';
COMMENT ON COLUMN users.two_factor_channel IS
    'Which channel (email|sms) the user picked at enrollment.';
