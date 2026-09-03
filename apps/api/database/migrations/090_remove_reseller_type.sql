-- 090_remove_reseller_type.sql
-- Remove the reseller company tier. Loudin now has two company types only:
-- 'platform' (the operator — a software provider or a single company) and
-- 'end_user' (customer companies). The middle "reseller" tier is gone; the
-- platform administers end-user companies directly.
--
-- Data handling (non-destructive):
--   * Any existing company_type='reseller' row is converted to 'end_user'
--     so no company, its users, or its devices are lost — a former reseller
--     simply becomes a normal customer company.
--   * parent_company_id / parent_locked_at only ever pointed at a reseller,
--     so they are cleared everywhere. The columns are kept (nullable, now
--     unused) to avoid rewriting the company-hierarchy queries; they are
--     available for a future generic parent/child relationship.
--   * The per-reseller Simkura routing columns (companies.simkura_api_key /
--     simkura_api_url) are dropped — the current release routes all device
--     traffic through the platform credentials, and there is no longer a
--     reseller to hold its own account.
--   * The device provenance columns devices.reseller_company_id /
--     reseller_code are dropped (only ever set by the seed; no runtime
--     reader).
--
-- Idempotent; safe on the production schema (INTEGER ids) and fresh installs.

-- 1. Convert reseller companies to end-users (before the CHECK is tightened).
UPDATE companies SET company_type = 'end_user', updated_at = NOW()
 WHERE company_type = 'reseller';

-- 2. Clear the reseller parent links.
UPDATE companies SET parent_company_id = NULL, parent_locked_at = NULL, updated_at = NOW()
 WHERE parent_company_id IS NOT NULL OR parent_locked_at IS NOT NULL;

-- 3. Tighten the company_type CHECK to the two remaining tiers.
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_company_type_check;
ALTER TABLE companies
  ADD CONSTRAINT companies_company_type_check
  CHECK (company_type IN ('platform', 'end_user'));

COMMENT ON COLUMN companies.company_type       IS 'Tenant tier: platform | end_user';
COMMENT ON COLUMN companies.parent_company_id  IS 'Reserved for a future parent/child company relationship. Unused since the reseller tier was removed (migration 090); always NULL.';

-- 4. Drop the per-reseller Simkura routing columns.
ALTER TABLE companies DROP COLUMN IF EXISTS simkura_api_key;
ALTER TABLE companies DROP COLUMN IF EXISTS simkura_api_url;

-- 5. Drop the device reseller provenance columns + their indexes.
DROP INDEX IF EXISTS idx_devices_reseller_company_id;
DROP INDEX IF EXISTS idx_devices_reseller_code;
ALTER TABLE devices DROP COLUMN IF EXISTS reseller_company_id;
ALTER TABLE devices DROP COLUMN IF EXISTS reseller_code;

DO $$
BEGIN
  RAISE NOTICE 'Migration 090: reseller tier removed — company_type is now platform | end_user';
END $$;
