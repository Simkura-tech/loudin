-- Shifts table — time-based access control rules.
-- A shift defines a recurring time window (e.g. Mon–Fri 09:00–17:00). It's
-- attached to credentials/devices via later junction tables to determine when
-- a credential is allowed to open a door.
--
-- Cross-midnight shifts (10pm–6am) are handled implicitly by start_time >
-- end_time; the application code interprets the wrap.

CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    shift_name  VARCHAR(255) NOT NULL,
    description TEXT,

    start_time   TIME NOT NULL,            -- daily start, e.g. 09:00
    end_time     TIME NOT NULL,            -- daily end, e.g. 17:00
    days_of_week JSONB DEFAULT '[]',       -- array of day numbers, 0=Sunday … 6=Saturday

    valid_from   DATE,                     -- optional date-range start for limited-time shifts
    valid_until  DATE,

    status VARCHAR(50) DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_shifts_company_id ON shifts(company_id);
CREATE INDEX idx_shifts_status     ON shifts(status);
CREATE INDEX idx_shifts_deleted_at ON shifts(deleted_at) WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE  shifts              IS 'Recurring time-based access windows';
COMMENT ON COLUMN shifts.days_of_week IS 'JSON array of day numbers (0=Sun … 6=Sat) the shift applies to';
COMMENT ON COLUMN shifts.start_time   IS 'Daily window start. If start_time > end_time the window spans midnight.';
COMMENT ON COLUMN shifts.valid_until  IS 'Optional end date for limited-time shifts (NULL = open-ended)';
