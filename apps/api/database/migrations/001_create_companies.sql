-- Companies table (Multi-tenant)
-- Each company is a separate tenant. company_type discriminates what kind:
--   'platform' — the Loudin platform itself (one row)
--   'end_user' — customer companies that own and use the locks
--   'reseller' — partner companies that manage end-user companies on the platform
--
-- TODO (GTM/funnel tracking): the companies table is the planned home for
-- go-to-market analytics — acquisition channel, referrer/UTM attribution,
-- lifecycle stage, trial→paid conversion timestamps, churn timestamp/reason.
-- Add these in a later migration once the metrics we want to instrument are
-- defined.
--
-- TODO (prospects): we'll also track sales leads / interested-but-not-signed-up
-- contacts. The plan is a separate `prospects` table (not part of `companies`)
-- so the sales-funnel concept stays distinct from active tenants. Added later
-- when we start instrumenting the funnel. The fields here are intentionally minimal so the foundational
-- schema doesn't have to absorb assumptions about the funnel.

CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    company_type VARCHAR(50) NOT NULL CHECK (company_type IN ('platform', 'end_user', 'reseller')),
    status VARCHAR(50) DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'suspended', 'canceled')),
    company_email VARCHAR(255),
    company_phone VARCHAR(50),
    company_url   VARCHAR(500),

    -- Structured address (replaces single TEXT address column)
    street  VARCHAR(255),
    city    VARCHAR(100),
    state   VARCHAR(100),
    zip     VARCHAR(20),
    country VARCHAR(100),

    -- Simkura API integration. Per-reseller credentials route that reseller's
    -- devices through their own Simkura account; NULL falls back to platform
    -- env-var credentials.
    simkura_api_key TEXT,
    simkura_api_url VARCHAR(500),

    -- An end_user company is "locked" to a reseller company on first device
    -- provisioning. parent_company_id points to that reseller (also a row in
    -- this table, with company_type='reseller'). NULL means unaffiliated /
    -- direct platform customer.
    parent_company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    parent_locked_at  TIMESTAMP WITH TIME ZONE,

    -- Admin-action audit trails. *_by columns are plain INTEGER, not FK to
    -- users(id), so the audit record survives if the acting user is later
    -- deleted. Validation lives in application code.
    suspended_at      TIMESTAMP WITH TIME ZONE,
    suspended_by      INTEGER,
    suspension_reason TEXT,
    reactivated_at    TIMESTAMP WITH TIME ZONE,
    reactivated_by    INTEGER,
    canceled_at       TIMESTAMP WITH TIME ZONE,
    canceled_by       INTEGER,
    cancellation_reason TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_companies_status        ON companies(status);
CREATE INDEX idx_companies_company_type  ON companies(company_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_parent_id     ON companies(parent_company_id) WHERE parent_company_id IS NOT NULL;
CREATE INDEX idx_companies_suspended_at  ON companies(suspended_at)      WHERE suspended_at IS NOT NULL;
CREATE INDEX idx_companies_canceled_at   ON companies(canceled_at)       WHERE canceled_at IS NOT NULL;

COMMENT ON TABLE  companies                    IS 'Multi-tenant companies/organizations on the platform';
COMMENT ON COLUMN companies.company_type       IS 'Tenant tier: platform | end_user | reseller';
COMMENT ON COLUMN companies.parent_company_id  IS 'For end_user companies: the reseller they are locked to (a row in this table with company_type=reseller). Set on first device provision.';
COMMENT ON COLUMN companies.parent_locked_at   IS 'When the parent (reseller) relationship was established';
COMMENT ON COLUMN companies.deleted_at         IS 'Soft delete timestamp — null means active';
