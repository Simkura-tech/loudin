-- Users table — software users with logins.
-- Credential holders for door access only (no software login) live in the
-- `people` table (see migration 009b), not here.
--
-- Auth model (rebuilt 2026-05-12):
--   * Email + password is the initial flow. password_hash holds a bcrypt hash.
--   * email_verified flips true once the user clicks a verification link.
--     For now there is no mailer wired, so registration sets it to false and
--     login does NOT block on it. Enforce later, once Resend is back.
--   * phone_verified is the symmetric flag for the planned phone-based auth
--     (see TODO below). phone_number itself was already on this table.
--
-- TODO (dual-auth): users will be able to register / log in with a phone
-- number instead of email. phone_number already exists; phone_verified columns
-- are added now so future code doesn't need a migration. The /api/auth/login
-- contract will need to branch on identifier type at that point.
--
-- TODO (google-oauth): adding Google sign-in will need either an
-- `auth_providers` table (provider, provider_user_id, refresh_token, …) or
-- columns directly on this table (google_id, google_email). Deferring the
-- shape decision until we implement it. Note that OAuth users may not have a
-- password_hash at all — make password_hash NULLABLE so a Google-only account
-- is representable without a placeholder.

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_type_id INTEGER NOT NULL REFERENCES user_types(id) ON DELETE RESTRICT
        CHECK (user_type_id IN (1, 2)),
    email        VARCHAR(255) NOT NULL UNIQUE,
    first_name   VARCHAR(100) NOT NULL,
    last_name    VARCHAR(100) NOT NULL,
    phone_number VARCHAR(50),

    -- Auth credentials. NULLABLE because future OAuth-only accounts may have
    -- no local password.
    password_hash VARCHAR(255),

    -- Verification flags (recorded but not enforced yet — no mailer/SMS).
    email_verified    BOOLEAN DEFAULT false,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    phone_verified    BOOLEAN DEFAULT false,
    phone_verified_at TIMESTAMP WITH TIME ZONE,

    status VARCHAR(50) DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'suspended', 'pending')),
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_status     ON users(status);
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE  users               IS 'Software users (with logins). Credential-only people live in the people table.';
COMMENT ON COLUMN users.company_id    IS 'Tenant the user belongs to';
COMMENT ON COLUMN users.user_type_id  IS 'Role tier — 1 Admin, 2 User. Sub-types via company.company_type.';
COMMENT ON COLUMN users.password_hash IS 'bcrypt hash. NULL means no local password (e.g. OAuth-only account).';
