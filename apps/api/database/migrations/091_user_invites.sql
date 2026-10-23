-- 091_user_invites.sql
-- Invite flow for adding login users to an EXISTING company.
--
-- Until now every path that created a users row also created a company
-- (register, Google sign-in, scripts/create-admin.js), so a workspace could
-- never have more than its founding Admin. An invite lets an Admin add
-- further login users to their own company: the admin posts an email + role,
-- Loudin emails a single-use link, and the invitee finishes setup (name,
-- password, terms) on /invite/:token.
--
-- Token handling: only a SHA-256 hash of the URL token is stored, so a DB
-- read cannot be turned into a working invite link. Tokens expire (default
-- 7 days, enforced in services/auth/invites.js) and are consumed on accept.
--
-- Lifecycle (exactly one is true):
--   open      — accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
--   expired   — accepted_at IS NULL AND revoked_at IS NULL AND expires_at <= now()
--   revoked   — revoked_at IS NOT NULL   (also used when a newer invite
--               for the same email supersedes this one)
--   accepted  — accepted_at IS NOT NULL (accepted_user_id points at the user)
--
-- Users created from an invite are ordinary users rows — nothing else in the
-- schema changes. ON DELETE CASCADE on company_id keeps tenant deletion
-- simple; inviter/accepted user FKs are SET NULL so history survives.

CREATE TABLE IF NOT EXISTS user_invites (
    id                SERIAL PRIMARY KEY,
    company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email             VARCHAR(255) NOT NULL,
    first_name        VARCHAR(100),
    last_name         VARCHAR(100),
    user_type_id      INTEGER NOT NULL REFERENCES user_types(id) ON DELETE RESTRICT
        CHECK (user_type_id IN (1, 2)),
    token_hash        VARCHAR(64) NOT NULL UNIQUE,
    invited_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    expires_at        TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at       TIMESTAMP WITH TIME ZONE,
    accepted_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    revoked_at        TIMESTAMP WITH TIME ZONE,
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_invites_company_id ON user_invites(company_id);

-- One OPEN invite per email per company. Creating a new invite for the same
-- address first revokes (supersedes) the older open one, so this index is a
-- safety net against a race, not the primary dedupe path.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_invites_open_email
    ON user_invites (company_id, lower(email))
    WHERE accepted_at IS NULL AND revoked_at IS NULL;
