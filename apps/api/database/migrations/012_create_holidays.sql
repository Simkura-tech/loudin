-- Holidays table — calendar-driven access overrides.
-- A holiday defines a datetime range with a special access policy.
-- Application code can interpret "yearly recurring" via metadata or a future
-- column; we're starting with explicit datetime windows for simplicity.

CREATE TABLE IF NOT EXISTS holidays (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    holiday_name VARCHAR(255) NOT NULL,
    description  TEXT,

    start_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    end_datetime   TIMESTAMP WITH TIME ZONE NOT NULL,

    access_mode VARCHAR(50) DEFAULT 'locked'
        CHECK (access_mode IN ('open', 'restricted', 'locked')),
    custom_hours JSONB,                    -- optional override hours when access_mode='restricted'

    status VARCHAR(50) DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT valid_holiday_range CHECK (end_datetime >= start_datetime)
);

CREATE INDEX idx_holidays_company_id     ON holidays(company_id);
CREATE INDEX idx_holidays_start_datetime ON holidays(start_datetime);
CREATE INDEX idx_holidays_end_datetime   ON holidays(end_datetime);
CREATE INDEX idx_holidays_status         ON holidays(status);
CREATE INDEX idx_holidays_deleted_at     ON holidays(deleted_at) WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE  holidays              IS 'Calendar-driven access overrides for special days/ranges';
COMMENT ON COLUMN holidays.access_mode  IS 'open = full access; restricted = custom_hours only; locked = no access';
COMMENT ON COLUMN holidays.custom_hours IS 'Optional override hours JSON for access_mode=restricted';
