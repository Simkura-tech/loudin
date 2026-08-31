-- =============================================================================
-- Loudin production seed — minimal bootstrap for a fresh prod database.
--
-- Run ONCE after migrations apply against a fresh prod database. Creates:
--   * one platform company (`Loudin Platform`, company_type='platform')
--   * one platform admin user (the first login)
--
-- It does NOT seed devices, end-user companies, resellers, credentials,
-- shifts, holidays, or any fixture data — those are dev-only.
--
-- This file is idempotent: every INSERT uses ON CONFLICT DO NOTHING or
-- "WHERE NOT EXISTS", so re-running won't duplicate records and is safe
-- if you're paranoid about whether it landed the first time.
--
-- -----------------------------------------------------------------------------
-- BEFORE YOU RUN — pass the bcrypt hash via `psql -v` at runtime so it
-- never lives in this file or in git history.
--
-- 1. Generate the bcrypt hash on the API VM (where bcryptjs is installed
--    via apps/api/node_modules — same lib the auth code will use):
--
--      cd /opt/loudin/apps/api
--      node -e "console.log(require('bcryptjs').hashSync('your-password', 12))"
--
-- 2. Apply the seed, passing the hash through -v. Note the doubled quotes
--    around the value — psql needs the SQL-string quotes to come through
--    the variable as-is:
--
--      set -a; source /opt/loudin/apps/api/.env; set +a
--      HASH=$(cd /opt/loudin/apps/api && \
--             node -e "console.log(require('bcryptjs').hashSync('your-password', 12))")
--      PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" \
--        -v "ADMIN_PW_HASH=$HASH" \
--        -f /opt/loudin/apps/api/database/seeds/prod-seed.sql
--      unset HASH
--
-- The seed file's default ADMIN_PW_HASH below is an unusable placeholder
-- on purpose — if you ever run the file WITHOUT -v, the seed will create
-- the admin record but nobody can log in with that hash. That's a safety
-- net, not a bug.
-- =============================================================================

-- Defaults below use the "set only if not already passed via -v" pattern
-- (\if :{?VAR} … \endif) so a -v override on the command line actually
-- takes precedence. Without the guard, a hard \set in the file would
-- clobber whatever -v passed.
--
-- ADMIN_EMAIL is fine to keep in the repo (not secret).
-- ADMIN_PW_HASH MUST be overridden via -v — the default below is an
-- unusable placeholder, on purpose.

\if :{?ADMIN_EMAIL}     \else \set ADMIN_EMAIL    admin@example.com \endif
\if :{?ADMIN_FIRST}     \else \set ADMIN_FIRST    Admin \endif
\if :{?ADMIN_LAST}      \else \set ADMIN_LAST     User \endif
\if :{?ADMIN_PW_HASH}   \else \set ADMIN_PW_HASH  $2a$12$PLACEHOLDER_DO_NOT_COMMIT_REAL_HASH_HERE_PASS_VIA_PSQL_v_FLAG \endif
\if :{?COMPANY_NAME}    \else \set COMPANY_NAME   Loudin Platform \endif
\if :{?COMPANY_EMAIL}   \else \set COMPANY_EMAIL  admin@example.com \endif

BEGIN;

-- 1. Platform company. Only one row should exist with company_type='platform'.
INSERT INTO companies (name, company_type, status, company_email)
SELECT :'COMPANY_NAME', 'platform', 'active', :'COMPANY_EMAIL'
 WHERE NOT EXISTS (
   SELECT 1 FROM companies
    WHERE company_type = 'platform' AND deleted_at IS NULL
 );

-- 2. Platform admin user. user_type_id=1 (Admin, from migration 002).
--    email_verified=true so when the auth rebuild enforces it, this account
--    isn't blocked at login.
INSERT INTO users (
    company_id, user_type_id,
    email, first_name, last_name,
    password_hash,
    email_verified, email_verified_at,
    status
)
SELECT
    (SELECT id FROM companies
      WHERE company_type = 'platform' AND deleted_at IS NULL
      LIMIT 1),
    1,
    :'ADMIN_EMAIL', :'ADMIN_FIRST', :'ADMIN_LAST',
    :'ADMIN_PW_HASH',
    true, NOW(),
    'active'
ON CONFLICT (email) DO NOTHING;

-- 3. Sanity check — fail loud if either record is missing after the inserts.
DO $$
DECLARE
    company_count INT;
    admin_count   INT;
BEGIN
    SELECT COUNT(*) INTO company_count FROM companies
     WHERE company_type = 'platform' AND deleted_at IS NULL;
    SELECT COUNT(*) INTO admin_count FROM users u
      JOIN companies c ON c.id = u.company_id
     WHERE c.company_type = 'platform'
       AND u.user_type_id = 1
       AND u.deleted_at IS NULL;

    IF company_count = 0 THEN
        RAISE EXCEPTION 'prod-seed: platform company was not created';
    END IF;
    IF admin_count = 0 THEN
        RAISE EXCEPTION 'prod-seed: platform admin user was not created — check ADMIN_EMAIL/ADMIN_PW_HASH';
    END IF;

    RAISE NOTICE 'prod-seed OK — % platform company, % platform admin user(s)',
                 company_count, admin_count;
END $$;

COMMIT;
