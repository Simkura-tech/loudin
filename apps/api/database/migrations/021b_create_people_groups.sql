-- People groups — flat (non-hierarchical) groupings of people for access rules.
-- Examples: "Engineering staff", "After-hours cleaners", "VIPs".
-- A people_group can be referenced by access rules to grant whole-group
-- access to specific doors/shifts.
--
-- Renamed from the historical `user_groups` table since these groups bundle
-- door-access holders (people), not software users.

CREATE TABLE IF NOT EXISTS people_groups (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX idx_people_groups_name_per_company
    ON people_groups(company_id, name)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_people_groups_company_id ON people_groups(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_people_groups_deleted_at ON people_groups(deleted_at) WHERE deleted_at IS NOT NULL;

-- Attach group reference to people
ALTER TABLE people ADD COLUMN group_id INTEGER REFERENCES people_groups(id) ON DELETE SET NULL;
CREATE INDEX idx_people_group_id ON people(group_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE people_groups IS 'Flat groupings of people (credential holders) for access-rule bundling';
