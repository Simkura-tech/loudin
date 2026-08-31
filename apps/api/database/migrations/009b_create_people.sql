-- People table — credential holders for door access.
-- Distinct from `users`: people have NO software login. They exist solely so
-- their identity can own access credentials (PINs, cards, biometric IDs).
--
-- Originally created in the historical migration 022; moved here so the
-- credentials table (010) can reference people directly without needing a
-- transitional user_id → person_id migration.

CREATE TABLE IF NOT EXISTS people (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    first_name   VARCHAR(100) NOT NULL,
    last_name    VARCHAR(100) NOT NULL,
    email        VARCHAR(255),                          -- contact only, NOT for authentication
    phone_number VARCHAR(50),
    employee_id  VARCHAR(100),                          -- external badge / HR employee ID
    department   VARCHAR(255),
    job_title    VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'suspended')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_people_company_id ON people(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_people_status     ON people(status)     WHERE deleted_at IS NULL;
CREATE INDEX idx_people_employee   ON people(company_id, employee_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_people_deleted_at ON people(deleted_at) WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE  people       IS 'Door-access credential holders. Distinct from users (no software login).';
COMMENT ON COLUMN people.email IS 'Contact email only — NOT used for authentication';
