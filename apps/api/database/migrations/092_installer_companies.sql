-- 092_installer_companies.sql
-- Installer companies + the grants that let them work inside customer
-- workspaces.
--
-- An installer is a cross-company technician business: it deploys and
-- services door systems for many end-user companies, but owns no doors of
-- its own. It is OPTIONAL — a customer with no installer looks exactly as
-- before. This is modelled as a third company_type plus a many-to-many
-- grant table, NOT as the old reseller parent pointer: a customer can have
-- several installers over time, the customer (or the platform on their
-- behalf) grants and revokes access, and nothing about ownership or billing
-- is implied. Revenue share for installers is handled outside core.
--
-- Access works by "service session": an installer user picks a customer and
-- receives a short-lived session token scoped to that customer company,
-- carrying an `impersonation` block that names the installer as the actor.
-- Tenant-scoped controllers work unchanged; the audit log records
-- on_behalf_of_company_id; routes/client/workspace.js keeps a few actions
-- (cancel subscription, invite users) customer-only via denyImpersonation.
-- Revoking a grant ends live sessions immediately — middleware/core/auth.js
-- re-checks the grant on every request made inside a service session.
--
-- User types are unchanged: Admin / User. An installer company's Admins are
-- admins in each customer workspace they enter; its Users are read-only.
--
-- Lifecycle of a grant: active (revoked_at IS NULL) or revoked. Re-granting
-- after a revoke inserts a new row so the history stays intact.

-- 1. Third company type.
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_company_type_check;
ALTER TABLE companies
  ADD CONSTRAINT companies_company_type_check
  CHECK (company_type IN ('platform', 'end_user', 'installer'));

-- 2. Grants.
CREATE TABLE IF NOT EXISTS installer_grants (
    id                    SERIAL PRIMARY KEY,
    installer_company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    customer_company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    granted_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    granted_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    revoked_at            TIMESTAMP WITH TIME ZONE,
    created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (installer_company_id <> customer_company_id)
);

CREATE INDEX IF NOT EXISTS idx_installer_grants_installer ON installer_grants(installer_company_id);
CREATE INDEX IF NOT EXISTS idx_installer_grants_customer  ON installer_grants(customer_company_id);

-- One ACTIVE grant per installer/customer pair.
CREATE UNIQUE INDEX IF NOT EXISTS idx_installer_grants_active
    ON installer_grants (installer_company_id, customer_company_id)
    WHERE revoked_at IS NULL;
